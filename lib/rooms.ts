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
    .order('created_at', { ascending: true })
    .limit(1)
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
      .order('created_at', { ascending: true })
      .limit(1)
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

export type PublicRoomListing = {
  id: string;
  title: string;
  city: string | null;
  youtube_video_id: string | null;
  created_at: string;
  creator_id: string | null;
};

const ROOM_LISTING_TTL_MINUTES = 3;

export async function listPublicRooms(limit = 50): Promise<PublicRoomListing[]> {
  const supabase = createAdminClient();
  const cutoff = new Date(
    Date.now() - ROOM_LISTING_TTL_MINUTES * 60_000
  ).toISOString();

  // Try the activity-aware + privacy-aware query first. If a column doesn't
  // exist yet (migration not applied), fall back to the legacy listing.
  const recent = await supabase
    .from('rooms')
    .select('id, title, city, youtube_video_id, created_at, creator_id')
    .eq('is_active', true)
    .eq('is_public', true)
    .not('title', 'is', null)
    .gte('last_active_at', cutoff)
    .order('last_active_at', { ascending: false })
    .limit(limit);

  if (!recent.error) {
    return (recent.data ?? []) as PublicRoomListing[];
  }

  console.warn(
    'listPublicRooms TTL query failed, falling back',
    recent.error.message
  );
  const fallback = await supabase
    .from('rooms')
    .select('id, title, city, youtube_video_id, created_at, creator_id')
    .eq('is_active', true)
    .not('title', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (fallback.error) {
    console.error('listPublicRooms fallback failed', fallback.error);
    return [];
  }
  return (fallback.data ?? []) as PublicRoomListing[];
}

export type SplitPublicRooms = {
  inYourCity: PublicRoomListing[];
  elsewhere: PublicRoomListing[];
};

export function splitPublicRoomsByCity(
  rooms: PublicRoomListing[],
  yourCity: string | null
): SplitPublicRooms {
  const normalized =
    yourCity && yourCity.trim().length > 0 ? yourCity.trim() : null;
  if (!normalized || normalized === 'GLOBAL') {
    return { inYourCity: [], elsewhere: rooms };
  }
  const inCity: PublicRoomListing[] = [];
  const other: PublicRoomListing[] = [];
  for (const r of rooms) {
    if (r.city && r.city === normalized) inCity.push(r);
    else other.push(r);
  }
  return { inYourCity: inCity, elsewhere: other };
}

export type CreatePublicRoomResult =
  | { ok: true; id: string }
  | { error: string };

export async function createPublicRoom(args: {
  title: string;
  creatorId: string;
  city: string | null;
  isPublic?: boolean;
}): Promise<CreatePublicRoomResult> {
  const cleanTitle = args.title.trim();
  if (cleanTitle.length === 0) return { error: 'Give your room a title.' };
  if (cleanTitle.length > 80) return { error: 'Title must be 80 chars or fewer.' };

  const isPublic = args.isPublic !== false;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      type: 'city',
      title: cleanTitle,
      creator_id: args.creatorId,
      city: normalizeCity(args.city),
      is_active: true,
      is_public: isPublic,
      youtube_video_id: null,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('createPublicRoom failed', error);
    return { error: 'Could not create room. Try again.' };
  }
  return { ok: true, id: data.id };
}
