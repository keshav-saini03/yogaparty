# Phase 2: Landing & Signup - Research

**Researched:** 2026-04-27
**Domain:** Next.js 15 server actions, Vercel geolocation headers, Supabase ssr inserts, lightweight UI
**Confidence:** HIGH
**Mode:** Light research (gotcha-focused, hackathon)

## Summary

Phase 1 already locked the stack and shipped `lib/supabase/server.ts` and `middleware.ts`. Everything below is the minimum a solo dev needs to remember to ship the landing + signup flow inside the time budget. Two reminders that pay back the most:

1. **`useFormState` is gone — use `useActionState` from `react` (not `react-dom`)** in Next.js 15 / React 19. The action signature is `(prevState, formData) => Promise<State>`. The hook returns `[state, formAction, pending]` — use `pending` to disable the submit button.
2. **Local dev gives you `null` city.** Phase 1's middleware sets `x-geo-city` to an empty string when geolocation is unavailable. Always fall back, and don't let a missing city break the form — it's a nullable column.

**Primary recommendation:** Build a single client component (`SignupForm.tsx`) that wraps `useActionState`, native `<select>` for the country code, and a hidden input for `referrer_id`. Keep the landing as a server component with one Supabase aggregate read; defer realtime to Phase 5.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Landing**
- Hero copy verbatim: "Watch yoga together with people near you"
- Single CTA "Join a Watch Party" → `/signup`
- Social proof line "X people from {city} watching"; `0 → "Be the first from {city}"`; no city → "X people watching"
- Top-5 cities preview from `signups` aggregate
- Static counter on first paint (real-time wiring deferred to Phase 5)

**Signup form**
- Three fields ONLY: Name, Phone (digits only, separate from country code), Country Code dropdown
- Country code default `+91`. Minimum 9 codes: India, US/Canada (+1), UK (+44), UAE (+971), Singapore (+65), Australia (+61), Saudi Arabia (+966), Germany (+49), France (+33)
- Detected city pre-filled (hidden field or visible "Joining from: {city}" with edit affordance)
- Phone uniqueness enforced at DB level — duplicate surfaces friendly error: "This number is already in! Check your messages — you're already part of YogaParty."
- No password, no OTP, no email — ever
- Referral: read `?ref=<userId>` on landing → localStorage → hidden field on signup → `signups.referrer_id`
- On success redirect to `/room/[id]` (Phase 3 placeholder route)

**Server-side city detection**
- Read via `await headers()` then `.get('x-geo-city')` (Phase 1 middleware injects)
- Empty/missing → `null` city → user lands in a "global" room concept (Phase 3 detail)

**Server actions pattern**
- Use Next.js 15 server actions (no API route). Read form fields, headers, referrer_id, insert via `lib/supabase/server.ts`. Return `{ error }` or redirect.
- Client form uses `useActionState` for error display.

**Performance constraints**
- Bundle < 100KB
- Loads < 2s on 4G
- Mobile-first, system font stack only, no external script tags

### Claude's Discretion
- System font stack (recommend `font-sans` Tailwind default which is already a system stack in Tailwind v4)
- shadcn/ui Button + Input or hand-rolled — recommendation below in Topic 5
- Native `<select>` vs combobox for country code — recommendation below in Topic 5
- Inline error rendering (no toast)

### Deferred Ideas (OUT OF SCOPE)
- Real-time live counter (Phase 5)
- WhatsApp share buttons (Phase 4)
- Squad creation (Phase 6)
- Watch room rendering (Phase 3)
- Multilingual / Hindi UI
- Captcha / bot protection
- A/B copy testing
- Analytics SDKs
- Email or OTP — excluded forever
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-LANDING | Mobile-first landing < 100KB / < 2s with hero, social proof, top-5 cities, static counter | Topic 6 (perf budget checklist), Topic 5 (lean UI), Topic 2 (city read for social proof) |
| REQ-SIGNUP | Three-field signup with phone uniqueness, friendly duplicate error, redirect to `/room/[id]` | Topic 1 (`useActionState` form), Topic 3 (Supabase insert + 23505), Topic 4 (referral attribution) |
| REQ-INTERNATIONAL | Country-code dropdown with international codes, city detection works for non-IN visitors, lands in detected city's room | Topic 2 (`headers().get('x-geo-city')`), Topic 5 (country code dropdown), CONTEXT.md locked country list |
</phase_requirements>

## Topic 1 — `useActionState` for the signup form

**`useFormState` was renamed to `useActionState`** in React 19 / Next.js 15 — same shape, new name, and it's now imported from `react`, not `react-dom`. The hook returns `[state, formAction, pending]`; `pending` is the third tuple slot and is exactly what we need to disable the CTA during submit. [VERIFIED: react.dev/reference/react/useActionState] [VERIFIED: nextjs.org/docs/app/guides/forms]

