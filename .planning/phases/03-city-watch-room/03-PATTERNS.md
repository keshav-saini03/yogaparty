# Phase 3: City Watch Room - Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 19 new + 2 modified
**Analogs found:** 17 / 19 (2 are net-new categories — see "No Analog Found")

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `app/room/[id]/page.tsx` (REPLACE) | route / RSC entrypoint | request-response (cookie + DB read → SSR) | `app/signup/page.tsx` (RSC + `getDetectedCity` + render client form) | role-match (server page renders a client child) |
| `app/room/[id]/RoomClient.tsx` (NEW) | client orchestrator component | event-driven (Realtime pub/sub) + state hydration | `components/signup/SignupForm.tsx` (`'use client'` boundary, props-from-server) | role-match (client boundary shape only; no realtime analog exists) |
| `components/room/Player.tsx` (NEW) | view component (iframe wrapper) | event-driven (player → onStateChange → broadcast) | `components/signup/CountryCodeSelect.tsx` (small `'use client'` wrapper) | partial (closest existing tiny client component; no media analog) |
| `components/room/PresenceList.tsx` (NEW) | view component (list) | derived state (presence → render) | `components/landing/CityPreview.tsx` (rank-list with bar/glyph + mono headers) | role-match (list of-people-by-city render shape) |
| `components/room/Chat.tsx` (NEW) | view component (panel + composer) | event-driven (broadcast in/out) | `components/landing/SocialProof.tsx` for header tone + `SignupForm.tsx` for form composer | partial (composer pattern from form; layout panel is net new) |
| `components/room/ChatMessage.tsx` (NEW) | view leaf | request-response (display) | `components/landing/SocialProof.tsx` (single-line ` · `-separated mono row) | partial |
| `components/room/VideoPickerSheet.tsx` (NEW) | view component (modal/sheet) | request-response (selection → server action) | `components/signup/SignupForm.tsx` (form action invocation pattern) | partial |
| `components/room/HostBadge.tsx` (NEW) | view leaf | static | `components/landing/SocialProof.tsx` lines 48–50 (`pulse-dot` + mono uppercase tag) | role-match |
| `components/room/RoomHeader.tsx` (NEW) | view (header) | static + count prop | `app/signup/page.tsx` lines 13–30 (broadcast header) + `components/landing/SocialProof.tsx` (live count copy) | exact (header layout) |
| `lib/videos.ts` (NEW) | const data module | static | `lib/country-codes.ts` (`as const` typed list) | exact |
| `lib/rooms.ts` (NEW — `findOrCreateCityRoom`) | server-only helper | CRUD (find or insert) | `lib/geo.ts` (server-only header reader) shape + `app/actions/signup.ts` lines 52–82 (admin-client read/insert/duplicate handling) | exact (admin-client CRUD) |
| `lib/sync-utils.ts` (NEW — `electHost`, `shouldCorrect`) | pure utility | transform | none in repo (smallest pure helper today is `lib/geo.ts`) | partial (file-shape analog only) |
| `lib/room-types.ts` (NEW — types) | types module | static | `lib/types.ts` + `lib/country-codes.ts` (type alias + named exports) | exact |
| `hooks/usePresence.ts` (NEW) | client hook | event-driven (channel → state) | none — first hook in the repo | no analog |
| `hooks/useRoomSync.ts` (NEW) | client hook | event-driven + interval | none — first hook in the repo | no analog |
| `app/actions/pick-video.ts` (NEW) | server action (mutation) | CRUD (validate + UPDATE) | `app/actions/signup.ts` (full `'use server'` shape: validation, admin client, error returns) | exact |
| `app/actions/signup.ts` (MODIFIED) | server action (mutation) | CRUD + cookie + redirect | itself — adds `cookies().set()` + `findOrCreateCityRoom()` between line 82 (post-insert) and 93/106 (redirects) | self |
| `vitest.config.ts` (NEW) | config | build-time | none — net new test infrastructure | no analog |
| `lib/sync-utils.test.ts` / `lib/rooms.test.ts` / `app/actions/pick-video.test.ts` / `components/room/Chat.test.tsx` (NEW) | test | unit | none — net new | no analog |
| `tests/manual-smoke-phase3.md` (NEW) | doc / checklist | static | `smoke.mjs` (top-level smoke runner pattern) | partial (different format but same role) |
| `package.json` (MODIFIED) | manifest | build-time | itself | self |

---

## Pattern Assignments

### `app/room/[id]/page.tsx` (route / RSC, REPLACE)

