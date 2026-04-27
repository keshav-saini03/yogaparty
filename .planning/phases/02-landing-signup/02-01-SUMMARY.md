---
phase: 02-landing-signup
plan: 01
subsystem: foundations
tags: [foundations, geolocation, types, country-codes, placeholder-route]
requires:
  - lib/supabase/server.ts        # Phase 1 — not consumed in this plan, but downstream plans will pair our geo helper with this
  - middleware.ts                 # Phase 1 — sets x-geo-city / x-geo-country
  - next/headers                  # Next.js 15 async API
provides:
  - lib/geo.ts                    # getDetectedCity(), getDetectedCountry() for server components & actions
  - lib/country-codes.ts          # COUNTRY_CODES (9 locked) + DEFAULT_COUNTRY_CODE
  - lib/types.ts                  # SignupState (server-action / form boundary)
  - app/room/[id]/page.tsx        # Placeholder so signup redirect target is reachable
affects:
  - app/page.tsx                  # NOT modified here — Plan 02-03 will modify
tech_stack:
  added: []
  patterns:
    - "async headers() with await (Next.js 15)"
    - "decodeURIComponent wrapped in try/catch for Vercel-encoded city names"
    - "readonly tuple of country codes via `as const`"
    - "async params: Promise<{id: string}> in dynamic routes (Next.js 15)"
key_files:
  created:
    - lib/geo.ts
    - lib/country-codes.ts
    - lib/types.ts
    - app/room/[id]/page.tsx
  modified: []
decisions:
  - "Country code label keeps flag emoji embedded in a single string (RESEARCH Topic 5) so iOS Safari renders it inside <option>"
  - "Room placeholder shows raw params.id — accepted per threat T-02-02 (user already knows their own URL); Phase 3 will harden with UUID validation"
  - "lib/types.ts kept tiny — only SignupState. No zod, no DB types, no per-component prop interfaces (hackathon scope)"
metrics:
  duration_minutes: 4
  tasks_completed: 3
  files_created: 4
  files_modified: 0
  completed_date: 2026-04-27
---

# Phase 2 Plan 01: Foundations Summary

**One-liner:** Foundation primitives — async geolocation reader (`lib/geo.ts`), 9 locked country codes (`lib/country-codes.ts`), shared `SignupState` type (`lib/types.ts`), and a placeholder `/room/[id]` route — so Plans 02 / 03 can run in parallel without blocking on shared inputs.

## What Shipped

| File | Purpose | Exports |
|------|---------|---------|
| `lib/geo.ts` | Server-side geolocation helpers reading Phase 1's `x-geo-*` headers | `getDetectedCity()`, `getDetectedCountry()` |
| `lib/country-codes.ts` | The 9 locked country codes from CONTEXT.md (single source of truth) | `COUNTRY_CODES`, `DEFAULT_COUNTRY_CODE`, type `CountryCode` |
| `lib/types.ts` | Cross-boundary types for the upcoming signup action / form | type `SignupState` |
| `app/room/[id]/page.tsx` | Server-component placeholder so `/signup` → `/room/[id]` redirect doesn't 404 | default async component |

All 4 files are net-new — **no Phase 1 file was modified**, including `app/page.tsx` (Plan 02-03 will modify that one).

## Tasks & Commits

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | `lib/geo.ts` async header readers | `b4c376c` | `lib/geo.ts` |
| 2 | Country codes + signup types | `2a39897` | `lib/country-codes.ts`, `lib/types.ts` |
| 3 | `/room/[id]` placeholder route | `25f71bc` | `app/room/[id]/page.tsx` |

## Verification

- `npx tsc --noEmit` exits 0 after each task ✅
- `npm run build` succeeds; `/room/[id]` registered as dynamic route (`ƒ`) ✅
- First Load JS for `/` and `/room/[id]` is **113 kB** (over the 100 kB target — flagged below for Plan 02-03 to address; this plan doesn't ship interactive UI yet)
- `lib/country-codes.ts` contains **exactly 9** entries (verified by `grep -c "^  { code:"` → 9) ✅
- `DEFAULT_COUNTRY_CODE = '+91'` ✅
- `lib/geo.ts` uses `await headers()` and wraps `decodeURIComponent` in try/catch ✅
- `app/room/[id]/page.tsx` is a server component (no `'use client'`) and awaits `params` ✅

## Truths Established (per `must_haves.truths`)

- ✅ Server code can read detected city via `getDetectedCity()` (decoded, trimmed, null-on-miss)
- ✅ Server code can read detected country via `getDetectedCountry()`
- ✅ All 9 locked country codes export from a single module — `lib/country-codes.ts::COUNTRY_CODES`
- ✅ Visitor reaching `/room/<uuid>` sees the friendly placeholder instead of a 404

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes were needed.

Minor cosmetic note: in `app/room/[id]/page.tsx` the apostrophe in "You're in!" is rendered via `&apos;` rather than a literal `'` to avoid the `react/no-unescaped-entities` lint rule firing under default Next.js ESLint. This is a no-op at runtime (browsers decode the entity to a literal apostrophe). Not tracked as a deviation since it doesn't change observable behavior.

## Authentication Gates

None — this plan only adds files, no auth-protected work.

## Forward Notes for Plans 02 / 03 / 04

- **Plan 02-02 (signup action):** import `getDetectedCity` from `@/lib/geo` and `SignupState` from `@/lib/types`. The action will pair these with `createClient()` from `@/lib/supabase/server`.
- **Plan 02-03 (landing + signup form):** import `COUNTRY_CODES` and `DEFAULT_COUNTRY_CODE` from `@/lib/country-codes` for the native `<select>`. Use `getDetectedCity()` in the server component for the social-proof line.
- **Plan 02-04 (smoke / build verify):** the room redirect target (`/room/<uuid>`) is now reachable; smoke test should confirm a non-404 response.
- **Bundle budget watch:** First Load JS is currently 113 kB (above the 100 kB target). Plan 02-03 should run `npm run build` and trim if needed — most likely candidates are accidentally importing client components into the page tree. Tracked for that plan's verification step, not a Plan 02-01 issue.

## Threat Flags

None. The `<threat_model>` in PLAN.md disposition both threats as `accept` with mitigations satisfied:
- T-02-01 (Tampering on `x-geo-city`): mitigated by Phase 1 middleware (T-01-02). Consumer (`lib/geo.ts`) inherits the trust boundary correctly.
- T-02-02 (Info disclosure on `params.id`): accepted — user already knows their own URL; Phase 3 will validate UUID shape.

No new security surface introduced beyond what the threat register anticipates.

## Self-Check: PASSED

- ✅ `lib/geo.ts` exists at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/lib/geo.ts`
- ✅ `lib/country-codes.ts` exists at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/lib/country-codes.ts`
- ✅ `lib/types.ts` exists at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/lib/types.ts`
- ✅ `app/room/[id]/page.tsx` exists at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/app/room/[id]/page.tsx`
- ✅ Commit `b4c376c` exists in git log
- ✅ Commit `2a39897` exists in git log
- ✅ Commit `25f71bc` exists in git log
- ✅ `npm run build` exits 0 with all routes registered
