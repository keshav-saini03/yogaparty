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
import { WelcomeShareToast } from '@/components/room/WelcomeShareToast';
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
// Drift over this many seconds triggers a correction. Wider than the old
// 0.5s because corrections are now seek-only (rate-bend was retired —
// YouTube's IFrame API rounds non-supported rates toward 1.0, so a
// "subtle" 1.05× is silently a no-op and 1.25× is audibly obvious). We
// absorb up to 1s of drift instead of papering over it with a pitch shift.
const DRIFT_THRESHOLD_SEC = 1.0;
// Cooldown after a seek — give the YouTube buffer time to settle before
// we let the next heartbeat fire and possibly re-trigger a correction.
const POST_SEEK_COOLDOWN_MS = 3_000;
// Overshoot for seek targets to compensate for YouTube's rebuffer (which
// stalls the iframe ~300–500 ms after a seek). Without this we land
// behind host even when the math says "exact". 0.5 is a conservative pad.
const SEEK_BUFFER_PAD_SEC = 0.5;
// NTP-style clock-sync ping cadence. Viewers ping the host every
// CLOCK_PING_INTERVAL_MS to learn (offset, rtt). The offset translates
// the viewer's wall clock into host time so transit compensation isn't
// fooled by device clock skew (which is routinely 100s of ms on phones).
const CLOCK_PING_INTERVAL_MS = 10_000;
// EWMA blend factor — newer samples contribute 30%, history 70%. Smooths
// out transient packet-spike RTTs without lagging real network shifts.
const CLOCK_EWMA_NEW = 0.3;

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
  // Clock-sync state. clockOffsetRef = host_clock − viewer_clock (in ms);
  // 0 for the host. rttEmaRef is the smoothed round-trip in ms. Refs (not
  // state) because we read these inside event handlers registered before
  // subscribe — re-renders must not destroy/rebuild the listeners.
  const clockOffsetRef = useRef(0);
  const rttEmaRef = useRef(0);
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
  // Stable per-mount session timestamp. Used as `joined_at` in every
  // ch.track() payload AND as the value useCall passes back to updatePresence.
  // MUST be a ref, not Date.now() per render — host election compares
  // joined_at across participants, and a value that drifts on every render
  // can cause the host to flicker.
  const selfJoinedAtRef = useRef(Date.now());

  const { hostId, isHost, host } = usePresence(participants, self);
  isHostRef.current = isHost;

  // Returns "host wall-clock time" in ms — Date.now() corrected by the
  // viewer's measured offset to host. For the host this is just Date.now()
  // (offset stays 0). useCallback with no deps keeps the identity stable
  // across renders; the callback always reads the *current* offset via the
  // ref, so it doesn't need to re-bind when offset changes.
  const hostNow = useCallback(
    () => Date.now() + clockOffsetRef.current,
    []
  );

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
    selfJoinedAt: selfJoinedAtRef.current,
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
    // Compensate transit time: the sender stamps `sentAt` in HOST time
    // (host uses Date.now() directly; viewers use hostNow() which adds
    // the clock-sync offset). On receipt we compute transit in host time
    // too — `hostNow() - sentAt` — so device clock skew can't bias the
    // estimate. Collapses steady-state lag from ~½ RTT to the tens of ms
    // it takes us to issue a seek/play call.
    const expectedFromPayload = (p: { timestamp: number; sentAt?: number }) => {
      const transitSec = p.sentAt
        ? Math.max(0, (hostNow() - p.sentAt) / 1000)
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
      const correction = pickCorrection(drift, DRIFT_THRESHOLD_SEC);

      if (correction.kind === 'none') return;

      // Seek-only correction. Overshoot by SEEK_BUFFER_PAD_SEC because
      // YouTube re-buffers ~300–500 ms after a seek; without the pad the
      // viewer resumes ~half a second behind host. Cooldown is set
      // generously so the next heartbeat doesn't fire mid-rebuffer and
      // mistake "still loading" for fresh drift.
      cooldownUntilRef.current = Date.now() + POST_SEEK_COOLDOWN_MS;
      suppressNextOutboundRef.current = true;
      playerRef.current.seekTo(expected + SEEK_BUFFER_PAD_SEC, true);
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
      // apples to apples. Both hostNow() and p.sentAt are in host time
      // (viewers translate sentAt via their measured clock-offset before
      // sending), so the delta is true wall-clock transit.
      const transitSec = p.sentAt
        ? Math.max(0, (hostNow() - p.sentAt) / 1000)
        : 0;
      const viewerTime = p.currentTime + transitSec;
      const hostTime = playerRef.current.getCurrentTime();

      if (shouldCorrect(hostTime, viewerTime, DRIFT_THRESHOLD_SEC)) {
        ch.send({
          type: 'broadcast',
          event: 'sync_correct',
          payload: {
            target_user_id: p.user_id,
            // Lookahead so the viewer's seek target stays aligned with
            // host through the in-flight transit. The viewer also adds
            // its own SEEK_BUFFER_PAD_SEC on receipt to absorb YouTube's
            // post-seek rebuffer.
            timestamp: correctedTimestamp(hostTime),
            sentAt: hostNow(),
          },
        });
      }
    });

    // ── Clock sync (NTP-style) ───────────────────────────────────
    // Viewers ping host with t1 = viewer-local send time. Host echoes
    // back with t2 (recv) and t3 (send) on its own clock. Viewer reads
    // t4 = local recv time and computes:
    //   offset = ((t2 - t1) + (t3 - t4)) / 2     // host_clock − viewer_clock
    //   rtt    = (t4 - t1) - (t3 - t2)
    // Symmetric-transit assumption — fine in practice on Supabase
    // Realtime which fans out via a single relay. Viewers translate
    // their wall clocks into host time using `clockOffsetRef` so transit
    // compensation isn't poisoned by device-clock skew.
    ch.on('broadcast', { event: 'clock_ping' }, ({ payload }) => {
      if (!isHostRef.current) return;
      const { from, t1 } = payload as { from: string; t1: number };
      const t2 = Date.now();
      ch.send({
        type: 'broadcast',
        event: 'clock_pong',
        payload: { to: from, t1, t2, t3: Date.now() },
      });
    });

    ch.on('broadcast', { event: 'clock_pong' }, ({ payload }) => {
      const { to, t1, t2, t3 } = payload as {
        to: string;
        t1: number;
        t2: number;
        t3: number;
      };
      if (to !== selfIdRef.current) return;
      const t4 = Date.now();
      const offset = (t2 - t1 + (t3 - t4)) / 2;
      const rtt = t4 - t1 - (t3 - t2);
      // First sample seeds the EMA. Once seeded, drop samples whose RTT
      // is > 2× the smoothed value — a single jittery packet shouldn't
      // pull our offset estimate around (and through it, trigger a
      // spurious seek on the next sync_correct).
      if (rttEmaRef.current === 0) {
        clockOffsetRef.current = offset;
        rttEmaRef.current = Math.max(0, rtt);
        return;
      }
      if (rtt > rttEmaRef.current * 2) return;
      clockOffsetRef.current =
        (1 - CLOCK_EWMA_NEW) * clockOffsetRef.current + CLOCK_EWMA_NEW * offset;
      rttEmaRef.current =
        (1 - CLOCK_EWMA_NEW) * rttEmaRef.current +
        CLOCK_EWMA_NEW * Math.max(0, rtt);
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
          joined_at: selfJoinedAtRef.current,
          tracked_at: Date.now(),
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
    };
  }, [roomId, self.user_id, self.name, self.city, hostNow]);

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
  // (2s). The host projects each viewer's currentTime forward by transit and
  // emits sync_correct on drift past DRIFT_THRESHOLD_SEC. cooldownUntilRef
  // is bumped whenever this client applies a correction so we don't
  // tight-loop on a slow rebuffer.
  //
  // sentAt is stamped via hostNow() so when the host receives the packet,
  // its (Date.now() - sentAt) is true wall-clock transit, not transit-plus-
  // device-clock-skew.
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
          sentAt: hostNow(),
        },
      });
    };
    const id = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [channel, isReady, self.user_id, hostNow]);

  // Clock-sync ticker — viewers only. Host responds to pings; pinging
  // itself is a no-op. We fire one ping at mount so the first heartbeat
  // already carries a meaningful offset, then every CLOCK_PING_INTERVAL_MS.
  useEffect(() => {
    if (!channel || !isReady || isHost) return;
    const sendPing = () => {
      channel.send({
        type: 'broadcast',
        event: 'clock_ping',
        payload: { from: self.user_id, t1: Date.now() },
      });
    };
    sendPing();
    const id = window.setInterval(sendPing, CLOCK_PING_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [channel, isReady, isHost, self.user_id]);

  // Visibility resync — backgrounded tabs are throttled and YouTube can
  // stall, so a viewer often comes back several seconds behind host. The
  // 2 s heartbeat cadence is too slow to mask this. On focus, fire one
  // immediate heartbeat so the host's next sync_correct lands by the
  // viewer's first visible frame.
  useEffect(() => {
    if (!channel || !isReady || isHost) return;
    const onVis = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      const t = playerRef.current?.getCurrentTime?.() ?? 0;
      channel.send({
        type: 'broadcast',
        event: 'heartbeat',
        payload: {
          user_id: self.user_id,
          currentTime: t,
          sentAt: hostNow(),
        },
      });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [channel, isReady, isHost, self.user_id, hostNow]);

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
              hostControl={
                isHost ? (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="font-mono text-[0.58rem] tracking-[0.22em] uppercase border border-[color:var(--accent)] text-[color:var(--accent)] bg-black/70 backdrop-blur-[2px] px-2.5 py-1.5 hover:bg-[color:var(--accent-soft)] transition-colors"
                  >
                    Change video
                  </button>
                ) : null
              }
            />

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

      <WelcomeShareToast
        open={welcomeOpen}
        shareText={welcomeShareText}
        onDismiss={dismissWelcome}
      />
    </div>
  );
}