**Analog:** `app/signup/page.tsx` (lines 1–30) for header chrome and RSC shape; `app/room/[id]/page.tsx` (current placeholder, lines 1–14) for the existing `params: Promise<{ id }>` Next.js 15 dynamic-route signature.

**Imports + dynamic-params shape** (current placeholder, lines 1–10):
```tsx
import Link from 'next/link';

type Params = Promise<{ id: string }>;

export default async function RoomPlaceholder({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
```
*Reuse the `Promise<Params>` typing and `await params` exactly as-is.*

**Broadcast header to keep / lift into `RoomHeader.tsx`** (current `app/room/[id]/page.tsx` lines 14–29):
```tsx
<header className="border-b border-[color:var(--line)]">
  <div className="mx-auto max-w-6xl w-full px-6 py-4 flex items-center gap-4">
    <span className="pulse-dot" aria-hidden />
    <span className="font-mono text-[0.7rem] tracking-[0.22em] uppercase text-[color:var(--live)]">
      On Air
    </span>
    <span className="text-[color:var(--ink-faint)]">|</span>
    <Link href="/" ...>← Watch · Party</Link>
  </div>
</header>
```

**Cookie read + admin fetch + redirect/notFound pattern** (extrapolated from `app/signup/page.tsx` line 8 `await getDetectedCity()` and `app/actions/signup.ts` lines 19–20 UUID regex + lines 52, 85–89 admin-client `.maybeSingle()` calls):
```tsx
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cookieStore = await cookies();
const sessionId = cookieStore.get('yp_session')?.value;
if (!sessionId || !UUID_RE.test(sessionId)) {
  redirect(`/signup?next=${encodeURIComponent(`/room/${roomId}`)}`);
}
const supabase = createAdminClient();
const [{ data: signup }, { data: room }] = await Promise.all([
  supabase.from('signups').select('id, name, city').eq('id', sessionId).maybeSingle(),
  supabase.from('rooms').select('id, type, city, youtube_video_id, is_active').eq('id', roomId).maybeSingle(),
]);
```
*Note: `redirect()` and `notFound()` throw control-flow signals — keep them outside any try/catch (same rule documented in `app/actions/signup.ts:105`).*

---

### `app/room/[id]/RoomClient.tsx` (NEW client orchestrator)

**Analog:** `components/signup/SignupForm.tsx` for the `'use client'` boundary + props-from-server hydration shape. No analog for the channel lifecycle — that comes from `03-RESEARCH.md` §1.

**`'use client'` boundary + typed Props from server** (`SignupForm.tsx` lines 1–14):
```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
// ...
type Props = { detectedCity: string | null };

export function SignupForm({ detectedCity }: Props) {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    createSignup,
    undefined,
  );
```
*Apply the same pattern: receive plain JSON-serializable `signup` and `room` props from the server component; do all live state (channel, participants, videoId, messages) in client `useState`.*

**Browser Supabase client instantiation** (`lib/supabase/client.ts`, full file, 8 lines):
```ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```
*Use `createClient()` from `@/lib/supabase/client` inside `useEffect` — never the admin or server client.*

---

### `components/room/RoomHeader.tsx` (NEW)

**Analog:** `app/signup/page.tsx` lines 13–30 (broadcast header layout), with the live-count copy adapted from `components/landing/SocialProof.tsx` lines 11–22.

**Header layout** (`app/signup/page.tsx` lines 13–30):
```tsx
<header className="border-b border-[color:var(--line)]">
  <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-4">
    <span className="pulse-dot" aria-hidden />
    <span className="font-mono text-[0.7rem] tracking-[0.22em] uppercase text-[color:var(--live)]">
      On Air
    </span>
    <span className="text-[color:var(--ink-faint)]">|</span>
    <Link href="/" className="font-mono text-[0.72rem] tracking-[0.18em] uppercase ...">
      ← Watch · Party
    </Link>
    <span className="ml-auto font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)] hidden sm:inline">
      Step 1 / 1
    </span>
  </div>
</header>
```
*Replace the "Step 1 / 1" slot with the live count + city copy below; reserve a sibling `<span>` slot on the right for Phase 4's WhatsApp share (CONTEXT.md Phase Boundary).*

**Live count copy** (`components/landing/SocialProof.tsx` lines 11–22):
```tsx
<>
  <span className="font-mono text-[color:var(--ink)] tabular-nums">
    {fmt.format(cityCount)}
  </span>{' '}
  people from{' '}
  <span className="font-mono uppercase tracking-[0.12em] text-[color:var(--ink)]">
    {city}
  </span>{' '}
  watching
</>
```
*Use the room's city (D-323), not the viewer's. Append "right now" per CONTEXT.md.*

