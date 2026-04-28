import 'server-only';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { findOrCreateCityRoom, getRoomById } from '@/lib/rooms';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NEXT_PATH_RE = /^\/room\/[0-9a-f-]{36}$/i;

export type ResolvedSession = {
  signupId: string;
  name: string;
  city: string | null;
};

/**
 * Read yp_session and validate that the signup row still exists. Returns
 * null when no cookie, malformed cookie, or stale (deleted) signup row.
 */
export async function resolveSession(): Promise<ResolvedSession | null> {
  const c = await cookies();
  const value = c.get('yp_session')?.value;
  if (!value || !UUID_RE.test(value)) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('signups')
    .select('id, name, city')
    .eq('id', value)
    .maybeSingle();

  if (error || !data) return null;

  return {
    signupId: data.id,
    name: data.name,
    city: data.city,
  };
}

/**
 * For /signup and /login: if the visitor already has a valid session, send
 * them straight to their next-room (when ?next= is set + valid) or their
 * city room. Returns nothing; throws via redirect() when applicable.
 */
export async function redirectIfSignedIn(rawNext?: string | null): Promise<void> {
  const session = await resolveSession();
  if (!session) return;

  const room = await findOrCreateCityRoom(session.city);

  if (rawNext && NEXT_PATH_RE.test(rawNext)) {
    const candidateId = rawNext.slice('/room/'.length);
    const candidate = await getRoomById(candidateId);
    if (candidate) {
      const { redirect } = await import('next/navigation');
      redirect(rawNext);
    }
  }

  const { redirect } = await import('next/navigation');
  redirect(`/room/${room.id}`);
}
