'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRoomById } from '@/lib/rooms';

const NEXT_PATH_RE = /^\/room\/[0-9a-f-]{36}$/i;

const SESSION_COOKIE = 'yp_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type LoginState = { error?: string } | undefined;

async function setSessionCookie(signupId: string) {
  const c = await cookies();
  c.set(SESSION_COOKIE, signupId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  return NEXT_PATH_RE.test(value) ? value : null;
}

async function resolveNextOrLobby(rawNext: string): Promise<string> {
  const next = safeNextPath(rawNext);
  if (!next) return '/rooms';
  const candidateId = next.slice('/room/'.length);
  const room = await getRoomById(candidateId);
  if (!room) return '/rooms';
  return next;
}

export async function loginByPhone(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const phone = (formData.get('phone')?.toString() ?? '').trim();
  const countryCode = formData.get('country_code')?.toString() || '+91';
  const rawNext = formData.get('next')?.toString() ?? '';

  if (!/^\d{6,15}$/.test(phone)) {
    return { error: 'Phone must be 6–15 digits.' };
  }

  const supabase = createAdminClient();
  const { data: signup, error } = await supabase
    .from('signups')
    .select('id, city, country_code')
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    console.error('login lookup failed', error);
    return { error: 'Something went wrong. Try again.' };
  }

  if (!signup) {
    return {
      error:
        "We don't have that number yet. Tap 'Sign up' below to join in 3 fields.",
    };
  }

  // Soft sanity check — if the country code submitted doesn't match what was
  // recorded at signup, still allow login but note in logs. Not a hard error
  // because users may submit a different code on a different device.
  if (signup.country_code && signup.country_code !== countryCode) {
    console.warn(
      'login country code mismatch',
      { recorded: signup.country_code, submitted: countryCode }
    );
  }

  await setSessionCookie(signup.id);
  const target = await resolveNextOrLobby(rawNext);
  redirect(target);
}