---

### `components/room/Player.tsx` (NEW)

**Analog:** `components/signup/CountryCodeSelect.tsx` for the minimal `'use client'` wrapper shape. No media analog — sourcing from RESEARCH.md §2 for `react-youtube` API.

**`'use client'` mini-wrapper shape** (`CountryCodeSelect.tsx` full file):
```tsx
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/country-codes';

export function CountryCodeSelect() {
  return (
    <select
      name="country_code"
      defaultValue={DEFAULT_COUNTRY_CODE}
      aria-label="Country code"
      className="field field-mono w-auto pr-2"
      style={{ flexShrink: 0 }}
    >
      {COUNTRY_CODES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} {c.label}
        </option>
      ))}
    </select>
  );
}
```
*Apply: `'use client'` directive at top of file (this analog inherits it from a parent — the new `Player.tsx` must declare it explicitly because `react-youtube` is client-only per RESEARCH.md §2). Wrap `<YouTube>` in a `<div className="aspect-video w-full">` (RESEARCH.md Pitfall 5).*

**Player options** (RESEARCH.md §2 lines 266–286 — copy verbatim into Player.tsx):
```ts
const HOST_OPTS = {
  width: '100%', height: '100%',
  playerVars: { controls: 1, disablekb: 1, rel: 0, modestbranding: 1, playsinline: 1 },
};
const VIEWER_OPTS = { ...HOST_OPTS, playerVars: { ...HOST_OPTS.playerVars, controls: 0 } };
```

---

### `components/room/PresenceList.tsx` (NEW)

**Analog:** `components/landing/CityPreview.tsx` (lines 18–46) for the typographic list aesthetic: numbered, mono-uppercased name, divider rules, `tabular-nums`.

**List shell + row shape** (`CityPreview.tsx` lines 18–46):
```tsx
<ol className="divide-y divide-[color:var(--line)]">
  {cities.map((c, i) => (
    <li
      key={c.city}
      className="grid grid-cols-[3rem_1fr_auto] items-center gap-4 sm:gap-6 py-4 group"
    >
      <span className="font-mono tabular-nums text-[color:var(--ink-mute)] text-sm">
        {String(i + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <div className="font-mono uppercase tracking-[0.14em] text-base sm:text-lg text-[color:var(--ink)] truncate">
          {c.city}
        </div>
        ...
```
*Apply to `<PresenceList>`: replace `c.city` with `{participant.name} · {participant.city}` per D-323; replace the bar chart with `<HostBadge>` for the elected host; chip-row variant for header (`flex overflow-x-auto gap-2`) per D-322.*

---

### `components/room/HostBadge.tsx` (NEW)

**Analog:** `components/landing/SocialProof.tsx` lines 47–55 — the `pulse-dot` + mono-uppercase live tag is the closest stylistic precedent.

**Tag pattern** (`SocialProof.tsx` lines 48–51):
```tsx
<span className="pulse-dot" aria-hidden />
<span className="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[color:var(--live)]">
  Live
</span>
```
*Adapt: use `--accent` (D-312), the `◆` glyph or `HOST` text:*
```tsx
<span
  className="font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--accent)]"
  title="Controls playback for the room."
  aria-label="Host"
>
  ◆ HOST
</span>
```

---

### `components/room/Chat.tsx` (NEW)

**Analog:** `components/signup/SignupForm.tsx` (lines 22–88) for the form/composer shape; no analog for the panel layout — vanilla CSS sheet/sidebar pattern is from RESEARCH.md §7.

**Composer pattern** (`SignupForm.tsx` lines 22–37, 73–76):
```tsx
<form action={formAction} className="space-y-6">
  <input
    id="signup-name"
    name="name"
    required
    placeholder="What should we call you?"
    autoComplete="name"
    className="field"
  />
  ...
  <button type="submit" disabled={pending} className="cta w-full justify-center">
    {pending ? 'Joining…' : 'Tune in'}
    <span className="arrow" aria-hidden />
  </button>
```
*Apply: use `.field` for the chat input; use `.cta` (or a smaller button matching the design) for send. Wire `onSubmit` to call `channel.send({ type: 'broadcast', event: 'chat', payload: {...} })` AND optimistically append to local state (because `broadcast.self: false` per RESEARCH.md §1).*

