import { headers } from 'next/headers';

export async function getDetectedCity(): Promise<string | null> {
  const h = await headers();
  const raw = h.get('x-geo-city');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return raw.trim() || null;
  }
}

export async function getDetectedCountry(): Promise<string | null> {
  const h = await headers();
  return h.get('x-geo-country')?.trim() || null;
}
