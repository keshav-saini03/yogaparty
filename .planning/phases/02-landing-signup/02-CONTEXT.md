# Phase 2: Landing & Signup - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning
**Source:** PRD Express Path (`docs/superpowers/specs/2026-04-24-yogaparty-design.md`) + scaffold from Phase 1

<domain>
## Phase Boundary

Convert a cold visitor into a `signups` row. After this phase, the hackathon's primary deliverable (real leads with name + phone + country) is being captured.

**In scope:**
- `/` landing page with hero, social proof line, and city-aggregate preview
- `/signup` form (Name, Phone, Country Code) with server action
- Auto-detect city from Vercel Edge headers (`x-geo-city`, set by Phase 1 middleware)
- `?ref={userId}` referral attribution → localStorage → `signups.referrer_id`
- Phone uniqueness enforcement + friendly duplicate error
- Redirect to `/room/[id]` after successful signup (placeholder route for Phase 3)
- International lead support: country-code dropdown with common international codes
- Static placeholder for live counter (real-time wiring deferred to Phase 5)

**Out of scope (later phases):**
- Watch room rendering, sync, chat, presence (Phase 3)
- WhatsApp share buttons (Phase 4 — but include placeholder data attributes if cheap)
- Real-time live counter / leaderboard updates (Phase 5)
- Squad creation flow (Phase 6)
- OTP, password, email — explicitly excluded forever

</domain>

<decisions>
## Implementation Decisions

### Landing Page Layout (LOCKED)
- **Hero copy** (verbatim): "Watch together with people near you"
- **Subhead**: keep brand-neutral and content-agnostic — do NOT mention "yoga" or "Habuild" on the landing. The actual content (Habuild yoga sessions) is revealed only inside rooms after signup. Suggested subhead: "Live sessions with your city. Synced. Together."
- **Single primary CTA**: "Join a Watch Party" → routes to `/signup`
- **Social proof line**: "X people from {city} watching" — uses detected city
  - When 0 signups for that city: show "Be the first from {city}"
  - When city undetected: show generic "X people watching"
- **Top-5 cities preview**: server-rendered list from `signups` aggregate query
- **Static counter placeholder**: shows total signups on first paint; not real-time (Phase 5)

### Signup Form (LOCKED)
- **Three fields ONLY**: Name, Phone (number only, separate from country code), Country Code (dropdown)
- **Country code dropdown**: defaults to `+91`. Must include common international codes (US +1, UK +44, UAE +971, Canada +1, Australia +61, Singapore +65, Saudi Arabia +966, Germany +49 — at least these 8 + India)
- **Detected city is server-authoritative** — read from Vercel Edge `x-geo-city` header in the server action. Display informationally on the form ("Joining from: {city}") but do NOT make it user-editable. Rationale: hackathon scope reduction (saves build time), prevents leaderboard-gaming, and Vercel geolocation is reliable enough for >99% of users. This softens REQ-SIGNUP's "and editable" criterion — documented as a deliberate Phase 2 deviation.
- **Phone uniqueness enforced** at the database level (already in schema as `UNIQUE`)
  - On duplicate, surface friendly error: "This number is already in! Check your messages — you're already part of YogaParty."
- **No password, no OTP, no email** (explicit per CONTEXT/CONSTRAINTS)
- **Referral attribution**: read `?ref=<userId>` on landing → store in localStorage → apply at signup as `signups.referrer_id`

### Server-Side City Detection (LOCKED)
- Phase 1's middleware sets `x-geo-city` and `x-geo-country` headers on every request
- Server components / server actions read via `await headers()` (Next.js 15 async)
- Fallback: if `x-geo-city` is missing/empty → `null` city → user lands in a "global" room concept (defer specifics to Phase 3)

### Server Actions Pattern
- Use Next.js 15 server actions for the signup mutation (no separate API route needed)
- Server action reads:
  1. Form fields (name, phone, country_code)
  2. `headers()` → detected city
  3. Referral cookie/payload → referrer_id
- Inserts into `signups` via the **server-side Supabase client** (`lib/supabase/server.ts`)
- Returns either a redirect-target URL or a structured error
- Client form uses `useFormState` / `useActionState` for error display

### Performance Constraints (LOCKED)
- Landing page bundle target: < 100KB
- Loads in < 2s on 4G mobile (verify via Lighthouse / WebPageTest)
- Mobile-first design (assume 6-inch screen primary)
- No external script tags (no analytics yet, no fonts beyond system stack — Tailwind v4 default is fine)

