import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Room } from '@/lib/room-types';

const CITY_FALLBACK = 'GLOBAL';

export function normalizeCity(city: string | null): string {
  if (!city) return CITY_FALLBACK;
  const trimmed = city.trim();
  return trimmed.length === 0 ? CITY_FALLBACK : trimmed;
}

export async function findOrCreateCityRoom(
  city: string | null
): Promise<{ id: string; city: string }> {
  const cityKey = normalizeCity(city);
  const supabase = createAdminClient();

  const existing = await supabase
    .from('rooms')
    .select('id, city')
    .eq('type', 'city')
    .eq('city', cityKey)
    .eq('is_active', true)
    .maybeSingle();

  if (existing.data) {
    return { id: existing.data.id, city: existing.data.city ?? cityKey };
  }

  const created = await supabase
    .from('rooms')
    .insert({
      type: 'city',
      city: cityKey,
      is_active: true,
      youtube_video_id: null,
    })
    .select('id, city')
    .single();

  // Race-window: another request created the row between our SELECT and INSERT.
  // Postgres has no UNIQUE on (type, city) — retry SELECT to recover gracefully.
  if (created.error) {
    const retry = await supabase
      .from('rooms')
      .select('id, city')
      .eq('type', 'city')
      .eq('city', cityKey)
      .eq('is_active', true)
      .maybeSingle();

    if (retry.data) {
      return { id: retry.data.id, city: retry.data.city ?? cityKey };
    }

    throw new Error(
      `findOrCreateCityRoom failed for city=${cityKey}: ${created.error.message}`
    );
  }

  return { id: created.data!.id, city: created.data!.city ?? cityKey };
}

export async function getRoomById(id: string): Promise<Room | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
  return (data as Room) ?? null;
}

export async function getCityRoomCount(city: string | null): Promise<number> {
  if (!city) return 0;
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('signups')
    .select('*', { count: 'exact', head: true })
    .eq('city', city);
  return count ?? 0;
}

export async function setRoomVideo(
  roomId: string,
  youtube_video_id: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('rooms')
    .update({ youtube_video_id })
    .eq('id', roomId);
  if (error) return { error: error.message };
  return { ok: true };
}
