'use server';

import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCuratedVideo } from '@/lib/videos';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PickVideoResult = { ok: true } | { error: string };

export async function pickVideo(
  roomId: string,
  videoId: string
): Promise<PickVideoResult> {
  if (!UUID_RE.test(roomId)) {
    return { error: 'Invalid room id.' };
  }
  if (!isCuratedVideo(videoId)) {
    return { error: 'Video not in curated list.' };
  }

  const c = await cookies();
  const session = c.get('yp_session')?.value;
  if (!session || !UUID_RE.test(session)) {
    return { error: 'Not signed in.' };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('rooms')
    .update({ youtube_video_id: videoId })
    .eq('id', roomId)
    .eq('is_active', true);

  if (error) {
    console.error('pickVideo update failed', error);
    return { error: 'Could not change video.' };
  }

  return { ok: true };
}
