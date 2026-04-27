'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  dedupePresence,
  electHost,
  type Participant,
} from '@/lib/sync-utils';

type Self = { user_id: string; name: string; city: string | null };

type Result = {
  participants: Participant[];
  hostId: string | null;
  isHost: boolean;
};

export function usePresence(
  channel: RealtimeChannel | null,
  self: Self
): Result {
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    if (!channel) return;

    const sync = () => {
      const state = channel.presenceState() as unknown as Record<string, Participant[]>;
      setParticipants(dedupePresence(state));
    };

    channel.on('presence', { event: 'sync' }, sync);
    channel.on('presence', { event: 'join' }, sync);
    channel.on('presence', { event: 'leave' }, sync);
  }, [channel]);

  const host = useMemo(() => electHost(participants), [participants]);

  return {
    participants,
    hostId: host?.user_id ?? null,
    isHost: host?.user_id === self.user_id,
  };
}
