'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  shouldCorrect,
  type Participant,
} from '@/lib/sync-utils';

type Props = {
  roomId: string;
  roomCity: string | null;
  initialVideoId: string | null;
  self: { user_id: string; name: string; city: string | null };
};

const HEARTBEAT_INTERVAL_MS = 5_000;

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
  // Host's last broadcast play/pause intent (1=playing, 2=paused). Used by
  // viewer's <Player /> to force-correct any local divergence (e.g. user
  // clicked the iframe through DevTools / keyboard).
  const [enforceState, setEnforceState] = useState<number | null>(null);

  // Refs that listeners read so we don't have to re-register them on each
  // re-render (Supabase forbids `.on(...)` after `.subscribe()`).
  const isHostRef = useRef(false);
  const selfIdRef = useRef(self.user_id);
  selfIdRef.current = self.user_id;

  const { hostId, isHost, host } = usePresence(participants, self);
  isHostRef.current = isHost;

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
      setParticipants(dedupePresence(state));
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
    ch.on('broadcast', { event: 'sync_play' }, ({ payload }) => {
      const p = payload as { timestamp: number };
      setEnforceState(1); // YT_PLAYING — viewers will be forced back if they pause
      if (!playerRef.current) return;
      suppressNextOutboundRef.current = true;
      playerRef.current.seekTo(p.timestamp, true);
      playerRef.current.play();
    });

    ch.on('broadcast', { event: 'sync_pause' }, ({ payload }) => {
      const p = payload as { timestamp: number };
      setEnforceState(2); // YT_PAUSED — viewers will be forced back if they play
      if (!playerRef.current) return;
      suppressNextOutboundRef.current = true;
      playerRef.current.pause();
      playerRef.current.seekTo(p.timestamp, true);
    });

    ch.on('broadcast', { event: 'sync_seek' }, ({ payload }) => {
      const p = payload as { timestamp: number };
      if (!playerRef.current) return;
      suppressNextOutboundRef.current = true;
      playerRef.current.seekTo(p.timestamp, true);
    });

    ch.on('broadcast', { event: 'sync_correct' }, ({ payload }) => {
      const p = payload as { target_user_id: string; timestamp: number };
      if (p.target_user_id !== selfIdRef.current) return;
      if (!playerRef.current) return;
      suppressNextOutboundRef.current = true;
      playerRef.current.seekTo(p.timestamp, true);
      cooldownUntilRef.current = Date.now() + 1000;
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
      const hostTime = playerRef.current.getCurrentTime();
      if (shouldCorrect(hostTime, p.currentTime)) {
        ch.send({
          type: 'broadcast',
          event: 'sync_correct',
          payload: {
            target_user_id: p.user_id,
            timestamp: correctedTimestamp(hostTime),
          },
        });
      }
    });

    // ── Subscribe + track presence on each (re)connect ───────────
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({
          user_id: self.user_id,
          name: self.name,
          city: self.city,
          joined_at: Date.now(),
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

  // Heartbeat ticker — every client sends `heartbeat` every 5s. The host
  // listens (registered above) and emits sync_correct on drift > 2s. The
  // ticker respects cooldownUntilRef which is bumped whenever this client
  // applies a sync_correct, preventing tight loops.
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
                    Drop the link in your group — yoga is better with people.
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
