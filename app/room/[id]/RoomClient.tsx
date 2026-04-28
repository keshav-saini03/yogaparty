'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { Player, type PlayerHandle } from '@/components/room/Player';
import { RoomHeader } from '@/components/room/RoomHeader';
import { PresenceList } from '@/components/room/PresenceList';
import { Chat } from '@/components/room/Chat';
import { VideoPickerSheet } from '@/components/room/VideoPickerSheet';
import { usePresence } from '@/hooks/usePresence';
import { useRoomSync } from '@/hooks/useRoomSync';
import type { ChatMsg } from '@/lib/room-types';
import { CURATED_VIDEOS } from '@/lib/videos';
import { pickVideo } from '@/app/actions/pick-video';
import { bumpRoomActivity, closeRoomIfStale } from '@/app/actions/room-activity';
import { WhatsAppShareButton } from '@/components/share/WhatsAppShareButton';
import { postSignupCopy } from '@/lib/whatsapp';
import {
  correctedTimestamp,
  dedupePresence,
  pickCorrection,
  shouldCorrect,
  type Participant,
} from '@/lib/sync-utils';
import { pickInitiator } from '@/lib/webrtc-utils';
import { useCall } from '@/hooks/useCall';
import { useAudioDuck } from '@/hooks/useAudioDuck';
import { usePeerConnections } from '@/hooks/usePeerConnections';
import { CallDock, type TileVm } from '@/components/room/CallDock';
import { StartTalkingButton } from '@/components/room/StartTalkingButton';
import {
  isOfferPayload,
  isAnswerPayload,
  isIcePayload,
  isCallEndPayload,
} from '@/lib/webrtc-events';

type Props = {
  roomId: string;
  roomCity: string | null;
  initialVideoId: string | null;
  self: { user_id: string; name: string; city: string | null };
};

// Heartbeat cadence — viewers report currentTime, host evaluates drift.
// 2s strikes a balance between bandwidth and how long sub-threshold drift
// can hide before being corrected.
const HEARTBEAT_INTERVAL_MS = 2_000;
// Drift over this many seconds triggers a correction. Tighter than the
// historical 2s default — combined with rate-based smoothing below, the
// correction itself is mostly imperceptible.
const DRIFT_THRESHOLD_SEC = 0.5;

