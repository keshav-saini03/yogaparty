'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { findOrCreateCityRoom } from '@/lib/rooms';
import { getDetectedCity } from '@/lib/geo';
import type { SignupState } from '@/lib/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NEXT_PATH_RE = /^\/room\/[0-9a-f-]{36}$/i;

const DUPLICATE_PHONE_FALLBACK_ERROR =
  "This number is already registered. Your seat is saved; watch-room details will arrive before we go live.";

const SESSION_COOKIE = 'yp_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

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

export async function createSignup(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  const name = (formData.get('name')?.toString() ?? '').trim();
  const phone = (formData.get('phone')?.toString() ?? '').trim();
  const countryCode = formData.get('country_code')?.toString() || '+91';
  const rawReferrer = formData.get('referrer_id')?.toString() ?? '';
  const rawNext = formData.get('next')?.toString() ?? '';

  if (!name) {
    return { error: 'Please enter your name.' };
  }

  if (!/^\d{6,15}$/.test(phone)) {
    return { error: 'Phone must be 6–15 digits.' };
  }

  let referrerId: string | null = UUID_RE.test(rawReferrer)
    ? rawReferrer
    : null;

  const city = await getDetectedCity();
  const supabase = createAdminClient();

  let { data, error } = await supabase
    .from('signups')
    .insert({
      name,
      phone,
      country_code: countryCode,
      city,
      referrer_id: referrerId,
    })
    .select('id, city')
    .single();

  if (error?.code === '23503' && referrerId !== null) {
    referrerId = null;
    const retry = await supabase
      .from('signups')
      .insert({
        name,
        phone,
        country_code: countryCode,
        city,
        referrer_id: referrerId,
      })
      .select('id, city')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error?.code === '23505') {
    const existing = await supabase
      .from('signups')
      .select('id, city')
      .eq('phone', phone)
      .maybeSingle();

    if (existing.data?.id) {
      const room = await findOrCreateCityRoom(existing.data.city ?? city);
      await setSessionCookie(existing.data.id);
      const next = safeNextPath(rawNext);
      redirect(next ?? `/room/${room.id}`);
    }

    console.error('duplicate signup lookup failed', existing.error);
    return { error: DUPLICATE_PHONE_FALLBACK_ERROR };
  }

  if (error || !data) {
    console.error('signup insert failed', error);
    return { error: 'Something went wrong. Try again.' };
  }

  const room = await findOrCreateCityRoom(data.city ?? city);
  await setSessionCookie(data.id);
  const next = safeNextPath(rawNext);
  redirect(next ?? `/room/${room.id}`);
}
