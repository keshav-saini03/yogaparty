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

  const playerRef = useRef<PlayerHandle | null>(null);
  const suppressNextOutboundRef = useRef(false);
  const cooldownUntilRef = useRef(0);

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
      if (!playerRef.current) return;
      suppressNextOutboundRef.current = true;
      playerRef.current.seekTo(p.timestamp, true);
      playerRef.current.play();
    });

    ch.on('broadcast', { event: 'sync_pause' }, ({ payload }) => {
      const p = payload as { timestamp: number };
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
    };
  }, [roomId, self.user_id, self.name, self.city]);

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

  // Suppress unused-host warning while keeping it accessible if needed.
  void host;

  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--bg)]">
      <RoomHeader
        city={roomCity}
        participantCount={participants.length}
        onChatToggle={() => setChatOpen((v) => !v)}
        isMobileChatOpen={chatOpen}
      />

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col gap-4 p-4 sm:p-6">
            <Player
              videoId={videoId}
              isHost={isHost}
              onReady={(h) => {
                playerRef.current = h;
              }}
              onEvent={onPlayerEvent}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                {currentVideoMeta ? (
                  <>
                    <p className="eyebrow">Now broadcasting</p>
                    <p className="mt-1 font-display text-lg sm:text-xl text-[color:var(--ink)] truncate">
                      {currentVideoMeta.title}
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
