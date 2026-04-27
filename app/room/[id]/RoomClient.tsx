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

type Props = {
  roomId: string;
  roomCity: string | null;
  initialVideoId: string | null;
  self: { user_id: string; name: string; city: string | null };
};

export function RoomClient({ roomId, roomCity, initialVideoId, self }: Props) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [videoId, setVideoId] = useState<string | null>(initialVideoId);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const playerRef = useRef<PlayerHandle | null>(null);

  const { participants, hostId, isHost } = usePresence(channel, self);

  const {
    emitPlayerEvent,
    broadcastVideoChange,
    broadcastChat,
    suppressNextOutbound,
  } = useRoomSync({
    channel,
    isHost,
    selfId: self.user_id,
    playerRef,
  });

  // Open + lifecycle the realtime channel.
  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`room:${roomId}`, {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: self.user_id },
      },
    });

    // Listen for chat broadcasts.
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
      setMessages((prev) => [...prev, payload as ChatMsg]);
    });

    // Listen for video_change broadcasts (host swap).
    ch.on('broadcast', { event: 'video_change' }, ({ payload }) => {
      const next = (payload as { videoId: string }).videoId;
      suppressNextOutbound();
      setVideoId(next);
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({
          user_id: self.user_id,
          name: self.name,
          city: self.city,
          joined_at: Date.now(),
        });
      }
    });

    setChannel(ch);

    return () => {
      ch.untrack().catch(() => {});
      ch.unsubscribe().catch(() => {});
      sb.removeChannel(ch);
    };
  }, [roomId, self.user_id, self.name, self.city, suppressNextOutbound]);

  // Auto-open picker for host on first arrival to a video-less room.
  useEffect(() => {
    if (isHost && !videoId) {
      setPickerOpen(true);
    }
  }, [isHost, videoId]);

  const onPickVideo = async (id: string) => {
    setPickError(null);
    setPickerOpen(false);
    suppressNextOutbound();
    setVideoId(id);
    broadcastVideoChange(id);
    const result = await pickVideo(roomId, id);
    if ('error' in result) {
      setPickError(result.error);
    }
  };

  const onChatSend = (text: string) => {
    const msg = broadcastChat(text, self.name);
    if (msg) setMessages((prev) => [...prev, msg]);
  };

  const currentVideoMeta = useMemo(
    () => (videoId ? CURATED_VIDEOS.find((v) => v.id === videoId) : null),
    [videoId]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--bg)]">
      <RoomHeader
        city={roomCity}
        participantCount={participants.length}
        onChatToggle={() => setChatOpen((v) => !v)}
        isMobileChatOpen={chatOpen}
      />

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Stage column */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col gap-4 p-4 sm:p-6">
            <Player
              videoId={videoId}
              isHost={isHost}
              onReady={(h) => {
                playerRef.current = h;
              }}
              onEvent={(name, t) => emitPlayerEvent(name, t)}
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

        {/* Chat column / sheet */}
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