The server action signature is `(prevState, formData) => Promise<State>`. Type the state once, reuse it in both the action and the hook. Returning `{ ok: true, redirectTo }` is one option, but in our case we want `redirect()` from `next/navigation` to do the navigation for us — `redirect()` throws a special control-flow exception, so it must be called **outside** any `try/catch` that catches all errors.

**Server action (`app/actions/signup.ts`):**
```ts
// Source: nextjs.org/docs/app/guides/forms + react.dev/reference/react/useActionState
'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export type SignupState = { error?: string } | undefined;

export async function createSignup(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  const name = formData.get('name')?.toString().trim();
  const phone = formData.get('phone')?.toString().trim();
  const countryCode = formData.get('country_code')?.toString() ?? '+91';
  const referrerId = formData.get('referrer_id')?.toString() || null;

  if (!name || !phone) return { error: 'Please fill name and phone.' };
  if (!/^\d{6,15}$/.test(phone)) return { error: 'Phone must be 6–15 digits.' };

  const h = await headers();
  const city = h.get('x-geo-city') || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('signups')
    .insert({ name, phone, country_code: countryCode, city, referrer_id: referrerId })
    .select('id')
    .single();

  if (error?.code === '23505') {
    return {
      error:
        "This number is already in! Check your messages — you're already part of YogaParty.",
    };
  }
  if (error || !data) return { error: 'Something went wrong. Try again.' };

  // redirect() throws a control-flow signal — must be outside try/catch
  redirect(`/room/${data.id}`);
}
```

**Client component (`components/signup/SignupForm.tsx`):**
```tsx
// Source: react.dev/reference/react/useActionState
'use client';

import { useActionState, useEffect, useState } from 'react';
import { createSignup, type SignupState } from '@/app/actions/signup';

export function SignupForm({ detectedCity }: { detectedCity: string | null }) {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    createSignup,
    undefined
  );
  const [referrerId, setReferrerId] = useState('');

  useEffect(() => {
    setReferrerId(localStorage.getItem('yp_ref') ?? '');
  }, []);

  return (
    <form action={formAction} className="space-y-3">
      <input name="name" required placeholder="Name" />
      <input name="phone" required inputMode="numeric" pattern="\d*" placeholder="Phone" />
      {/* country code <select> here — see Topic 5 */}
      <input type="hidden" name="referrer_id" value={referrerId} />
      <input type="hidden" name="city" value={detectedCity ?? ''} />
      <button type="submit" disabled={pending}>
        {pending ? 'Joining...' : 'Join the Watch Party'}
      </button>
      {state?.error && <p role="alert" className="text-red-600 text-sm">{state.error}</p>}
    </form>
  );
}
```

**Gotchas:**
- Import `useActionState` from `'react'`, not `'react-dom'`. The `react-dom` `useFormState` import will throw a deprecation/not-found warning. [VERIFIED: react.dev/reference/react/useActionState]
- `redirect()` must run **outside** a `try/catch(err) {}` that swallows everything; it works by throwing a special signal Next.js catches.
- Initial state must match the type — passing `null` when state is `{ error?: string } | undefined` is a TS error; pass `undefined`.
- `pending` is `false` until the first submit, then `true` until the action returns. No need for a separate `useTransition`.

**DECISION FOR PHASE 2:** Use `useActionState` from `react`. Server action returns `{ error?: string } | undefined`. Render `state.error` inline. Disable button on `pending`. `redirect()` on success — outside any catch-all try/catch.

## Topic 2 — Reading geolocation headers in server actions / RSC

Phase 1's middleware already sets `x-geo-city` and `x-geo-country` on every non-static request. Reading them is one line plus a fallback. `headers()` is **async** in Next.js 15 — same API surface as `cookies()`. [VERIFIED: nextjs.org/docs/app/api-reference/functions/headers]

```ts
// Source: nextjs.org/docs/app/api-reference/functions/headers
import { headers } from 'next/headers';

export async function getDetectedCity(): Promise<string | null> {
  const h = await headers();
  const raw = h.get('x-geo-city');
  if (!raw) return null;                         // missing or empty
  try {
    const decoded = decodeURIComponent(raw);     // Vercel URL-encodes city names
    return decoded.trim() || null;
  } catch {
    return raw.trim() || null;                   // malformed encoding — return as-is
  }
}

export async function getDetectedCountry(): Promise<string | null> {
  const h = await headers();
  const c = h.get('x-geo-country');
  return c?.trim() || null;
}
```

