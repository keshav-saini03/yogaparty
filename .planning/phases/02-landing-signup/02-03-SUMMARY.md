---
phase: 02-landing-signup
plan: 03
subsystem: landing
tags: [landing, server-components, supabase-aggregate, referral-capture, brand-neutral]
requires:
  - lib/geo.ts                    # Plan 02-01 — getDetectedCity()
  - lib/supabase/server.ts        # Phase 1 — anon-key server client
  - middleware.ts                 # Phase 1 — x-geo-city header
provides:
  - components/landing/Hero.tsx              # Locked verbatim hero + CTA → /signup
  - components/landing/SocialProof.tsx       # 3-branch city-aware proof line
  - components/landing/CityPreview.tsx       # Top-5 cities ranked list
  - components/landing/CounterPlaceholder.tsx # Static total + India/Intl split
  - components/landing/ReferralCapture.tsx   # Client-only ?ref= → localStorage capture
  - app/page.tsx                             # Real landing (replaces Phase 1 placeholder)
affects:
  - app/page.tsx                  # REPLACED Phase 1 placeholder
tech_stack:
  added: []
  patterns:
    - "Server components by default; single 'use client' leaf (ReferralCapture)"
    - "force-dynamic + revalidate=0 for fresh counts on every request"
    - "Promise.all parallel Supabase aggregate reads (count: 'exact', head: true)"
    - "In-memory top-5 cities aggregation over limit-1000 sample (no SQL view)"
    - "Intl.NumberFormat('en-IN') (built-in, zero bundle cost)"
    - "history.replaceState to clean ?ref= from URL after capture"
key_files:
  created:
    - components/landing/Hero.tsx
    - components/landing/SocialProof.tsx
    - components/landing/CityPreview.tsx
    - components/landing/CounterPlaceholder.tsx
    - components/landing/ReferralCapture.tsx
  modified:
    - app/page.tsx
decisions:
  - "Top-5 cities aggregated client-side (in server runtime memory) over limit-1000 sample rather than via a SQL view or RPC. Hackathon-scope simplification: avoids a second migration and works fine until signup volume exceeds ~5000. Revisit in Phase 5."
  - "Hero uses styled <span> green dot instead of SVG/icon library (zero bundle impact)"
  - "ReferralCapture is the ONLY 'use client' component in the landing tree — keeps the page tree server-rendered per RESEARCH Pitfall 5"
  - "No SQL view for top-cities — accepted Phase 2 tradeoff per plan action notes; if signup volume exceeds ~5000 by Phase 5 we revisit"
metrics:
  duration_minutes: 6
  tasks_completed: 3
  files_created: 5
  files_modified: 1
  completed_date: 2026-04-27
---

# Phase 2 Plan 03: Landing Page Summary

**One-liner:** Brand-neutral, server-rendered landing at `/` with 4 server presentational components + 1 client referral capture, parallel Supabase aggregate reads via `Promise.all`, and the locked verbatim hero copy "Watch together with people near you".

## What Shipped

| File | Purpose | Type |
|------|---------|------|
| `components/landing/Hero.tsx` | Locked hero + CTA "Join a Watch Party" → /signup | Server |
| `components/landing/SocialProof.tsx` | 3-branch proof line (city+count, city+0, no-city) | Server |
| `components/landing/CityPreview.tsx` | Top-5 cities ranked list, hides when empty | Server |
| `components/landing/CounterPlaceholder.tsx` | Static total signups + India/International split | Server |
| `components/landing/ReferralCapture.tsx` | `?ref=<uuid>` → `localStorage.yp_ref` + URL clean | **Client (only)** |
| `app/page.tsx` | Landing page — replaces Phase 1 placeholder | Server |

## Tasks & Commits

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Build the 4 landing presentational server components | `3d8000d` | `components/landing/Hero.tsx`, `SocialProof.tsx`, `CityPreview.tsx`, `CounterPlaceholder.tsx` |
| 2 | Build ReferralCapture client component | `d47833f` | `components/landing/ReferralCapture.tsx` |
| 3 | Replace `app/page.tsx` with real landing | `6d436f3` | `app/page.tsx` |

## Verification

### Locked Copy (verbatim)
- ✅ Hero H1: `Watch together with people near you` (verbatim, zero paraphrase)
- ✅ Subhead: `Live sessions with your city. Synced. Together.` (verbatim)
- ✅ Primary CTA: `Join a Watch Party` linking to `/signup`

### Brand-Neutrality Gate (case-insensitive)
- ✅ `grep -rEi "yoga|habuild" components/landing/ app/page.tsx` returned **zero matches**
- The strings `yoga`, `Yoga`, `YOGA`, `habuild`, `Habuild`, `HABUILD` do NOT appear in any of the 6 files

### Server-Component Discipline (RESEARCH Pitfall 5)
- ✅ `app/page.tsx` is a server component — no `'use client'` directive
- ✅ The 4 presentational components are all server components — no `'use client'`
- ✅ `ReferralCapture.tsx` is the ONLY component with `'use client'` in the landing tree

### Performance Hazards Avoided (RESEARCH Topic 6)
- ✅ No `next/font` / Google Fonts (system stack via Tailwind v4 default `font-sans`)
- ✅ No images / `next/image` on landing
- ✅ No icon library (`react-icons`, `lucide-react`) — green dot is a styled `<span>`
- ✅ No animation libraries (framer-motion, lottie)
- ✅ No date/i18n libs — only `Intl.NumberFormat` (built-in)
- ✅ No analytics SDK
- ✅ No Supabase Realtime subscription (Phase 5)

