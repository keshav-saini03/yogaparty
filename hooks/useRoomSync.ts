'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { PlayerHandle } from '@/components/room/Player';
import { shouldCorrect, correctedTimestamp } from '@/lib/sync-utils';

const HEARTBEAT_INTERVAL_MS = 5_000;
const COOLDOWN_AFTER_CORRECT_MS = 1_000;

type Args = {
  channel: RealtimeChannel | null;
  isHost: boolean;
  selfId: string;
  playerRef: React.MutableRefObject<PlayerHandle | null>;
};

export function useRoomSync({
  channel,
  isHost,
  selfId,
  playerRef,
}: Args) {
  const suppressNextEventRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const lastClientTimesRef = useRef<Map<string, number>>(new Map());

  // Subscribe to broadcast events.
  useEffect(() => {
    if (!channel) return;

    const onPlay = ({ payload }: { payload: { timestamp: number } }) => {
      if (!playerRef.current) return;
      suppressNextEventRef.current = true;
      playerRef.current.seekTo(payload.timestamp, true);
      playerRef.current.play();
    };

    const onPause = ({ payload }: { payload: { timestamp: number } }) => {
      if (!playerRef.current) return;
      suppressNextEventRef.current = true;
      playerRef.current.pause();
      playerRef.current.seekTo(payload.timestamp, true);
    };

    const onSeek = ({ payload }: { payload: { timestamp: number } }) => {
      if (!playerRef.current) return;
      suppressNextEventRef.current = true;
      playerRef.current.seekTo(payload.timestamp, true);
    };

    const onCorrect = ({
      payload,
    }: {
      payload: { target_user_id: string; timestamp: number };
    }) => {
      if (payload.target_user_id !== selfId) return;
      if (!playerRef.current) return;
      suppressNextEventRef.current = true;
      playerRef.current.seekTo(payload.timestamp, true);
      cooldownUntilRef.current = Date.now() + COOLDOWN_AFTER_CORRECT_MS;
    };

    const onHeartbeat = ({
      payload,
    }: {
      payload: { user_id: string; currentTime: number; sentAt: number };
    }) => {
      lastClientTimesRef.current.set(payload.user_id, payload.currentTime);

      // Only host evaluates drift and emits corrections.
      if (!isHost) return;
      if (!playerRef.current) return;
      if (payload.user_id === selfId) return;

      const hostTime = playerRef.current.getCurrentTime();
      if (shouldCorrect(hostTime, payload.currentTime)) {
        channel.send({
          type: 'broadcast',
          event: 'sync_correct',
          payload: {
            target_user_id: payload.user_id,
            timestamp: correctedTimestamp(hostTime),
          },
        });
      }
    };

    channel.on('broadcast', { event: 'sync_play' }, onPlay);
    channel.on('broadcast', { event: 'sync_pause' }, onPause);
    channel.on('broadcast', { event: 'sync_seek' }, onSeek);
    channel.on('broadcast', { event: 'sync_correct' }, onCorrect);
    channel.on('broadcast', { event: 'heartbeat' }, onHeartbeat);
  }, [channel, isHost, selfId, playerRef]);

  // Heartbeat ticker — every client sends, host listens & corrects.
  useEffect(() => {
    if (!channel) return;
    const tick = () => {
      if (Date.now() < cooldownUntilRef.current) return;
      const t = playerRef.current?.getCurrentTime?.() ?? 0;
      channel.send({
        type: 'broadcast',
        event: 'heartbeat',
        payload: {
          user_id: selfId,
          currentTime: t,
          sentAt: Date.now(),
        },
      });
    };
    const id = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [channel, selfId, playerRef]);

  // Outbound emitters used by host UI / Player onEvent.
  const emitPlayerEvent = useCallback(
    (name: 'play' | 'pause' | 'seek', currentTime: number) => {
      if (!channel || !isHost) return;
      if (suppressNextEventRef.current) {
        suppressNextEventRef.current = false;
        return;
      }
      const eventName = `sync_${name}`;
      channel.send({
        type: 'broadcast',
        event: eventName,
        payload: { timestamp: currentTime },
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
    (text: string, name: string) => {
      if (!channel) return;
      const msg = {
        type: 'chat' as const,
        user_id: selfId,
        user: name,
        text,
        timestamp: Date.now(),
      };
      channel.send({ type: 'broadcast', event: 'chat', payload: msg });
      return msg;
    },
    [channel, selfId]
  );

  // Suppress one outgoing event after we apply a remote action so we don't
  // re-broadcast a sync_play in response to our own seekTo.
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