### UX Decisions
- **Hinglish copy okay** — but the hero copy is locked English ("Watch together with people near you"). Supporting copy can be Hinglish where it fits, but landing must remain brand-neutral (no "yoga", no "Habuild").
- **No login state** — every visitor sees the same landing. Returning users still see the signup form (we don't try to remember them).
- **Loading states** — disable the CTA during signup submit; show "Joining..." text.

### Claude's Discretion
- Exact font choices (system stack recommended)
- Animation timing for any number transitions on the static counter (subtle is fine)
- Specific Tailwind classes for the hero composition
- Whether to use shadcn/ui Button + Input components or hand-rolled (recommend shadcn/ui for the form fields — accessibility wins; install only what's needed)
- Whether the country-code dropdown is a native `<select>` or a custom combobox (native is fastest; combobox if many codes get unwieldy — but with 9 codes, native is fine)
- Toast/error UX for duplicate phone (inline form error is fine; toast not needed)
- Whether to A/B test hero copy variants — NO, single locked copy

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source spec
- `docs/superpowers/specs/2026-04-24-yogaparty-design.md` — Section "User Journey" Steps 2-3, Section "Pages" → `/`, `/signup`

### Project planning
- `.planning/PROJECT.md` — Locked decisions D-001..D-015, identity model
- `.planning/REQUIREMENTS.md` — REQ-LANDING, REQ-SIGNUP, REQ-INTERNATIONAL acceptance
- `.planning/phases/01-scaffold-deploy/01-01-SUMMARY.md` — Files Phase 1 shipped (lib/supabase/*, middleware.ts)
- `.planning/phases/01-scaffold-deploy/01-RESEARCH.md` — Async cookies/headers, @supabase/ssr patterns

### Files Phase 1 already created (DO NOT recreate)
- `app/page.tsx` — Currently renders "YogaParty — coming soon 🧘" placeholder; replace with real landing
- `lib/supabase/{client,server,admin}.ts` — Use `createClient()` from `lib/supabase/server.ts` in server actions
- `middleware.ts` — Edge middleware that injects `x-geo-city`, `x-geo-country` into request headers
- `supabase/migrations/0001_init.sql` — Schema; `signups` table is ready to write to

### Vercel Edge geolocation header names (from Phase 1 middleware)
- `x-geo-city` — city name (e.g., "Mumbai")
- `x-geo-country` — ISO country code (e.g., "IN", "US")
- `x-geo-region` — state/province
- `x-geo-latitude` / `x-geo-longitude` — optional coords

</canonical_refs>

<specifics>
## Specific Ideas

### File structure to add
```
app/
├── page.tsx              # Landing — replace placeholder
├── signup/
│   └── page.tsx          # Signup form (server component + client form)
├── room/
│   └── [id]/
│       └── page.tsx      # Placeholder until Phase 3 — just renders "Room {id} — coming soon"
└── actions/
    └── signup.ts         # Server action: createSignup(formData)

components/
├── ui/
│   ├── button.tsx        # shadcn/ui Button (or hand-rolled)
│   └── input.tsx         # shadcn/ui Input
├── landing/
│   ├── Hero.tsx
│   ├── SocialProof.tsx   # "X people from {city} watching"
│   ├── CityPreview.tsx   # Top-5 cities list
│   └── CounterPlaceholder.tsx  # Static count, not real-time
└── signup/
    ├── SignupForm.tsx     # Client component with useActionState
    └── CountryCodeSelect.tsx

lib/
└── geo.ts                # Helpers: getDetectedCity(), getDetectedCountry()
                          # Wraps await headers() with the x-geo-* lookup
```

### Country code list (LOCKED minimum set — add more if cheap)
```typescript
export const COUNTRY_CODES = [
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+1',  country: 'US/Canada', flag: '🇺🇸' },
  { code: '+44', country: 'UK', flag: '🇬🇧' },
  { code: '+971', country: 'UAE', flag: '🇦🇪' },
  { code: '+65', country: 'Singapore', flag: '🇸🇬' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+966', country: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+49', country: 'Germany', flag: '🇩🇪' },
  { code: '+33', country: 'France', flag: '🇫🇷' },
];
```

### Server action signature (sketch)
```typescript
'use server';
export async function createSignup(prevState, formData: FormData) {
  const name = formData.get('name')?.toString();
  const phone = formData.get('phone')?.toString();
  const countryCode = formData.get('country_code')?.toString() ?? '+91';
  const referrerId = formData.get('referrer_id')?.toString() || null;
  const city = await getDetectedCity();

  // Validate, insert into signups, handle unique violation, redirect
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('signups')
    .insert({ name, phone, country_code: countryCode, city, referrer_id: referrerId })
    .select('id')
    .single();

  if (error?.code === '23505') return { error: 'This number is already in!' };
  if (error) return { error: 'Something went wrong. Try again.' };

  // After Phase 3, this redirect target becomes the city room
  redirect(`/room/${data.id}`);  // placeholder — wire to actual city room in Phase 3
}
```

### Aggregate queries
```sql
-- Top-5 cities (for landing page card)
SELECT city, COUNT(*) AS members
FROM signups
WHERE city IS NOT NULL
GROUP BY city
ORDER BY members DESC
LIMIT 5;

-- People in your city (for social proof line)
SELECT COUNT(*) FROM signups WHERE city = $1;

-- Total signup count (for static counter)
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE country_code = '+91') AS india,
       COUNT(*) FILTER (WHERE country_code != '+91') AS international
FROM signups;
```

### Referral attribution flow
1. Visitor lands on `/?ref=<UUID>` → client-side script reads param → `localStorage.setItem('yp_ref', uuid)`
2. (Optional) URL is cleaned with `history.replaceState` to remove `?ref=` from address bar
3. Signup page reads `localStorage.getItem('yp_ref')` and includes it as a hidden form field
4. Server action validates the UUID exists in `signups.id`; if invalid, sets `referrer_id = null`

</specifics>

<deferred>
## Deferred Ideas

- Live counter real-time updates → Phase 5 (REQ-LIVE-COUNTER live wiring)
- WhatsApp share buttons on landing/signup confirmation → Phase 4 (REQ-WHATSAPP-SHARE)
- Squad creation CTA → Phase 6 (REQ-SQUAD-ROOM)
- Watch room rendering → Phase 3 (REQ-CITY-ROOM, REQ-ROOM-SYNC)
- Multilingual support / Hindi UI → out of scope per CONTEXT
- Captcha / bot protection → not needed for hackathon (free tier, no incentive to spam yet)
- A/B testing of hero copy → out of scope
- Analytics events (Mixpanel etc.) → out of scope; rely on Supabase data + Vercel Analytics
- Email field → explicitly excluded forever
- Phone OTP verification → explicitly excluded forever
- Server-side rate limiting beyond Supabase free tier defaults → defer to Phase 4 if abuse appears

</deferred>

---

*Phase: 02-landing-signup*
*Context gathered: 2026-04-27 via PRD Express Path (spec-derived)*