**Panel layout** (RESEARCH.md §7 — vanilla CSS, no library):
```tsx
<aside
  className={cn(
    'fixed inset-x-0 bottom-0 z-40 max-h-[60vh] transform transition-transform duration-300',
    isOpen ? 'translate-y-0' : 'translate-y-full',
    'border-t border-[color:var(--line)] bg-[color:var(--bg-raised)]',
    'md:static md:inset-auto md:max-h-none md:h-full md:w-80 md:translate-y-0 md:border-l md:border-t-0',
  )}
>
```

---

### `components/room/ChatMessage.tsx` (NEW)

**Analog:** `components/landing/SocialProof.tsx` lines 14–20 — single mono-uppercase name + soft body text + ` · ` separators.

**Row shape**:
```tsx
<div className="py-2">
  <span className="font-mono uppercase tracking-[0.12em] text-[0.7rem] text-[color:var(--ink-mute)]">
    {user}
  </span>
  <span className="text-[color:var(--ink-faint)] mx-2">·</span>
  <span className="text-[color:var(--ink)]">{text}</span>
</div>
```
*React's default JSX escaping handles user-supplied strings (RESEARCH.md Security §V5); never `dangerouslySetInnerHTML`.*

---

### `components/room/VideoPickerSheet.tsx` (NEW)

**Analog:** `components/signup/SignupForm.tsx` for the server-action invocation pattern via `useActionState` (or a direct `await pickVideo(...)` call); list rendering analog from `components/landing/CityPreview.tsx`.

**Server action call shape** (`SignupForm.tsx` lines 11–14):
```tsx
const [state, formAction, pending] = useActionState<SignupState, FormData>(
  createSignup,
  undefined,
);
```
*Or, simpler — a direct async click handler since pickVideo takes 2 args (not a FormData):*
```tsx
const onPick = async (videoId: string) => {
  const result = await pickVideo(room.id, videoId);
  if ('error' in result) { setError(result.error); return; }
  setVideoIdLocal(videoId);
  channel.send({ type: 'broadcast', event: 'sync_play', payload: { timestamp: 0, videoId } });
  onClose();
};
```

**Card grid styling** — reuse `.field`-style border + `var(--bg-raised)` background tokens visible throughout `app/signup/page.tsx` lines 70–80.

---

### `lib/videos.ts` (NEW)

**Analog:** `lib/country-codes.ts` (full file, 19 lines).

**Pattern** (`lib/country-codes.ts` lines 1–18):
```ts
export type CountryCode = {
  code: string;
  label: string;
};

export const COUNTRY_CODES: readonly CountryCode[] = [
  { code: '+91',  label: '🇮🇳 India' },
  ...
] as const;

export const DEFAULT_COUNTRY_CODE = '+91';
```
*Apply verbatim shape — exported `type` + `as const` array. From RESEARCH.md §Code Examples, the type and seed entries:*
```ts
export type CuratedVideo = {
  id: string;
  title: string;
  durationSec: number;
  thumbnail?: string;
};
export const CURATED_VIDEOS: readonly CuratedVideo[] = [
  { id: 'PLACEHOLDER_ID_1', title: 'Morning Energizer · 10 min', durationSec: 600 },
  // ...
] as const;
```

---

### `lib/rooms.ts` (NEW — `findOrCreateCityRoom`)

**Analog:**
- File-shape: `lib/geo.ts` (small server-only helper module).
- CRUD-shape: `app/actions/signup.ts` lines 52–98 (admin-client insert/select with duplicate handling).

**Server-only marker + admin-client setup** (`app/actions/signup.ts` lines 1–4, 52):
```ts
'use server';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
// ...
const supabase = createAdminClient();
```
*Apply: top of `lib/rooms.ts` use `import 'server-only';` (RESEARCH.md §6) instead of `'use server'` because this is a helper, not an action. Functions don't need to be `async` *just* for the directive, but `findOrCreateCityRoom` will be async because of DB calls.*

