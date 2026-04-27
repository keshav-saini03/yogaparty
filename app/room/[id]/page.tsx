import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { findOrCreateCityRoom, getRoomById } from '@/lib/rooms';
import { RoomClient } from './RoomClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Promise<{ id: string }>;

export default async function RoomPage({ params }: { params: Params }) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    redirect(`/signup?next=/room/${encodeURIComponent(id)}`);
  }

  const cookieStore = await cookies();
  const session = cookieStore.get('yp_session')?.value;

  if (!session || !UUID_RE.test(session)) {
    redirect(`/signup?next=/room/${id}`);
  }

  const supabase = createAdminClient();
  const { data: signup } = await supabase
    .from('signups')
    .select('id, name, city')
    .eq('id', session)
    .maybeSingle();

  if (!signup) {
    // Stale cookie pointing to a non-existent signup (e.g., the row was
    // deleted). Bounce through signup; the action will overwrite the cookie
    // on success. Server Components can't mutate cookies — that's fine.
    redirect(`/signup?next=/room/${id}`);
  }

  const room = await getRoomById(id);

  // If the requested room does not exist, fall back to the user's own city
  // room rather than looping back through /signup. Common cause: a stale URL
  // from before Phase 3 changed `/room/[id]` semantics from signup-id to
  // rooms.id, or simply a typo / shared bad link.
  if (!room) {
    const cityRoom = await findOrCreateCityRoom(signup.city);
    redirect(`/room/${cityRoom.id}`);
  }

  return (
    <RoomClient
      roomId={room.id}
      roomCity={room.city}
      initialVideoId={room.youtube_video_id}
      self={{
        user_id: signup.id,
        name: signup.name,
        city: signup.city,
      }}
    />
  );
}
