'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPublicRoom } from '@/lib/rooms';
import { getDetectedCity } from '@/lib/geo';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateRoomState = { error?: string } | undefined;

export async function createRoomAction(
  _prev: CreateRoomState,
  formData: FormData
): Promise<CreateRoomState> {
  const title = (formData.get('title')?.toString() ?? '').trim();
  if (!title) return { error: 'Give your room a title.' };
  if (title.length > 80) return { error: 'Title must be 80 chars or fewer.' };

  const visibility = formData.get('visibility')?.toString();
  const isPublic = visibility !== 'private';

  const c = await cookies();
  const session = c.get('yp_session')?.value;
  if (!session || !UUID_RE.test(session)) {
    redirect('/signup?next=/rooms');
  }

  const supabase = createAdminClient();
  const { data: signup } = await supabase
    .from('signups')
    .select('id, city')
    .eq('id', session)
    .maybeSingle();

  if (!signup) {
    redirect('/signup?next=/rooms');
  }

  const city = signup.city ?? (await getDetectedCity());

  const result = await createPublicRoom({
    title,
    creatorId: signup.id,
    city,
    isPublic,
  });

  if ('error' in result) return { error: result.error };

  redirect(`/room/${result.id}`);
}