**Find-then-insert with duplicate-collision retry** (`app/actions/signup.ts` lines 54–94 — the canonical pattern; mirror its structure):
```ts
let { data, error } = await supabase
  .from('signups')
  .insert({ name, phone, country_code: countryCode, city, referrer_id: referrerId })
  .select('id')
  .single();

// FK violation retry (different concern but same retry shape)
if (error?.code === '23503' && referrerId !== null) {
  // retry
}

// Duplicate-key path returns existing row
if (error?.code === '23505') {
  const existing = await supabase
    .from('signups')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  if (existing.data?.id) {
    redirect(`/room/${existing.data.id}`);
  }
  ...
}
```
*Apply to `findOrCreateCityRoom`:*
1. SELECT existing by `eq('type','city').eq('city', cityKey).eq('is_active', true).maybeSingle()` — same `.maybeSingle()` pattern as line 89.
2. INSERT with `.select('id').single()` — same chain as lines 54–64.
3. On insert error, re-SELECT (the race-loser path; analogous to the duplicate-recovery select on lines 85–89).
4. Throw on terminal failure (no `redirect()` — this is a helper, callers handle errors).
5. **Do NOT use the `'use server'` directive** — that's for server-action exports only. Use `import 'server-only';` (compile-time guard).
6. `cityKey = (rawCity ?? 'GLOBAL').trim() || 'GLOBAL'` per RESEARCH.md §6.

---

### `lib/sync-utils.ts` (NEW — `electHost`, `shouldCorrect`)

**Analog:** No direct match. File-shape similar to `lib/geo.ts` (small typed helper). Function bodies come from RESEARCH.md §3 / §4.

**Pure functions to extract** (RESEARCH.md §4 + §3):
```ts
import type { Participant } from '@/lib/room-types';

export function electHost(participants: readonly Participant[]): Participant | null {
  if (participants.length === 0) return null;
  return [...participants].sort(
    (a, b) => (a.joined_at - b.joined_at) || a.user_id.localeCompare(b.user_id),
  )[0];
}

export function shouldCorrect(hostTime: number, clientTime: number, threshold = 2): boolean {
  return Math.abs(hostTime - clientTime) > threshold;
}
```
*These two pure functions are the test surface for `lib/sync-utils.test.ts` (Wave 0 task per RESEARCH.md Validation Architecture).*

---

### `lib/room-types.ts` (NEW)

**Analog:** `lib/types.ts` (full file, 2 lines) for the `export type` + named exports shape; `lib/country-codes.ts` line 1–4 for object-type pattern.

**Pattern** — copy verbatim from RESEARCH.md §Code Examples lines 935–950 (already typed against the locked event payloads C-006/C-008).

---

### `hooks/usePresence.ts` & `hooks/useRoomSync.ts` (NEW)

**Analog:** None — first hooks in the codebase. The `useEffect` cleanup pattern is implicit in `components/landing/ReferralCapture.tsx` (lines 8–17 — single-effect listener + early return + cleanup-via-replaceState).

**Cleanup discipline** (`ReferralCapture.tsx` lines 8–17):
```tsx
useEffect(() => {
  const url = new URL(window.location.href);
  const ref = url.searchParams.get('ref');
  if (!ref) return;
  if (!UUID_RE.test(ref)) return;
  localStorage.setItem('yp_ref', ref);
  url.searchParams.delete('ref');
  window.history.replaceState({}, '', url.toString());
}, []);
```
*Carry the early-return + UUID-regex validation discipline forward into the hooks. The full hook bodies are sourced from RESEARCH.md §Code Examples lines 952–1057 — not reprinted here; the planner should treat that section of RESEARCH.md as the canonical sketch.*

**Critical rules** (RESEARCH.md §1, Pitfall 1):
- Open the channel **once** in `<RoomClient>`, not inside the hooks. Pass `channel` down.
- Cleanup pairs: `channel.unsubscribe()` AND `supabase.removeChannel(channel)`.
- Re-issue `channel.track(...)` on every `'SUBSCRIBED'` callback (not just the first) — RESEARCH.md Pitfall 7.

---

### `app/actions/pick-video.ts` (NEW server action)

**Analog:** `app/actions/signup.ts` (full file, 107 lines) — exact match (server-action with admin-client + validation + structured return).

**File-header pattern** (`app/actions/signup.ts` lines 1–8):
```ts
'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDetectedCity } from '@/lib/geo';
import type { SignupState } from '@/lib/types';
```
*Apply to `pick-video.ts`:*
```ts
'use server';
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CURATED_VIDEOS } from '@/lib/videos';
```

**UUID guard pattern** (`app/actions/signup.ts` lines 19–20, 45–47):
```ts
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let referrerId: string | null = UUID_RE.test(rawReferrer) ? rawReferrer : null;
```
*Apply to `pick-video.ts` — validate `roomId` against the regex; reject early with structured error.*

