'use server';

import { createAdminClient } from '@/lib/supabase/admin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bump rooms.last_active_at to now(). Called by RoomClient on mount and
 * every ~60s while the channel is subscribed. Powers the /rooms directory
 * TTL filter (rooms quiet for > 3 min vanish from the listing).
 *
 * No-op for non-UUID input. Silently swallows errors — activity bumps are
 * advisory, not load-bearing.
 */
export async function bumpRoomActivity(roomId: string): Promise<void> {
  if (!UUID_RE.test(roomId)) return;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('rooms')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', roomId);
  if (error) {
    // Likely the migration hasn't been applied yet — fail soft.
    console.warn('bumpRoomActivity skipped', error.message);
  }
}

/**
 * Soft-delete the room (is_active=false) IF:
 *   - it is a user-created public room (title IS NOT NULL)
 *   - last_active_at is older than 90s (i.e., nobody bumped it recently)
 *
 * Called by the last-leaver from RoomClient cleanup. Idempotent. Auto-city
 * rooms (title IS NULL) are exempt — they're system-managed.
 */
export async function closeRoomIfStale(roomId: string): Promise<void> {
  if (!UUID_RE.test(roomId)) return;
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const { error } = await supabase
    .from('rooms')
    .update({ is_active: false })
    .eq('id', roomId)
    .not('title', 'is', null)
    .lt('last_active_at', cutoff);
  if (error) {
    console.warn('closeRoomIfStale skipped', error.message);
  }
}