**Edge cases that matter:**
- **Header missing entirely** → `h.get(...)` returns `null`. Treat as "city unknown".
- **Header empty string** → middleware writes `''` when `geolocation()` returns `undefined` (e.g., localhost). Treat as "city unknown".
- **URL-encoded city names** — Vercel encodes city names containing spaces or non-ASCII (e.g., `S%C3%A3o%20Paulo` for "São Paulo"). Always run them through `decodeURIComponent`. [VERIFIED: vercel.com/docs/edge-network/headers#x-vercel-ip-city]
- **Local dev** → always `null`. Don't rely on city for any flow that must work in dev. The CONTEXT permits a `null` city; the schema permits it.

**Place this helper in `lib/geo.ts`** so both `app/page.tsx` (for social proof) and `app/signup/page.tsx` (for the hidden field) consume the same logic.

**Gotchas:**
- `await headers()` — forgetting `await` produces the same Turbopack warning as `cookies()` and breaks the read.
- Don't pass `headers()` results across server/client boundaries; always read inside the server component or action.

**DECISION FOR PHASE 2:** Add `lib/geo.ts` exporting `getDetectedCity()` and `getDetectedCountry()`. Both helpers `await headers()`, `decodeURIComponent`, return `null` on miss. Use in `app/page.tsx` server component and inside `createSignup` for the actual write.

## Topic 3 — Supabase server-side INSERT with `.select()` and 23505 detection

`@supabase/ssr` v0.10 doesn't change the data API — `insert(...).select('id').single()` is the same shape it has been since `@supabase/supabase-js` v2. The combination returns `{ data: { id } | null, error: PostgrestError | null }`. On a unique constraint violation, the underlying Postgres error code `23505` is propagated as `error.code === '23505'`. [VERIFIED: supabase.com/docs/reference/javascript/insert] [VERIFIED: postgresql.org/docs/current/errcodes-appendix.html]

```ts
// Source: supabase.com/docs/reference/javascript/insert + .select()
const { data, error } = await supabase
  .from('signups')
  .insert({
    name,
    phone,
    country_code: countryCode,
    city,
    referrer_id: referrerId,
  })
  .select('id')           // tell Supabase to return columns
  .single();              // expect exactly one row → data is { id } not { id }[]

if (error?.code === '23505') {
  // Friendly duplicate message
  return { error: "This number is already in! ..." };
}
if (error) {
  // Log to server console for debugging — never to the user
  console.error('signup insert failed', error);
  return { error: 'Something went wrong. Try again.' };
}

// data.id is the new signup UUID
```

**Gotchas:**
- **Missing `.select()`** → `data` will be `null` even on success. You won't get the new row's ID back. The redirect target needs the ID, so `.select('id').single()` is mandatory.
- **`.single()` requires exactly one row.** If you ever insert an array, switch to `.select().single()` after the array insert and Supabase will still return the single row when you inserted one element. For belt-and-suspenders, only insert one object at a time.
- **23505 message text varies** — never grep `error.message` for "duplicate"; always check `error.code`. The code is stable across Postgres versions.
- **Other constraint codes worth knowing** (informational, not used in Phase 2): `23503` foreign key violation (would fire if `referrer_id` doesn't exist — but our flow doesn't enforce FK on referrer_id at write time; the schema does, so an invalid referrer would 23503 and we'd want to retry with `referrer_id = null`). For Phase 2 we'll either validate the referrer first or simply set null on any error other than 23505.
- **RLS not enabled in Phase 1** → anon-key inserts work directly. When Phase 4 adds RLS, the signup INSERT will need a policy or this action breaks. Note for Phase 4 plan-checker.
- **Service role key not needed here** — anon key with default permissions can write to `signups` because RLS is off.

**Recommended simplification:** Don't pre-validate the referrer UUID. If 23503 fires, retry once with `referrer_id = null`. Or, simplest: validate UUID format with a regex before insert and skip if malformed. Self-referral check is easy because we don't have a current signup ID yet — the new signup can't refer itself, so no check needed.

**DECISION FOR PHASE 2:** Use `insert({...}).select('id').single()`. Branch on `error.code === '23505'` for friendly duplicate. All other errors → generic "Something went wrong" + `console.error`. Don't pre-validate the referrer UUID — just regex-check it's UUID-shaped before insert; if not, set to `null`.

## Topic 4 — Referral attribution: client-side useEffect (recommended)

Three viable approaches; one is correct for hackathon scope.

| Approach | Hydration risk | Implementation cost | Survives navigation |
|----------|----------------|---------------------|----------------------|
| **`useEffect` on landing reads `?ref=`, writes localStorage; signup form `useEffect` reads localStorage and sets hidden input** | None (state starts empty, hydrates from localStorage on client) | 10 lines | Yes — localStorage persists |
| Cookie set in middleware on `?ref=` query param | None (server can read it) | Middleware logic + cookie config | Yes — but requires `Set-Cookie` from middleware which means no `NextResponse.next()` shortcut |
| Server action reads `?ref=` from request URL | None — but this only works if user signs up on the same request as the landing visit | Trivial | No — loses ref across navigation |

The CONTEXT explicitly says "read on landing → store localStorage → submit via hidden field." That is the localStorage approach. It's also genuinely the simplest: zero middleware changes, zero cookie management, zero edge-runtime concerns.

**Hydration mismatch is the only real risk.** Mitigate by:
1. **Initialize the hidden input value to an empty string** in initial render. Read localStorage in `useEffect` and `setState`. Server-rendered HTML and first-client-render HTML both show `value=""`, then a re-render fills it. No mismatch warning.
2. **Don't read localStorage during render.** That would cause a server (no localStorage) vs client mismatch.

**Landing page side (one-time capture, runs only when `?ref=` is in the URL):**

```tsx
// Source: pattern derived from React 19 hydration rules; localStorage is browser-only
'use client';

import { useEffect } from 'react';

export function ReferralCapture() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get('ref');
    if (!ref) return;

    // UUID-ish check — cheap defense against junk
    if (!/^[0-9a-f-]{36}$/i.test(ref)) return;

    localStorage.setItem('yp_ref', ref);

    // Clean URL so we don't keep the ?ref= param visible
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', url.toString());
  }, []);

  return null;
}
```

Mount this anywhere in the landing page; it's a no-op on every render after the first.

**Signup page side (read at form mount):**
```tsx
// already shown in Topic 1 SignupForm — useEffect reads yp_ref into a state variable
// and the hidden input renders that state into the form
```

**Gotchas:**
- **`localStorage` is undefined during SSR.** Always read it inside `useEffect`, never in a function-component body.
- **Self-referral**: the new signup hasn't been created yet, so `yp_ref` cannot equal the current user's id. Skip the self-check; CONTEXT only flags it as a future concern.
- **Empty string vs null in the hidden input**: send `''` (empty) and let the server action coerce to `null` (the action already does `formData.get('referrer_id')?.toString() || null`).
- **Privacy / cleanup**: removing `?ref=` from the URL via `history.replaceState` keeps the address bar clean and prevents accidental re-capture. Optional but recommended.

**DECISION FOR PHASE 2:** Client-side localStorage. Add `<ReferralCapture />` to the landing page (`app/page.tsx`) — it's a tiny client component. Read `yp_ref` in `SignupForm` via `useEffect` and pass through a hidden input. Server action coerces empty string to `null`.

## Topic 5 — Country code dropdown: native `<select>`

For 9 options on a mobile-first form, native `<select>` wins on every axis that matters in a 48-hour build:

| Criterion | Native `<select>` | shadcn/ui `<Select>` |
|-----------|-------------------|----------------------|
| Bundle weight | 0 KB | ~3-5 KB (Radix Select primitive + styles) |
| Mobile UX | OS-native picker (iOS wheel, Android sheet) | Custom dropdown (worse on mobile) |
| Accessibility | Built in | Good but requires correct wiring |
| Build time | ~5 lines | shadcn add + import + wire |
| Form integration | Submits natively via `name` | Requires controlled state or Hidden input |

The only reason to reach for shadcn `Select` is search-within-options (typeahead) over a long list. With 9 codes, scrolling is fine and OS-native pickers handle them better than any web component on mobile.

```tsx
// Source: native HTML; CONTEXT.md country code list
const COUNTRY_CODES = [
  { code: '+91',  label: 'India 🇮🇳' },
  { code: '+1',   label: 'US/Canada 🇺🇸' },
  { code: '+44',  label: 'UK 🇬🇧' },
  { code: '+971', label: 'UAE 🇦🇪' },
  { code: '+65',  label: 'Singapore 🇸🇬' },
  { code: '+61',  label: 'Australia 🇦🇺' },
  { code: '+966', label: 'Saudi Arabia 🇸🇦' },
  { code: '+49',  label: 'Germany 🇩🇪' },
  { code: '+33',  label: 'France 🇫🇷' },
];

<select
  name="country_code"
  defaultValue="+91"
  className="h-11 rounded border px-2 bg-white"
  aria-label="Country code"
>
  {COUNTRY_CODES.map((c) => (
    <option key={c.code} value={c.code}>{c.code} {c.label}</option>
  ))}
</select>
```

**Gotchas:**
- iOS Safari renders `<option>` content as plain text — emoji flags will display, but custom HTML inside `<option>` won't. Keep options to a string.
- Tap target ≥ 44px → `h-11` (44px) on the trigger satisfies REQ-POLISH-MOBILE early.
- Do **not** style the open dropdown — browsers ignore most CSS on the option list. If design fights this, that's the moment to switch to shadcn — but for the hackathon, accept the OS look.

**Also for Name and Phone inputs:** hand-roll a tiny `<Input>` styled with Tailwind. The shadcn/ui Input is also fine if you want it for consistency, but for Phase 2 a 4-line component beats running `npx shadcn-ui add input` and pulling in helpers we don't need.

**DECISION FOR PHASE 2:** Native `<select>` for country code. Hand-rolled `<input>` (or the simplest possible shadcn/ui Input if it's already added) for Name and Phone. No Radix, no combobox, no search. This keeps the bundle under budget and the OS picker handles mobile beautifully.

## Topic 6 — Lighthouse < 100KB / < 2s budget — what to avoid

The bundle budget is achievable with current defaults if we don't import anything heavy. The Next.js 15 framework runtime + React 19 + Tailwind 4 baseline bundle for a simple page is roughly 80–95 KB gzipped (varies slightly by version). [ASSUMED: based on Next.js 15 stable release reports; verify with `next build` output during Phase 2]

**Quick checklist of things that blow the budget:**

| Hazard | Why it costs | Recommendation |
|--------|--------------|----------------|
| `next/font` with Google Fonts | Adds the font CSS + a fetch (and on older configs, a Next-bundled font file) | **Skip entirely.** Use Tailwind's default `font-sans` (system stack) — it's free, fast, and already gorgeous. |
| Any `<img>` from a CDN | Lighthouse penalizes layout shift + bytes | **No images on the landing.** Hero is pure type. If you must show one, use `next/image` with width/height + `priority`. |
| Animation libraries (framer-motion, lottie) | 30–60 KB each | **Skip.** Counter "animation" is plain CSS transitions on a number; tween with `setInterval` if needed. |
| `react-icons`, `lucide-react` | Per-icon trees can balloon | If you need 1–2 icons, paste the SVG inline. **No icon library imports.** |
| `'use client'` on the page itself | Forces the entire page tree to be a client component | Only mark the SignupForm and ReferralCapture as `'use client'`. Landing is a server component. |
| Date/i18n libs (date-fns, dayjs, intl-messageformat) | 10–40 KB | Not needed — landing has no dates, no formatted numbers heavier than `Intl.NumberFormat` (built-in, free). |
| Analytics (Vercel Analytics, GA, Mixpanel) | ~5–20 KB + a fetch | **Out of scope per CONTEXT.** Don't install. |
| shadcn/ui complex components | Radix primitives are 2–5 KB each, compounding | Per-phase: install only Button + Input if any. Skip Dialog, Select, Popover, etc. |
| Realtime client subscription on landing | Pulls in WebSocket + Realtime client | **Phase 5 only.** Static count from server query for Phase 2. |

**Server-component aggregate query (free perf budget — runs at request time, doesn't ship JS):**

```ts
// app/page.tsx (server component)
import { createClient as createAdminClient } from '@supabase/supabase-js';

async function getLandingStats(detectedCity: string | null) {
  const sb = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const [totalRes, cityRes, topCitiesRes] = await Promise.all([
    sb.from('signups').select('*', { count: 'exact', head: true }),
    detectedCity
      ? sb.from('signups').select('*', { count: 'exact', head: true }).eq('city', detectedCity)
      : Promise.resolve({ count: null }),
    sb.rpc('top_cities', { limit_n: 5 }).then(
      (r) => r,
      // Fallback — write the SQL inline if the RPC doesn't exist; it doesn't yet
      () => sb.from('signups').select('city').not('city', 'is', null).limit(500)
    ),
  ]);

  return {
    total: totalRes.count ?? 0,
    cityCount: cityRes.count ?? 0,
    // Simplest: aggregate top-5 client-side from the limit-500 list, or write a SQL view
  };
}
```

For Phase 2, the simplest path is to **write a SQL view** in `supabase/migrations/0002_landing_views.sql` for the top-5 cities aggregate so the page just does `from('top_cities').select().limit(5)`. Or call `rpc()` against a Postgres function. Either way, the aggregate runs server-side and ships zero JS.

**Quick verification commands during Phase 2:**
```bash
# After build, check the per-route JS budget
npm run build
# Look at the "First Load JS" column — landing should be < 100KB

# Lighthouse on the deployed Vercel URL (not localhost — CDN matters)
npx lighthouse https://yogaparty.vercel.app --only-categories=performance --view
```

**Gotchas:**
- `npm run dev` bundle sizes are misleading (un-tree-shaken). Always check `npm run build` output for the real numbers.
- Vercel's Edge Runtime is faster than Node but unrelated to bundle size — bundle size is fixed at build time.
- 4G mobile target ≈ 1.6 Mbps download. 100 KB ≈ 0.5 s download alone — leaving < 1.5 s for parse, hydrate, paint.

**DECISION FOR PHASE 2:** No Google Fonts, no images, no icon libs, no animation libs, no Realtime, no analytics. Landing is a server component; only `SignupForm` and `ReferralCapture` are client components. Aggregate counts run server-side via a Postgres view or an inline `count: 'exact', head: true` query. Run `npm run build` once during Phase 2 to confirm the budget.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hero rendering, social proof, top-5 cities | Frontend Server (RSC) | Database (read-only) | Static-feeling content with one DB read; no JS shipped |
| Signup form interaction (validation, pending, error display) | Browser / Client | Frontend Server (action) | `useActionState` runs in browser; action runs server-side |
| `createSignup` server action (insert, headers read, redirect) | Frontend Server (Action) | Database | Action is the only writer; uses `lib/supabase/server.ts` with anon key |
| Geolocation header injection | CDN / Edge Middleware | — | Phase 1 already shipped the middleware |
| Referral capture and persistence | Browser / Client | — | localStorage is browser-only; no server cookie needed |
| Phone uniqueness enforcement | Database | — | Schema-level `UNIQUE` constraint; surfaced as 23505 |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form pending state + error display | `useState` + `useTransition` + manual fetch | `useActionState` from `react` | Native React 19 hook; integrates with server actions and progressive enhancement |
| Phone uniqueness check | Pre-insert `select` to see if phone exists | DB `UNIQUE` + 23505 branch | Race-free, atomic, one round trip |
| Country code picker | Custom combobox with search | Native `<select>` | 9 options; OS-native picker is best UX on mobile |
| Referral persistence | Server-side cookie via middleware | localStorage in client | CONTEXT requires localStorage; cookie adds complexity for no win |
| Counter "animation" | framer-motion | CSS transition or plain text | Phase 5 will rewire this for realtime; Phase 2 just renders a number |

## Common Pitfalls

### Pitfall 1: Importing `useFormState` from `react-dom`
**What goes wrong:** Hook works in dev with a deprecation warning, may break in production builds. Pending state may not be exposed.
**Why it happens:** Stale Next.js 13/14 tutorials.
**How to avoid:** Always `import { useActionState } from 'react'` in Next.js 15.
**Warning signs:** Console warning mentioning `useFormState` is deprecated.

### Pitfall 2: `redirect()` swallowed by `try/catch`
**What goes wrong:** Form submit succeeds, but user stays on `/signup` instead of moving to `/room/[id]`.
**Why it happens:** `redirect()` works by throwing a special error. A `try { ... } catch (e) { return { error: ... } }` around the whole action body catches it.
**How to avoid:** Call `redirect()` outside any catch-all. Or `if (e instanceof RedirectError) throw e` — but easier to just structure the action so success path is past the try/catch.
**Warning signs:** No redirect, no error, action returns `{ error: 'Something went wrong' }` after a successful insert.

### Pitfall 3: Hydration mismatch from reading localStorage during render
**What goes wrong:** Console error: "Text content did not match. Server: '' Client: '<uuid>'". React 19 may even discard the client value.
**Why it happens:** Reading `localStorage.getItem('yp_ref')` in the component body runs on the server (where it's `undefined`) and client (where it has a value), producing different HTML.
**How to avoid:** Initialize state to `''`, read localStorage inside `useEffect`, set state.
**Warning signs:** Hydration warning in console, hidden input briefly empty before populating.

### Pitfall 4: Forgetting `await headers()` / `await cookies()`
**What goes wrong:** Turbopack runtime error; the action fails before reaching the database.
**Why it happens:** Next.js 15 made these async; pre-15 tutorials show sync calls.
**How to avoid:** Always `await`. The Phase 1 helpers already do this — copy that pattern.
**Warning signs:** "headers() should be awaited" error in dev console.

### Pitfall 5: Server component going client because of an inadvertent `'use client'`
**What goes wrong:** Landing bundle suddenly grows by tens of KB.
**Why it happens:** Marking `app/page.tsx` as `'use client'` because one nested component needs interactivity.
**How to avoid:** Keep the page as a server component. Mark only the leaf interactive components (`SignupForm`, `ReferralCapture`) as `'use client'`. Server components can render client components freely.
**Warning signs:** `npm run build` shows landing First Load JS > 100KB.

### Pitfall 6: Inserting without `.select()`
**What goes wrong:** `data` is `null` after a successful insert; `redirect(\`/room/${data.id}\`)` throws `Cannot read properties of null`.
**Why it happens:** Supabase by default does not return inserted rows to keep payloads small.
**How to avoid:** Always `.select('id').single()` (or whatever columns you need).
**Warning signs:** Runtime error on signup success path.

## Code Examples

### `lib/geo.ts`
```ts
// Source: nextjs.org/docs/app/api-reference/functions/headers
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
```

### `app/actions/signup.ts` (full)
```ts
'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDetectedCity } from '@/lib/geo';

export type SignupState = { error?: string } | undefined;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createSignup(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  const name = formData.get('name')?.toString().trim();
  const phone = formData.get('phone')?.toString().trim();
  const countryCode = formData.get('country_code')?.toString() || '+91';
  const referrerRaw = formData.get('referrer_id')?.toString() || '';
  const referrerId = UUID_RE.test(referrerRaw) ? referrerRaw : null;

  if (!name) return { error: 'Please enter your name.' };
  if (!phone || !/^\d{6,15}$/.test(phone)) return { error: 'Phone must be 6–15 digits.' };

  const city = await getDetectedCity();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('signups')
    .insert({ name, phone, country_code: countryCode, city, referrer_id: referrerId })
    .select('id')
    .single();

  if (error?.code === '23505') {
    return {
      error:
        "This number is already in! Check your messages — you're already part of YogaParty.",
    };
  }
  if (error || !data) {
    console.error('signup insert failed', error);
    return { error: 'Something went wrong. Try again.' };
  }

  redirect(`/room/${data.id}`);
}
```

### `components/signup/SignupForm.tsx`
```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { createSignup, type SignupState } from '@/app/actions/signup';

const COUNTRY_CODES = [
  { code: '+91',  label: '🇮🇳 India' },
  { code: '+1',   label: '🇺🇸 US/Canada' },
  { code: '+44',  label: '🇬🇧 UK' },
  { code: '+971', label: '🇦🇪 UAE' },
  { code: '+65',  label: '🇸🇬 Singapore' },
  { code: '+61',  label: '🇦🇺 Australia' },
  { code: '+966', label: '🇸🇦 Saudi Arabia' },
  { code: '+49',  label: '🇩🇪 Germany' },
  { code: '+33',  label: '🇫🇷 France' },
];

export function SignupForm({ detectedCity }: { detectedCity: string | null }) {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    createSignup,
    undefined
  );
  const [referrerId, setReferrerId] = useState('');

  useEffect(() => {
    setReferrerId(localStorage.getItem('yp_ref') ?? '');
  }, []);

  return (
    <form action={formAction} className="space-y-3 max-w-sm">
      <input
        name="name"
        required
        placeholder="Your name"
        className="block w-full h-11 rounded border px-3"
      />
      <div className="flex gap-2">
        <select
          name="country_code"
          defaultValue="+91"
          aria-label="Country code"
          className="h-11 rounded border px-2 bg-white"
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} {c.label}
            </option>
          ))}
        </select>
        <input
          name="phone"
          required
          inputMode="numeric"
          pattern="\d*"
          placeholder="Phone number"
          className="block w-full h-11 rounded border px-3"
        />
      </div>
      {detectedCity && (
        <p className="text-sm text-gray-600">Joining from: <strong>{detectedCity}</strong></p>
      )}
      <input type="hidden" name="referrer_id" value={referrerId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full h-11 rounded bg-black text-white font-semibold disabled:opacity-60"
      >
        {pending ? 'Joining…' : 'Join the Watch Party'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
```

### `components/landing/ReferralCapture.tsx`
```tsx
'use client';
import { useEffect } from 'react';

export function ReferralCapture() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get('ref');
    if (!ref) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return;
    localStorage.setItem('yp_ref', ref);
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', url.toString());
  }, []);
  return null;
}
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Next.js 15 + React 19 (provides `useActionState`) | SignupForm | ✓ (Phase 1) | 15.x / 19.x | — |
| `@supabase/ssr` + `lib/supabase/server.ts` | createSignup action | ✓ (Phase 1) | 0.10.x | — |
| `middleware.ts` injecting `x-geo-city` | getDetectedCity helper | ✓ (Phase 1) | — | Local dev: helper returns `null`; CONTEXT permits null city |
| Supabase `signups` table with UNIQUE(phone) | INSERT path | ✓ (Phase 1 migration) | — | — |
| Tailwind v4 | All UI | ✓ (Phase 1) | 4.x | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — Phase 1 shipped everything we need.

## Validation Architecture

> Per `.planning/config.json` — include unless explicitly disabled. No config file inspected here; assume enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed yet (no `jest.config.*` / `vitest.config.*` from Phase 1) |
| Config file | none — see Wave 0 |
| Quick run command | n/a until set up |
| Full suite command | n/a until set up |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-LANDING | Hero + CTA renders, links to `/signup` | smoke (Playwright or curl + grep) | `curl -s http://localhost:3000/ \| grep "Join a Watch Party"` | ❌ Wave 0 |
| REQ-LANDING | Bundle < 100KB | manual | `npm run build` and inspect First Load JS | ❌ Wave 0 |
| REQ-SIGNUP | Insert → 201 + redirect; duplicate → friendly error | integration (against local Supabase or Vercel preview) | manual via the form OR Playwright e2e | ❌ Wave 0 |
| REQ-SIGNUP | Server action validates phone digits | unit (action invoked directly with FormData) | `vitest run app/actions/signup.test.ts` | ❌ Wave 0 |
| REQ-INTERNATIONAL | Country code dropdown contains all 9 codes | unit / DOM snapshot | `vitest run components/signup/SignupForm.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Manual smoke (load `/` and `/signup`, submit a fake row, see redirect).
- **Per wave merge:** `npm run build` to verify bundle and types.
- **Phase gate:** Lighthouse run on the Vercel preview URL — performance > 90, bundle ≤ 100KB.

### Wave 0 Gaps
- [ ] Decide whether to install `vitest` for unit tests on the server action; given hackathon mode, **manual smoke + `npm run build` + Lighthouse on preview** is sufficient. Recommend **skipping automated tests for Phase 2** unless a clear regression risk emerges.
- [ ] Manual test checklist file: `.planning/phases/02-landing-signup/SMOKE.md` — load both pages, submit form, verify redirect, submit duplicate, verify friendly error.

*Recommendation: write a 5-line manual `SMOKE.md` instead of installing a test framework. The 48-hour budget rewards manual verification at this stage.*

## Sources

### Primary (HIGH confidence)
- [React: useActionState reference](https://react.dev/reference/react/useActionState) — hook signature, return tuple, pending semantics
- [Next.js: Forms guide](https://nextjs.org/docs/app/guides/forms) — server action + useActionState integration
- [Next.js: headers() API reference](https://nextjs.org/docs/app/api-reference/functions/headers) — async headers in Next.js 15
- [Supabase: insert reference](https://supabase.com/docs/reference/javascript/insert) — `.select().single()` shape and return values
- [PostgreSQL: error codes appendix](https://www.postgresql.org/docs/current/errcodes-appendix.html) — 23505 unique_violation
- Phase 1 RESEARCH.md — async cookies/headers, `@supabase/ssr` patterns, geolocation middleware

### Secondary (MEDIUM confidence)
- [Vercel: Edge Network headers](https://vercel.com/docs/edge-network/headers) — `x-vercel-ip-city` URL-encoding behavior (Phase 1 forwards via `x-geo-city`)
- [Next.js Discussion #86447: Zod + useActionState](https://github.com/vercel/next.js/discussions/86447) — error-state patterns
- [Robin Wieruch: Next.js Forms with Server Actions](https://www.robinwieruch.de/next-forms/) — useActionState walkthrough

### Tertiary (LOW confidence)
- None used for prescriptive claims.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Next.js 15 + React 19 baseline bundle for a server-component landing page is ~80-95 KB gzipped | Topic 6 perf budget | Medium — if larger, we have less headroom but the avoid-list still applies. Mitigation: run `npm run build` early in Phase 2 and react. |
| A2 | Vercel forwards URL-encoded city names; the helper's `decodeURIComponent` handles them safely | Topic 2 | Low — even if uncoded, `decodeURIComponent` is idempotent for ASCII; non-ASCII would otherwise show as percent-escapes (cosmetic). |
| A3 | `@supabase/ssr` 0.10 propagates `error.code = '23505'` unchanged from PostgREST | Topic 3 | Low — this is a stable PostgREST/Postgres contract going back years. Easy to verify by submitting a duplicate phone in dev. |

**Resolution:** None of these block planning. A1 is the only one worth a quick `npm run build` early in Phase 2 to confirm.

## Open Questions

None blocking. The only thing not resolved here is "is the realtime live counter in scope for Phase 2 at all?" — REQUIREMENTS.md explicitly puts REQ-LIVE-COUNTER in Phase 5, and CONTEXT.md says "static counter on first paint." Phase 2 ships a static count from a server-side `count: 'exact', head: true` query and stops there.

## Metadata

**Confidence breakdown:**
- Server actions / `useActionState`: HIGH — verified against React 19 official docs
- Geolocation header read: HIGH — Phase 1 already shipped the middleware; we're just consuming
- Supabase insert + 23505: HIGH — stable Postgres/PostgREST contract
- Referral attribution timing: HIGH — well-trodden React 19 hydration pattern
- Country code dropdown: HIGH — native HTML
- Perf budget: MEDIUM — depends on baseline bundle size; assumption flagged

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (or sooner if Next.js 15 minor bumps change form action APIs — none expected)