**Structured return + admin-client mutation** (`app/actions/signup.ts` lines 52, 100–103):
```ts
const supabase = createAdminClient();
// ...
if (error || !data) {
  console.error('signup insert failed', error);
  return { error: 'Something went wrong. Try again.' };
}
```
*Apply to `pick-video.ts`:*
```ts
export async function pickVideo(
  roomId: string,
  videoId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!UUID_RE.test(roomId)) return { error: 'invalid room' };
  if (!CURATED_VIDEOS.find(v => v.id === videoId)) return { error: 'invalid video' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('rooms')
    .update({ youtube_video_id: videoId })
    .eq('id', roomId);
  if (error) return { error: 'update failed' };
  return { ok: true };
}
```

---

### `app/actions/signup.ts` (MODIFIED — Phase 2 deviation resolution)

**Self-analog.** Two surgical edits to land per CONTEXT.md D-302/D-304/D-305:

**Edit A — at line 92 (duplicate-phone idempotent path), replace:**
```ts
if (existing.data?.id) {
  // Idempotent submit path: existing signup should land in the same room URL.
  redirect(`/room/${existing.data.id}`);
}
```
**With:**
```ts
if (existing.data?.id) {
  const c = await cookies();
  c.set('yp_session', existing.data.id, { /* see Shared Patterns → Cookie */ });
  const room = await findOrCreateCityRoom(city);
  redirect(nextParam ?? `/room/${room.id}`);
}
```

**Edit B — at lines 105–106 (fresh-signup path), replace:**
```ts
// redirect() throws a control-flow signal — MUST be outside any try/catch.
redirect(`/room/${data.id}`);
```
**With:**
```ts
const c = await cookies();
c.set('yp_session', data.id, { /* see Shared Patterns → Cookie */ });
const room = await findOrCreateCityRoom(city);
redirect(nextParam ?? `/room/${room.id}`);
```

**`?next=` param plumbing — add at top of `createSignup` body** (read from `formData`):
```ts
const rawNext = formData.get('next')?.toString() ?? '';
const NEXT_RE = /^\/room\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nextParam = NEXT_RE.test(rawNext) ? rawNext : null;
```
*The `next` value reaches the server action via a hidden `<input>` in `SignupForm.tsx`, populated from `useSearchParams()` (mirror the `referrerId` pattern at `SignupForm.tsx:71`).*

**Critical ordering rule** (already documented at `app/actions/signup.ts:105`):
> `redirect()` throws a control-flow signal — MUST be outside any try/catch.
Cookie `set()` MUST run **before** `redirect()` in the same flow (RESEARCH.md Pitfall 6).

---

### `vitest.config.ts` (NEW Wave 0 config)

