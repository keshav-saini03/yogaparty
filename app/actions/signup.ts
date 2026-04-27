'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDetectedCity } from '@/lib/geo';
import type { SignupState } from '@/lib/types';

export type { SignupState };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DUPLICATE_PHONE_ERROR =
  "This number is already in! Check your messages — you're already part of YogaParty.";

export async function createSignup(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  // Allowed formData reads: name, phone, country_code, referrer_id ONLY.
  // City is server-authoritative — sourced from getDetectedCity() below.
  const name = (formData.get('name')?.toString() ?? '').trim();
  const phone = (formData.get('phone')?.toString() ?? '').trim();
  const countryCode =
    formData.get('country_code')?.toString() || '+91';
  const rawReferrer = formData.get('referrer_id')?.toString() ?? '';

  if (!name) {
    return { error: 'Please enter your name.' };
  }

  if (!/^\d{6,15}$/.test(phone)) {
    return { error: 'Phone must be 6–15 digits.' };
  }

  let referrerId: string | null = UUID_RE.test(rawReferrer)
    ? rawReferrer
    : null;

  // Sole source of city. Client-supplied values are silently ignored.
  const city = await getDetectedCity();

  const supabase = await createClient();

  let { data, error } = await supabase
    .from('signups')
    .insert({
      name,
      phone,
      country_code: countryCode,
      city,
      referrer_id: referrerId,
    })
    .select('id')
    .single();

  // FK violation on referrer_id (well-formed UUID but absent row) — retry once with null.
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
      .select('id')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error?.code === '23505') {
    return { error: DUPLICATE_PHONE_ERROR };
  }

  if (error || !data) {
    console.error('signup insert failed', error);
    return { error: 'Something went wrong. Try again.' };
  }

  // redirect() throws a control-flow signal — MUST be outside any try/catch.
  redirect(`/room/${data.id}`);
}
