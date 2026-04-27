'use client';

import { useMemo } from 'react';
import { electHost, type Participant } from '@/lib/sync-utils';

type Self = { user_id: string };

type Result = {
  hostId: string | null;
  isHost: boolean;
  host: Participant | null;
};

/**
 * Pure derivation: given the current participants list and self id, return
 * who is host. Host is determined by earliest joined_at, ties broken by
 * user_id lex sort. The actual presence subscription lives in RoomClient
 * because Supabase requires `.on()` to be called before `.subscribe()`.
 */
export function usePresence(participants: Participant[], self: Self): Result {
  const host = useMemo(() => electHost(participants), [participants]);
  return {
    host,
    hostId: host?.user_id ?? null,
    isHost: host?.user_id === self.user_id,
  };
}