**Analog:** None. Use the minimal jsdom-environment config from RESEARCH.md §Wave 0 Gaps:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { environment: 'jsdom', globals: true, setupFiles: ['./vitest.setup.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },  // mirrors tsconfig paths
});
```
*Mirror the `@/*` alias from `tsconfig.json` line 22 so test files can `import '@/lib/sync-utils'` like production code does.*

---

### Test files (NEW)

**Analog:** None — first tests in the repo. Each test follows the standard vitest `describe`/`it`/`expect` shape; mock Supabase admin client per file.

| Test File | Targets | Notes |
|-----------|---------|-------|
| `lib/sync-utils.test.ts` | `electHost`, `shouldCorrect` pure functions | No mocks needed; pure-function tests. |
| `lib/rooms.test.ts` | `findOrCreateCityRoom` | Mock `createAdminClient` (vi.mock); assert "second call returns same id". |
| `app/actions/pick-video.test.ts` | `pickVideo` validation | Mock admin; assert rejection of non-curated `videoId` and invalid UUID. |
| `components/room/Chat.test.tsx` | Chat receipt-order render | `@testing-library/react`; mock channel as plain emitter. |

---

### `tests/manual-smoke-phase3.md` (NEW)

**Analog:** `smoke.mjs` (top-level smoke runner). The new file is markdown, not JS — checklist format from RESEARCH.md §Validation Architecture "Manual smoke checklist" (9 numbered steps).

---

## Shared Patterns

### Authentication / Identity

**Source:** `app/actions/signup.ts` (line 50 city resolution, lines 19–20 UUID guard) + new `yp_session` cookie pattern from CONTEXT.md D-305.

**Cookie set options** (RESEARCH.md §5 / §8 — apply identically in BOTH signup branches):
```ts
import { cookies } from 'next/headers';
const c = await cookies();
c.set('yp_session', insertedRow.id, {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30,  // 30 days
});
```

**Apply to:** `app/actions/signup.ts` (both redirect branches), `app/room/[id]/page.tsx` (read side via `cookieStore.get('yp_session')`).

**UUID regex** (`app/actions/signup.ts` lines 19–20):
```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```
**Apply to:** `app/room/[id]/page.tsx` (validate `roomId` and `sessionId`), `app/actions/pick-video.ts` (validate `roomId`), `app/actions/signup.ts` (validate `next` param against the room-scoped variant — see D-308).

---

### Server-Side Mutations (RLS Bypass)

**Source:** `lib/supabase/admin.ts` (full file, 20 lines) + the comment block at `app/actions/signup.ts` lines 11–17.

**Pattern:**
```ts
import { createAdminClient } from '@/lib/supabase/admin';
const supabase = createAdminClient();
// All INSERT / UPDATE / DELETE on signups, rooms, etc. go through this client.
```

**Apply to:** `lib/rooms.ts` (`findOrCreateCityRoom`), `app/actions/pick-video.ts`, the read in `app/room/[id]/page.tsx`.

**Rule (Plan 02-02 Rule-3 pivot, restated at `app/actions/signup.ts:11–17`):** RLS is enabled on all tables; anon client gets blocked by `42501`. **Always** use `createAdminClient()` for server-side reads/writes; never expose the service-role key to a client component or client-side import path.

---

### Error Handling / Structured Returns

**Source:** `app/actions/signup.ts` lines 25–28, 100–103 (server actions return `Promise<SignupState>`); `lib/types.ts` (`SignupState` shape).

**Pattern** (`signup.ts:25–28, 100–103`):
```ts
export async function createSignup(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  // ...
  if (error || !data) {
    console.error('signup insert failed', error);
    return { error: 'Something went wrong. Try again.' };
  }
}
```

**Apply to:** `app/actions/pick-video.ts` (return `{ ok: true } | { error: string }`); the form-state pattern is unnecessary for `pickVideo` because it's not invoked via a `<form action={...}>`.

**Console-error before structured return** (signup.ts:96, 101): preserve this for any DB error path so failures are diagnosable in Vercel logs.

---

### Validation (Input Allowlists)

**Source:** `app/actions/signup.ts` lines 31–47 (FormData → validate → reject pattern).

**Pattern** (signup.ts:37–47):
```ts
if (!name) {
  return { error: 'Please enter your name.' };
}
if (!/^\d{6,15}$/.test(phone)) {
  return { error: 'Phone must be 6–15 digits.' };
}
let referrerId: string | null = UUID_RE.test(rawReferrer) ? rawReferrer : null;
```

**Apply to:**
- `app/actions/pick-video.ts` — UUID guard on `roomId`, allowlist check on `videoId` against `CURATED_VIDEOS`.
- `app/actions/signup.ts` (modification) — `next` param against `^/room/[0-9a-f-]{36}$` per D-308.
- `app/room/[id]/page.tsx` — UUID regex on the `[id]` route param; `notFound()` on mismatch.

---

### Styling Vocabulary (Broadcast Aesthetic)

**Source:** `app/globals.css` (the design-token surface) — palette in `:root` (lines 4–15), components below.

**Tokens** (lines 4–15):
| Token | Usage |
|-------|-------|
| `--bg` `#0a0a0c` | page background |
| `--bg-raised` `#111114` | cards, sheets, sidebar (chat panel) |
| `--ink` / `--ink-soft` / `--ink-mute` / `--ink-faint` | text scale |
| `--line` `#1c1c22` | hairline borders, dividers |
| `--accent` `#f5b400` | host badge (D-312), CTA, focus ring |
| `--accent-soft` | subtle backgrounds (host-row highlight) |
| `--live` `#19d27a` | "On Air" / live count text |

**Component classes** (lines 51–177):
- `.font-display` — Fraunces serif headlines
- `.font-mono` — JetBrains Mono utility tags / labels / data values
- `.pulse-dot` (lines 69–83) — animated green dot used in headers
- `.rise` (lines 100–103) — staggered entrance animation; pair with inline `style={{ animationDelay: '120ms' }}`
- `.field` / `.field-mono` (lines 106–126) — form inputs (chat composer)
- `.cta` (lines 129–168) — primary action button (chat send, "Pick video", "Reconnect")
- `.eyebrow` (lines 171–177) — tiny mono uppercase label

**Apply to:** every new component in `components/room/*` and the room page itself. Reuse — do not invent new tokens or BEM blocks.

**Concrete reuse map:**
| New component | Tokens / classes to use |
|---------------|-------------------------|
| `RoomHeader.tsx` | `.pulse-dot`, `.font-mono` `--live` (On Air), `--ink-mute` (count copy frame) |
| `HostBadge.tsx` | `.font-mono` + `--accent` |
| `Chat.tsx` composer | `.field`, `.cta`, `--bg-raised`, `--line` |
| `ChatMessage.tsx` | `.font-mono` `--ink-mute` for name; default text `--ink` for body |
| `PresenceList.tsx` | `divide-y divide-[color:var(--line)]`, `tabular-nums`, `.font-mono uppercase tracking-[0.14em]` |
| `VideoPickerSheet.tsx` | `--bg-raised` panel, `--line` borders, `.cta` for "Pick" buttons, `--accent` for selected ring |
| `Player.tsx` wrapper | `aspect-video w-full bg-[color:var(--bg-raised)]` |

---

### Async Dynamic APIs (Next.js 15)

**Source:** `app/signup/page.tsx:8` (`await getDetectedCity()`), `app/room/[id]/page.tsx:10` (`await params`), `lib/supabase/server.ts:5` (`await cookies()`), `lib/geo.ts:4` (`await headers()`).

**Rule:** `cookies()`, `headers()`, and `params` are all async in Next.js 15. Always `await`.

**Apply to:** `app/room/[id]/page.tsx` (await `cookies()`, await `params`), `app/actions/signup.ts` (await `cookies()` before `set()`).

---

### Realtime Channel Lifecycle (NEW shared pattern)

**Source:** None in repo — this is the canonical pattern from RESEARCH.md §1 (verified Supabase docs).

**Apply to:** `app/room/[id]/RoomClient.tsx` exactly once per mount.

```ts
useEffect(() => {
  const supabase = createClient();   // browser client from lib/supabase/client.ts
  const channel = supabase.channel(`room:${roomId}`, {
    config: {
      presence: { key: signupId },
      broadcast: { self: false },     // do NOT receive own broadcasts
    },
  });
  channel
    .on('presence', { event: 'sync' }, () => { /* update state */ })
    .on('broadcast', { event: 'sync_play'    }, ({ payload }) => { /* ... */ })
    .on('broadcast', { event: 'sync_pause'   }, ({ payload }) => { /* ... */ })
    .on('broadcast', { event: 'sync_seek'    }, ({ payload }) => { /* ... */ })
    .on('broadcast', { event: 'sync_correct' }, ({ payload }) => { /* targeted */ })
    .on('broadcast', { event: 'heartbeat'    }, ({ payload }) => { /* host-only drift */ })
    .on('broadcast', { event: 'chat'         }, ({ payload }) => { /* append */ })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Re-track on EVERY resubscribe (mobile-bg reconnect) — RESEARCH.md Pitfall 7
        await channel.track({ user_id: signupId, name, city, joined_at: Date.now() });
      }
    });

  return () => {
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };
}, [roomId, signupId, name, city]);
```

---

## No Analog Found

Files where the codebase has nothing close enough; planner falls back to RESEARCH.md sketches verbatim:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `hooks/usePresence.ts` | hook | event-driven | First hook in repo. Body from RESEARCH.md §Code Examples lines 952–987. |
| `hooks/useRoomSync.ts` | hook | event-driven + interval | First hook in repo. Body from RESEARCH.md §Code Examples lines 989–1057. |
| `vitest.config.ts` | config | build-time | First test framework added to the project. |
| `lib/sync-utils.ts` | pure utility | transform | Smallest existing helper (`lib/geo.ts`) only matches file-shape, not body. Functions sourced from RESEARCH.md §3 / §4. |
| Test files (`*.test.ts`, `*.test.tsx`) | test | unit | First tests in repo. |
| `tests/manual-smoke-phase3.md` | doc / checklist | static | `smoke.mjs` is JS, not the same format. Source: RESEARCH.md §Validation Architecture step list. |

---

## Metadata

**Analog search scope:** `app/`, `app/actions/`, `app/room/[id]/`, `app/signup/`, `components/`, `components/landing/`, `components/signup/`, `lib/`, `lib/supabase/`, `supabase/migrations/`, root config files.
**Files scanned:** 22 source files (full read on each — all small enough for one Read pass).
**Pattern extraction date:** 2026-04-27
**Authoritative locked-decision references:** CONTEXT.md D-301..D-326 (all 26 decisions consulted). Where CONTEXT.md and the analog patterns conflict, CONTEXT.md wins (e.g., admin client over anon client; `'use server'` action over client-side write for `pickVideo`).
