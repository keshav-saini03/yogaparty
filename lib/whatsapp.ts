// WhatsApp share helpers + Hinglish copy templates per SPEC §"Share Triggers".
// All share links use https://wa.me/?text={encoded} (no native share API, no
// SMS, no email — D-011 locked).

const WA_BASE = 'https://wa.me/?text=';

const FALLBACK_APP_URL = 'https://yogaparty.vercel.app';

/**
 * App base URL used when building share links. Order:
 * 1. NEXT_PUBLIC_APP_URL env var (set in Vercel)
 * 2. window.location.origin if running in the browser
 * 3. Hardcoded fallback (yogaparty.vercel.app)
 */
export function getAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return FALLBACK_APP_URL;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Append ?ref={refId} to a path or URL. Refuses to add the param when refId
 * is missing or not a UUID — prevents share links from carrying garbage.
 */
export function withRef(pathOrUrl: string, refId: string | null | undefined): string {
  if (!refId || !UUID_RE.test(refId)) return pathOrUrl;
  const sep = pathOrUrl.includes('?') ? '&' : '?';
  return `${pathOrUrl}${sep}ref=${refId}`;
}

export function buildShareUrl(text: string): string {
  return `${WA_BASE}${encodeURIComponent(text)}`;
}

type CopyArgs = {
  cityCount?: number;
  cityName?: string | null;
  refId?: string | null;
};

function cleanCity(city: string | null | undefined): string {
  if (!city || city === 'GLOBAL') return '';
  return city;
}

/**
 * Trigger 1 — post-signup (the user just landed in their room).
 *
 * Spec template:
 *   "Main abhi Habuild yoga dekh raha hun 23 logon ke saath!
 *    Tu bhi aaja → yogaparty.vercel.app?ref={userId}"
 */
export function postSignupCopy({ cityCount, cityName, refId }: CopyArgs): string {
  const link = withRef(getAppUrl(), refId);
  const count = typeof cityCount === 'number' && cityCount > 0 ? cityCount : 0;
  const city = cleanCity(cityName);

  if (count >= 2 && city) {
    return `Main abhi Habuild yoga dekh raha hun ${count} logon ke saath ${city} se! Tu bhi aaja → ${link}`;
  }
  if (count >= 2) {
    return `Main abhi Habuild yoga dekh raha hun ${count} logon ke saath! Tu bhi aaja → ${link}`;
  }
  if (city) {
    return `Yoga watch party shuru karu ${city} se. Tu bhi aaja → ${link}`;
  }
  return `Ek yoga watch party chal rahi hai, aaja mere saath → ${link}`;
}

/**
 * Trigger 2 — in-room invite (always-visible "Invite Friends" CTA per SPEC
 * §"In-Room"). Same intent as post-signup, slightly different framing.
 */
export function inRoomInviteCopy(args: CopyArgs): string {
  const link = withRef(getAppUrl(), args.refId);
  const city = cleanCity(args.cityName);
  const count = typeof args.cityCount === 'number' && args.cityCount > 0 ? args.cityCount : 0;

  if (count >= 2 && city) {
    return `${count} log ${city} se yoga kar rahe hain abhi. Tu bhi aaja → ${link}`;
  }
  if (city) {
    return `${city} ki watch party mein aaja, mere saath yoga karte hain → ${link}`;
  }
  return `Yoga watch party chal rahi hai, mere saath aaja → ${link}`;
}

/**
 * Trigger 3 — city competition (Phase 5 leaderboard). Exposed here so
 * Phase 5 doesn't need to redefine copy.
 *
 * Spec template:
 *   "Mumbai peechhe hai leaderboard pe 😤
 *    Signup kar apni city ke liye → yogaparty.vercel.app?ref={userId}"
 */
export function cityCompetitionCopy({ cityName, refId }: CopyArgs): string {
  const link = withRef(getAppUrl(), refId);
  const city = cleanCity(cityName) || 'Apni city';
  return `${city} peechhe hai leaderboard pe 😤 Signup kar apni city ke liye → ${link}`;
}

/**
 * Trigger 4 — post-session (Phase 7 polish). Exposed here for that phase.
 *
 * Spec template:
 *   "Abhi 23 logon ke saath yoga kiya Mumbai se 🧘
 *    Tu bhi try kar → yogaparty.vercel.app?ref={userId}"
 */
export function postSessionCopy({ cityCount, cityName, refId }: CopyArgs): string {
  const link = withRef(getAppUrl(), refId);
  const count = typeof cityCount === 'number' && cityCount > 0 ? cityCount : 0;
  const city = cleanCity(cityName);
  if (count >= 2 && city) {
    return `Abhi ${count} logon ke saath yoga kiya ${city} se 🧘 Tu bhi try kar → ${link}`;
  }
  if (city) {
    return `Abhi yoga kiya ${city} se 🧘 Tu bhi try kar → ${link}`;
  }
  return `Abhi yoga watch party kiya 🧘 Tu bhi try kar → ${link}`;
}