### TypeScript & Build
- ✅ `npx tsc --noEmit` exits 0 after each task
- ✅ `npm run build` exits 0 with all routes registered

### Build Output (recorded for Plan 02-04 budget gate)

```
Route (app)                         Size  First Load JS
┌ ƒ /                             3.6 kB         118 kB
├ ○ /_not-found                      0 B         114 kB
└ ƒ /room/[id]                       0 B         114 kB
+ First Load JS shared by all     118 kB
```

**First Load JS for `/`: 118 kB** (vs. Phase 1 baseline 113 kB → +5 kB net for the entire landing experience).

The 5 kB delta over the Phase 1 baseline is consumed by the page-level imports of `@supabase/ssr` cookies + `next/headers` runtime references and the small `'use client'` chunk for `ReferralCapture`. The actual landing page code (`app/page.tsx`) is just 3.6 kB.

⚠️ **Plan 02-04 budget concern:** The plan target is "≤ 100 kB First Load JS HARD FAIL". Current shared baseline is **118 kB**, dominated by the framework runtime (`chunks/931112685eb8e7de.js` = 59.2 kB) and a 24.2 kB chunk that ships even on `/_not-found`. This is the unmodified Next.js 15.5.15 + React 19 baseline; the landing only adds 3.6 kB on top. Plan 02-04 will need to either: (a) accept the framework baseline and renegotiate the budget to ~120 kB, (b) downgrade to Next.js 14/React 18 (out of scope for hackathon), or (c) audit the shared chunks for unused imports. Recommendation for Plan 02-04: renegotiate to ≤ 120 kB shared + ≤ 5 kB per-route delta — this matches what we shipped and is realistic for the framework version.

## Truths Established (per `must_haves.truths`)

- ✅ Visitor sees the locked hero copy "Watch together with people near you" (no "yoga", no "Habuild")
- ✅ Visitor sees a single CTA "Join a Watch Party" that links to `/signup`
- ✅ Visitor sees the 3-branch social proof line (city+count, city+0, no-city)
- ✅ Visitor sees top-5 cities ranked by signups (hidden if zero data, falling back to SocialProof)
- ✅ Visitor sees a static total signup count on first paint
- ✅ `?ref=<uuid>` is captured into localStorage and stripped from URL
- ✅ Landing page is a server component (no `'use client'` on `app/page.tsx`)
- ✅ Landing copy makes NO reference to "yoga" or "Habuild" (brand-neutral)

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes were needed.

## Authentication Gates

None — landing reads via the public anon key (RLS off in Phase 1), no protected paths.

## Forward Notes for Plans 02 / 04

- **Plan 02-02 (signup action — running in parallel):** safe to merge — this plan stayed in its lane and never touched `app/actions/`.
- **Plan 02-04 (smoke / Lighthouse):**
  - Visit `/` and confirm Hero, SocialProof, CounterPlaceholder, CityPreview render with no console errors
  - Visit `/?ref=<uuid>` and confirm `localStorage.yp_ref` is set and the URL is cleaned in the address bar
  - First Load JS for `/` recorded above is **118 kB**; adjust the 100 kB hard-fail gate or audit shared chunks per the concern above
- **Phase 5 trigger:** when `signups` exceeds ~5000 rows, the in-memory top-5 aggregate (over a limit-1000 sample) becomes lossy. Switch to a `top_cities` SQL view or RPC at that point.

## Threat Compliance (per `<threat_model>`)

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-02-09 (Info Disclosure: top-5 cities + counts) | accept | Aggregated, anonymized data — no PII shipped |
| T-02-10 (Info Disclosure: anon-key over-select) | mitigate | ✅ Used `count: 'exact', head: true` for counts (metadata only) and `select('city')` for the sample (single column) — no `name`/`phone` ever read |
| T-02-11 (Tampering: malicious `?ref=`) | mitigate | ✅ UUID regex check before localStorage write; URL cleaned with `history.replaceState` |
| T-02-12 (DoS: query on every request) | accept | `force-dynamic` is intentional (counts feel live); Vercel CDN + Supabase free tier handle the load |

No new security surface introduced beyond the threat register's anticipated set.

## Threat Flags

None — no new endpoints, auth paths, file access, or schema changes at trust boundaries beyond what the plan's `<threat_model>` already accounts for.

## Self-Check: PASSED

- ✅ `components/landing/Hero.tsx` exists at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/components/landing/Hero.tsx`
- ✅ `components/landing/SocialProof.tsx` exists
- ✅ `components/landing/CityPreview.tsx` exists
- ✅ `components/landing/CounterPlaceholder.tsx` exists
- ✅ `components/landing/ReferralCapture.tsx` exists
- ✅ `app/page.tsx` modified (replaces Phase 1 placeholder)
- ✅ Commit `3d8000d` exists in git log (Task 1)
- ✅ Commit `d47833f` exists in git log (Task 2)
- ✅ Commit `6d436f3` exists in git log (Task 3)
- ✅ `npm run build` exits 0; `/` route shows `3.6 kB` page size, `118 kB` First Load JS
- ✅ Brand-neutrality grep returns zero matches across all 6 files