export function RoomClient({ roomId, roomCity, initialVideoId, self }: Props) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [videoId, setVideoId] = useState<string | null>(initialVideoId);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const playerRef = useRef<PlayerHandle | null>(null);
  const suppressNextOutboundRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  // Tracks the in-flight rate-nudge so we can revert to 1.0× when it ends.
  // null = no nudge active.
  const rateRevertTimerRef = useRef<number | null>(null);
  // Host's last broadcast play/pause intent (1=playing, 2=paused). Used by
  // viewer's <Player /> to force-correct any local divergence (e.g. user
  // clicked the iframe through DevTools / keyboard).
  const [enforceState, setEnforceState] = useState<number | null>(null);

  // Refs that listeners read so we don't have to re-register them on each
  // re-render (Supabase forbids `.on(...)` after `.subscribe()`).
  const isHostRef = useRef(false);
  const selfIdRef = useRef(self.user_id);
  selfIdRef.current = self.user_id;
  // Mirrors useCall's on_call_intent so the SUBSCRIBED handler can track
  // with the current value on (re)connect. Without this, reconnects reset
  // server-side presence to false and peers never see us as on-call.
  const callIntentRef = useRef(false);

  const { hostId, isHost, host } = usePresence(participants, self);
  isHostRef.current = isHost;

  // ── WebRTC overlay wiring ────────────────────────────────────
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map()
  );
  const callStreamRef = useRef<MediaStream | null>(null);

  // Mirror of the Player's slider value. Lifted to RoomClient so the auto-
  // duck ceiling tracks the actual user setting instead of a constant. The
  // Player still owns its slider state and reports up via onVolumeChange;
  // we just mirror it here.
  const [userVolume, setUserVolume] = useState<number>(80);

  // Derived: who in presence is currently on call (excluding self).
  const peersOnCall = useMemo(
    () =>
      participants
        .filter((p) => p.user_id !== self.user_id && p.on_call_intent)
        .map((p) => p.user_id),
    [participants, self.user_id]
  );

  const audioDuck = useAudioDuck({ userVolume });

  const peers = usePeerConnections({
    selfId: self.user_id,
    channel,
    getLocalStream: () => callStreamRef.current,
    onRemoteStream: (peerId, stream) => {
      console.log('[rtc] onRemoteStream', { peer: peerId, tracks: stream.getTracks().length });
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(peerId, stream);
        return next;
      });
      audioDuck.attachPeer(peerId, stream);
    },
    onPeerDropped: (peerId) => {
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
      audioDuck.detachPeer(peerId);
    },
  });

  // Stash latest peers in a ref so the realtime channel listeners (registered
  // once before subscribe) always dispatch to the current callbacks.
  const peersRef = useRef(peers);
  peersRef.current = peers;

  const call = useCall({
    selfId: self.user_id,
    selfName: self.name,
    selfCity: self.city,
    selfJoinedAt: Date.now(),
    channel,
    peersOnCall: () => peersOnCall,
    onCreateOfferTo: peers.createOfferTo,
    onReplaceVideo: peers.replaceVideoTrackEverywhere,
    onClosePeer: peers.closePeer,
    onCloseAll: peers.closeAll,
    onStreamAcquired: (stream) => {
      // SYNC update of callStreamRef — closes the race where a remote
      // offer arrives between getUserMedia resolving and the useEffect-
      // based callStreamRef bridge firing. Without this, buildPc would
      // read getLocalStream() === null and answer with empty senders, so
      // the offerer never gets ontrack from this peer (one-way media).
      callStreamRef.current = stream;
      // Also late-attach to any PCs that were built before the stream was
      // acquired (the original inbound-offer-before-permission race).
      void peers.attachLocalStream(stream);
    },
    onCallIntentChange: (intent) => {
      callIntentRef.current = intent;
    },
  });

  // Keep `getLocalStream` returning the latest stream after `useCall` acquires it.
  useEffect(() => {
    callStreamRef.current = call.getStream();
    console.log('[rtc] callStreamRef sync', {
      state: call.state,
      hasStream: !!callStreamRef.current,
    });
    // The three primitive deps cover every state transition that can change
    // what getStream() returns; `call` itself is a fresh object each render
    // and would just thrash this effect to no effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.state, call.micEnabled, call.camEnabled]);

  // ── Mesh formation: single source of truth ────────────────────────
  // Two effects, same predicate:
  //   1. Eager: react to peersOnCall changes immediately (new joiner case).
  //   2. Periodic: tick every 10 s to recover from PCs that died (ICE
  //      failure dropped the slot, missed webrtc_call_end, etc.).
  //
  // Both gate on `peers.peerIds()` — we only initiate to peers who have
  // *no* PC yet. This prevents the double-offer race that wedges PCs and
  // also prevents the reconciliation from re-negotiating healthy ones.
  const initiateMissingPeers = useCallback(() => {
    const existing = new Set(peers.peerIds());
    console.log('[rtc] initiateMissingPeers', {
      self: self.user_id,
      peersOnCall,
      existing: [...existing],
    });
    for (const peerId of peersOnCall) {
      if (existing.has(peerId)) continue;
      const initiate = pickInitiator(self.user_id, peerId);
      console.log('[rtc] decide', { self: self.user_id, peer: peerId, initiate });
      if (!initiate) continue;
      void peers.createOfferTo(peerId);
    }
  }, [peers, peersOnCall, self.user_id]);

  useEffect(() => {
    if (call.state !== 'on-call') return;
    initiateMissingPeers();
  }, [call.state, peersOnCall, initiateMissingPeers]);

  useEffect(() => {
    if (call.state !== 'on-call') return;
    const id = window.setInterval(initiateMissingPeers, 10_000);
    return () => window.clearInterval(id);
  }, [call.state, initiateMissingPeers]);

  const {
    emitPlayerEvent,
    broadcastVideoChange,
    broadcastChat,
    suppressNextOutbound,
  } = useRoomSync({
    channel,
    isHost,
    selfId: self.user_id,
    selfName: self.name,
  });

  // Open + lifecycle the realtime channel. ALL `.on()` calls happen here,
  // BEFORE `.subscribe()` — Supabase enforces this ordering.
  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`room:${roomId}`, {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: self.user_id },
      },
    });

    // ── Presence ─────────────────────────────────────────────────
    const syncPresence = () => {
      const state = ch.presenceState() as unknown as Record<
        string,
        Participant[]
      >;
      const deduped = dedupePresence(state);
      console.log(
        '[rtc] presence sync',
        deduped.map((p) => ({ uid: p.user_id, intent: p.on_call_intent }))
      );
      setParticipants(deduped);
    };
    ch.on('presence', { event: 'sync' }, syncPresence);
    ch.on('presence', { event: 'join' }, syncPresence);
    ch.on('presence', { event: 'leave' }, syncPresence);

    // ── Chat ─────────────────────────────────────────────────────
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
      setMessages((prev) => [...prev, payload as ChatMsg]);
    });

    // ── Video swap ───────────────────────────────────────────────
    ch.on('broadcast', { event: 'video_change' }, ({ payload }) => {
      const next = (payload as { videoId: string }).videoId;
      suppressNextOutboundRef.current = true;
      setVideoId(next);
    });

    // ── Sync events ──────────────────────────────────────────────
    // Compensate transit time: the host snapshotted `timestamp` at `sentAt`,
    // so on receipt the equivalent host position is `timestamp + (now -
    // sentAt) / 1000`. This collapses the steady-state lag from ~½ RTT to
    // the tens of milliseconds it takes us to issue a seek/play call.
    const expectedFromPayload = (p: { timestamp: number; sentAt?: number }) => {
      const transitSec = p.sentAt
        ? Math.max(0, (Date.now() - p.sentAt) / 1000)
        : 0;
      return p.timestamp + transitSec;
    };

    ch.on('broadcast', { event: 'sync_play' }, ({ payload }) => {
      const p = payload as { timestamp: number; sentAt?: number };
      setEnforceState(1); // YT_PLAYING — viewers will be forced back if they pause
      if (!playerRef.current) return;
      suppressNextOutboundRef.current = true;
      playerRef.current.seekTo(expectedFromPayload(p), true);
      playerRef.current.play();
    });

    ch.on('broadcast', { event: 'sync_pause' }, ({ payload }) => {
      const p = payload as { timestamp: number; sentAt?: number };
      setEnforceState(2); // YT_PAUSED — viewers will be forced back if they play
      if (!playerRef.current) return;
      suppressNextOutboundRef.current = true;
      playerRef.current.pause();
      // For pause we use the raw timestamp — adding transit time would put
      // the viewer slightly past where the host actually stopped.
      playerRef.current.seekTo(p.timestamp, true);
    });

    ch.on('broadcast', { event: 'sync_seek' }, ({ payload }) => {
      const p = payload as { timestamp: number; sentAt?: number };
      if (!playerRef.current) return;
      suppressNextOutboundRef.current = true;
      playerRef.current.seekTo(expectedFromPayload(p), true);
    });

    ch.on('broadcast', { event: 'sync_correct' }, ({ payload }) => {
      const p = payload as {
        target_user_id: string;
        timestamp: number;
        sentAt?: number;
      };
      if (p.target_user_id !== selfIdRef.current) return;
      if (!playerRef.current) return;

      const expected = expectedFromPayload(p);
      const drift = expected - playerRef.current.getCurrentTime();
      const correction = pickCorrection(drift);

      if (correction.kind === 'none') return;

      cooldownUntilRef.current = Date.now() + 1500;

      if (correction.kind === 'seek') {
        suppressNextOutboundRef.current = true;
        playerRef.current.seekTo(expected, true);
        return;
      }

      // Smooth correction: bend playback rate for `durationMs`, then revert.
      // We never compound nudges — clear any in-flight timer first.
      if (rateRevertTimerRef.current !== null) {
        window.clearTimeout(rateRevertTimerRef.current);
      }
      playerRef.current.setPlaybackRate(correction.rate);
      rateRevertTimerRef.current = window.setTimeout(() => {
        playerRef.current?.setPlaybackRate(1);
        rateRevertTimerRef.current = null;
      }, correction.durationMs);
    });

    ch.on('broadcast', { event: 'heartbeat' }, ({ payload }) => {
      const p = payload as {
        user_id: string;
        currentTime: number;
        sentAt: number;
      };
      // Only host evaluates drift.
      if (!isHostRef.current) return;
      if (!playerRef.current) return;
      if (p.user_id === selfIdRef.current) return;

      // Project the viewer's reported time forward by transit so we compare
      // apples to apples (the report was snapshotted ~½ RTT ago).
      const transitSec = p.sentAt
        ? Math.max(0, (Date.now() - p.sentAt) / 1000)
        : 0;
      const viewerTime = p.currentTime + transitSec;
      const hostTime = playerRef.current.getCurrentTime();

      if (shouldCorrect(hostTime, viewerTime, DRIFT_THRESHOLD_SEC)) {
        ch.send({
          type: 'broadcast',
          event: 'sync_correct',
          payload: {
            target_user_id: p.user_id,
            // Add the standard lookahead so viewer's seek lands on the host
            // by the time the packet arrives. For rate-nudges, the viewer
            // recomputes drift on receipt — the lookahead just tightens the
            // seek case.
            timestamp: correctedTimestamp(hostTime),
            sentAt: Date.now(),
          },
        });
      }
    });

    // ── WebRTC signaling ─────────────────────────────────────────
    ch.on('broadcast', { event: 'webrtc_offer' }, ({ payload }) => {
      if (!isOfferPayload(payload)) return;
      if (payload.to !== selfIdRef.current) return;
      void peersRef.current.handleOffer(payload);
    });

    ch.on('broadcast', { event: 'webrtc_answer' }, ({ payload }) => {
      if (!isAnswerPayload(payload)) return;
      if (payload.to !== selfIdRef.current) return;
      void peersRef.current.handleAnswer(payload);
    });

    ch.on('broadcast', { event: 'webrtc_ice' }, ({ payload }) => {
      if (!isIcePayload(payload)) return;
      if (payload.to !== selfIdRef.current) return;
      void peersRef.current.handleIce(payload);
    });

    ch.on('broadcast', { event: 'webrtc_call_end' }, ({ payload }) => {
      if (!isCallEndPayload(payload)) return;
      peersRef.current.closePeer(payload.from);
    });

    // ── Subscribe + track presence on each (re)connect ───────────
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track with the CURRENT on_call_intent. Hard-coding `false` here
        // creates a race: any user-initiated track({on_call_intent: true})
        // queued before SUBSCRIBED gets clobbered by this default, and any
        // websocket reconnect after going on-call resets server-side
        // presence to false → other peers never see us as on-call.
        const intent = callIntentRef.current;
        console.log('[rtc] subscribe → track', { intent });
        await ch.track({
          user_id: self.user_id,
          name: self.name,
          city: self.city,
          joined_at: Date.now(),
          on_call_intent: intent,
        });
        setIsReady(true);
      }
    });

    setChannel(ch);

    return () => {
      setIsReady(false);
      ch.untrack().catch(() => {});
      ch.unsubscribe().catch(() => {});
      sb.removeChannel(ch);
      // Best-effort: ask the server to soft-delete this room if nobody else
      // bumped activity recently (>90s). No-op for auto-city rooms (which
      // have title IS NULL). Fire-and-forget; ignore failures.
      closeRoomIfStale(roomId).catch(() => {});
      // Cancel any pending rate-revert and put playback back to normal.
      if (rateRevertTimerRef.current !== null) {
        window.clearTimeout(rateRevertTimerRef.current);
        rateRevertTimerRef.current = null;
      }
      try {
        playerRef.current?.setPlaybackRate(1);
      } catch {
        /* player may already be torn down */
      }
    };
  }, [roomId, self.user_id, self.name, self.city]);

  // Activity bump: mark this room "alive" on mount and every 60s while open.
  // Powers the /rooms directory TTL filter (rooms quiet for >3 min vanish).
  useEffect(() => {
    if (!isReady) return;
    bumpRoomActivity(roomId).catch(() => {});
    const id = window.setInterval(() => {
      bumpRoomActivity(roomId).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(id);
  }, [roomId, isReady]);

  // Heartbeat ticker — every client sends `heartbeat` at HEARTBEAT_INTERVAL_MS
  // (currently 2s). The host (registered above) projects each viewer's
  // currentTime forward by transit time and emits sync_correct on drift past
  // DRIFT_THRESHOLD_SEC (currently 0.5s). cooldownUntilRef is bumped whenever
  // this client applies a correction so we don't tight-loop on a slow seek.
  useEffect(() => {
    if (!channel || !isReady) return;
    const tick = () => {
      if (Date.now() < cooldownUntilRef.current) return;
      const t = playerRef.current?.getCurrentTime?.() ?? 0;
      channel.send({
        type: 'broadcast',
        event: 'heartbeat',
        payload: {
          user_id: self.user_id,
          currentTime: t,
          sentAt: Date.now(),
        },
      });
    };
    const id = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [channel, isReady, self.user_id]);

  // Auto-open picker for host on first arrival to a video-less room.
  useEffect(() => {
    if (isHost && !videoId) setPickerOpen(true);
  }, [isHost, videoId]);

  // Show post-signup share banner once per browser per signup id.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `yp_welcome_seen_${self.user_id}`;
    if (window.localStorage.getItem(key) === '1') return;
    setWelcomeOpen(true);
  }, [self.user_id]);

  const dismissWelcome = () => {
    setWelcomeOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`yp_welcome_seen_${self.user_id}`, '1');
    }
  };

  const onPickVideo = async (id: string) => {
    setPickError(null);
    setPickerOpen(false);
    suppressNextOutbound();
    setVideoId(id);
    broadcastVideoChange(id);
    const result = await pickVideo(roomId, id);
    if ('error' in result) setPickError(result.error);
  };

  const onChatSend = (text: string) => {
    const msg = broadcastChat(text);
    if (msg) setMessages((prev) => [...prev, msg]);
  };

  const onPlayerEvent = (
    name: 'play' | 'pause' | 'seek',
    currentTime: number
  ) => {
    if (suppressNextOutboundRef.current) {
      suppressNextOutboundRef.current = false;
      return;
    }
    emitPlayerEvent(name, currentTime);
  };

  const currentVideoMeta = useMemo(
    () => (videoId ? CURATED_VIDEOS.find((v) => v.id === videoId) : null),
    [videoId]
  );

  const selfTile: TileVm | null =
    call.state === 'on-call'
      ? {
          peerId: self.user_id,
          name: self.name,
          city: self.city,
          micOn: call.micEnabled,
          camOn: call.camEnabled,
          isLocal: true,
          isSpeaking: false,
          stream: call.getStream(),
        }
      : null;

  const peerTiles: TileVm[] = participants
    .filter((p) => p.user_id !== self.user_id && remoteStreams.has(p.user_id))
    .map((p) => ({
      peerId: p.user_id,
      name: p.name,
      city: p.city,
      micOn: true, // we don't broadcast per-track state today; assume on
      camOn: true, // ditto — tile renders monogram fallback if no video frames
      isLocal: false,
      isSpeaking: audioDuck.isSpeaking(p.user_id),
      stream: remoteStreams.get(p.user_id) ?? null,
    }));

  const dockEmpty = call.state === 'idle' && peerTiles.length === 0;

  const welcomeShareText = postSignupCopy({
    cityCount: participants.length,
    cityName: roomCity,
    refId: self.user_id,
  });

  // Suppress unused-host warning while keeping it accessible if needed.
  void host;

  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--bg)]">
      <RoomHeader
        city={roomCity}
        participantCount={participants.length}
        selfId={self.user_id}
        onChatToggle={() => setChatOpen((v) => !v)}
        isMobileChatOpen={chatOpen}
      />

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col gap-4 p-4 sm:p-6">
            {welcomeOpen && (
              <div className="rise relative border border-[#19d27a] bg-[rgba(25,210,122,0.08)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[#19d27a]">
                    You&apos;re tuned in
                  </p>
                  <p className="mt-1.5 font-display text-base sm:text-lg leading-snug text-[color:var(--ink)]">
                    Drop the link in your group — it&apos;s better with people.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <WhatsAppShareButton
                    text={welcomeShareText}
                    label="Share now"
                    variant="pill"
                    onShare={dismissWelcome}
                  />
                  <button
                    type="button"
                    onClick={dismissWelcome}
                    aria-label="Dismiss share prompt"
                    className="font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] px-2 py-1"
                  >
                    Later
                  </button>
                </div>
              </div>
            )}

            <Player
              videoId={videoId}
              isHost={isHost}
              enforceState={enforceState}
              onReady={(h) => {
                playerRef.current = h;
              }}
              onEvent={onPlayerEvent}
              duckedVolume={audioDuck.duckedVolume}
              onVolumeChange={setUserVolume}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                {videoId ? (
                  <>
                    <p className="eyebrow">Now broadcasting</p>
                    <p className="mt-1 font-display text-lg sm:text-xl text-[color:var(--ink)] truncate">
                      {currentVideoMeta ? (
                        currentVideoMeta.title
                      ) : (
                        <>
                          Custom broadcast
                          <span className="ml-2 font-mono text-[0.65rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
                            {videoId}
                          </span>
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="eyebrow">Broadcast queued</p>
                    <p className="mt-1 font-display text-lg sm:text-xl text-[color:var(--ink-soft)]">
                      Waiting for host pick.
                    </p>
                  </>
                )}
              </div>

              {isHost && (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="font-mono text-[0.65rem] tracking-[0.22em] uppercase border border-[color:var(--accent)] text-[color:var(--accent)] px-3 py-2 hover:bg-[color:var(--accent-soft)] transition-colors"
                >
                  Change video
                </button>
              )}
            </div>

            <CallDock
              state={call.state}
              selfTile={selfTile}
              peerTiles={peerTiles}
              micEnabled={call.micEnabled}
              camEnabled={call.camEnabled}
              permissionError={call.permissionError}
              onToggleMic={() => void call.toggleMic()}
              onToggleCam={() => void call.toggleCam()}
              onLeave={() => void call.leave()}
            />

            {dockEmpty && (
              <div className="flex pt-2">
                <StartTalkingButton onClick={() => void call.toggleMic()} />
              </div>
            )}

            {pickError && (
              <p
                role="alert"
                className="font-mono text-[0.7rem] tracking-[0.04em] text-[color:#ff7878] border-l-2 border-[#ff7878] pl-3"
              >
                {pickError}
              </p>
            )}

            <section className="border-t border-[color:var(--line)] pt-4">
              <p className="eyebrow mb-3">Tuned in · {participants.length}</p>
              <PresenceList
                participants={participants}
                hostId={hostId}
                selfId={self.user_id}
              />
            </section>
          </div>
        </main>

        <Chat
          messages={messages}
          onSend={onChatSend}
          selfId={self.user_id}
          isMobileOpen={chatOpen}
          onMobileClose={() => setChatOpen(false)}
        />
      </div>

      <VideoPickerSheet
        open={pickerOpen}
        currentVideoId={videoId}
        onClose={() => setPickerOpen(false)}
        onPick={onPickVideo}
      />
    </div>
  );
}
