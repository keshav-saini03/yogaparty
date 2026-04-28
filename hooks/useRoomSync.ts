'use client';

import { useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Args = {
  channel: RealtimeChannel | null;
  isHost: boolean;
  selfId: string;
  selfName: string;
};

/**
 * Imperative emitters for the realtime channel.
 *
 * Listeners (`.on(...)`) are NOT registered here — Supabase forbids adding
 * listeners after `.subscribe()`, and RoomClient subscribes the channel.
 * RoomClient registers every listener in a single useEffect before
 * subscribing; this hook only exposes `.send()` wrappers.
 */
export function useRoomSync({ channel, isHost, selfId, selfName }: Args) {
  const suppressNextEventRef = useRef(false);

  const emitPlayerEvent = useCallback(
    (name: 'play' | 'pause' | 'seek', currentTime: number) => {
      if (!channel || !isHost) return;
      if (suppressNextEventRef.current) {
        suppressNextEventRef.current = false;
        return;
      }
      // sentAt lets viewers add transit time to `timestamp` before seeking,
      // so they don't permanently land ~½ RTT behind the host.
      channel.send({
        type: 'broadcast',
        event: `sync_${name}`,
        payload: { timestamp: currentTime, sentAt: Date.now() },
      });
    },
    [channel, isHost]
  );

  const broadcastVideoChange = useCallback(
    (videoId: string) => {
      if (!channel || !isHost) return;
      channel.send({
        type: 'broadcast',
        event: 'video_change',
        payload: { videoId, timestamp: 0 },
      });
    },
    [channel, isHost]
  );

  const broadcastChat = useCallback(
    (text: string) => {
      if (!channel) return null;
      const msg = {
        type: 'chat' as const,
        user_id: selfId,
        user: selfName,
        text,
        timestamp: Date.now(),
      };
      channel.send({ type: 'broadcast', event: 'chat', payload: msg });
      return msg;
    },
    [channel, selfId, selfName]
  );

  const suppressNextOutbound = useCallback(() => {
    suppressNextEventRef.current = true;
  }, []);

  return {
    emitPlayerEvent,
    broadcastVideoChange,
    broadcastChat,
    suppressNextOutbound,
  };
}
