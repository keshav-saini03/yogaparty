---
phase: 02-landing-signup
plan: 04
subsystem: signup-funnel-gate
tags: [signup-form, country-code, useActionState, smoke-test, bundle-audit, phase-gate]
requires:
  - app/actions/signup.ts          # Plan 02-02 — createSignup server action
  - lib/country-codes.ts           # Plan 02-01 — 9 locked codes
  - lib/types.ts                   # Plan 02-01 — SignupState
  - lib/geo.ts                     # Plan 02-01 — getDetectedCity()
  - app/page.tsx                   # Plan 02-03 — landing routes here
  - app/room/[id]/page.tsx         # Plan 02-01 — placeholder redirect target
provides:
  - components/signup/CountryCodeSelect.tsx   # Native <select> over the 9 codes
  - components/signup/SignupForm.tsx          # Client form with useActionState + city display + hidden referrer
  - app/signup/page.tsx                       # Server component wrapping the form
  - .planning/phases/02-landing-signup/SMOKE.md  # Bundle audit + 12/12 PASS smoke + Vercel preview deferral
affects:
  - app/actions/signup.ts          # Switched to admin client (Rule 3 deviation, see below)
tech_stack:
  added: []
  patterns:
    - "useActionState from 'react' (NOT react-dom) — React 19 / Next.js 15"
    - "Initial state = undefined to match SignupState = { error?: string } | undefined"
    - "Hidden referrer_id input: value starts '' on render; useEffect populates from localStorage to avoid hydration mismatch"
    - "Native <select> for 9 country codes — zero JS, OS-native mobile picker"
    - "force-dynamic on /signup so getDetectedCity() runs per-request (never cached)"
    - "Static, read-only city display — no input, no edit affordance, server-authoritative"
    - "Service-role admin client for the signup INSERT (Rule 3 pivot when live Supabase had RLS on)"
key_files:
  created:
    - components/signup/CountryCodeSelect.tsx
    - components/signup/SignupForm.tsx
    - app/signup/page.tsx
    - .planning/phases/02-landing-signup/SMOKE.md
  modified:
    - app/actions/signup.ts                   # Rule 3: anon → admin client
decisions:
  - "Bundle budget renegotiated mid-execution: ≤ 100 KB hard target dropped in favor of ≤ 120 KB shared baseline + ≤ 5 KB per-route delta. The Next.js 15 + React 19 framework runtime alone is ~118 KB; the original target was unachievable on this stack. User-approved 2026-04-27. REQUIREMENTS.md REQ-LANDING acceptance updated in line with this."
  - "Signup INSERT moved from anon-key client (lib/supabase/server.ts) to service-role admin client (lib/supabase/admin.ts). Plan 02-02 SUMMARY explicitly listed this as one of two acceptable RLS-on pivots; chosen because it required zero DB schema work and the admin client is server-only. Tracked as Rule 3 (blocking issue resolved automatically without architectural change)."
  - "Vercel preview international check deferred to Phase 3 kickoff (Option B). No non-IN VPN was available within the Phase 2 time budget; country_code = '+1' was verified storing correctly on local dev (Smoke step 9). User-acknowledged 2026-04-27."
  - "Smoke test runner (smoke.mjs at repo root) added as a single-file Playwright artifact for repeatability. Not in the plan's declared files_modified list; called out as Deviation C in SMOKE.md."
metrics:
  duration_minutes: 35
  tasks_completed: 5
  files_created: 4
  files_modified: 1
  completed_date: 2026-04-27
---

# Phase 2 Plan 04: Signup Funnel Gate Summary

**One-liner:** Wired the signup form to Plan 02-02's `createSignup` action via `useActionState`, shipped `/signup`, and proved the funnel end-to-end with a 12/12-PASS browser-driven smoke test plus a renegotiated bundle audit (≤ 120 KB shared + ≤ 5 KB per-route delta) — closing Phase 2 with a real cold-visitor → `signups` row → `/room/<uuid>` flow.

## What Shipped

| File | Purpose | Type |
|------|---------|------|
| `components/signup/CountryCodeSelect.tsx` | Native `<select>` rendering all 9 locked country codes; no JS cost | Server |
| `components/signup/SignupForm.tsx` | Client form: 3 fields + hidden referrer + read-only city display + `useActionState` pending/error UX | **Client (only)** |
| `app/signup/page.tsx` | Server component reading `getDetectedCity()` and rendering the form inside the broadcast layout | Server |
| `.planning/phases/02-landing-signup/SMOKE.md` | Bundle audit + end-to-end smoke evidence (12/12 PASS) + Vercel preview deferral note | Doc |

`app/actions/signup.ts` was modified once (anon → admin client) — see Deviations below.

## Tasks & Commits

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Build `CountryCodeSelect`, `SignupForm`, and `app/signup/page.tsx` | `86500ae` | `components/signup/CountryCodeSelect.tsx`, `components/signup/SignupForm.tsx`, `app/signup/page.tsx` |
| 2 | Run `npm run build`, capture First Load JS, write Bundle Audit section | `c3f7110` | `.planning/phases/02-landing-signup/SMOKE.md` |
| 3 (Rule 3 mid-task) | Switch signup action to service-role admin client when local Supabase returned `42501` (RLS blocking anon INSERT) | `0468c31` | `app/actions/signup.ts` |
| 3 | Run end-to-end smoke (12/12 PASS via Playwright) and record results | `c3ea685` | `.planning/phases/02-landing-signup/SMOKE.md` |
| 3b | Document Vercel preview international check as Option B (deferred to Phase 3 kickoff) | `0575a79` | `.planning/phases/02-landing-signup/SMOKE.md` |
| 4 (gate) | Human checkpoint: full eyeball pass — `/?ref=<uuid>` → `/signup` → `signups` row → `/room/<uuid>` flow approved | (covered by `e91810e`) | `.planning/REQUIREMENTS.md`, `.planning/STATE.md` |

## Verification (per `<verify>` gates)

### Task 1 grep gates (all pass)
- ✅ `npx tsc --noEmit` exits 0
- ✅ `'use client'` present in `components/signup/SignupForm.tsx`
- ✅ `import { useActionState, useEffect, useState } from 'react'` (NOT `react-dom`)
- ✅ `useActionState` invoked with `createSignup, undefined`
- ✅ `localStorage.getItem('yp_ref')` read inside `useEffect`, not during render
- ✅ `app/signup/page.tsx` is a server component (no `'use client'`)
- ✅ `app/signup/page.tsx` imports and calls `getDetectedCity()`
- ✅ `app/signup/page.tsx` exports `dynamic = 'force-dynamic'`
- ✅ `CountryCodeSelect.tsx` renders exactly 1 `<option` template (mapped over 9 codes)
- ✅ **Negative gate:** no `name="city"` element in `SignupForm.tsx`
- ✅ **Negative gate:** no `name="detected_city"` element in `SignupForm.tsx`
- ✅ "Joining from" string present in `SignupForm.tsx`

### Task 2 bundle audit (renegotiated budget)
- ✅ `npm run build` exits 0 (Next.js 15.5.15, Turbopack)
- ✅ Build log captured at `/tmp/build.log`
- ✅ SMOKE.md "## Bundle Audit" section present with verbatim build numbers
- ✅ No "SOFT FAIL" string in SMOKE.md (per user revision: SOFT FAIL band removed)

| Route | Size | First Load JS | Renegotiated budget | Verdict |
|-------|------|---------------|---------------------|---------|
| `/` | 3.6 kB | 118 kB | ≤ 120 KB shared + ≤ 5 KB per-route | PASS |
| `/signup` | 1.25 kB | 116 kB | ≤ 120 KB shared + ≤ 5 KB per-route | PASS |
| `/room/[id]` | 0 B | 115 kB | informational | n/a |
| (shared) | — | 119 kB | ≤ 120 KB | PASS |

The original 100 KB hard cap was unachievable on Next.js 15 + React 19 — the framework runtime alone is ~118 KB before any application code. User accepted the renegotiated budget on 2026-04-27 and `.planning/REQUIREMENTS.md` REQ-LANDING was updated to match.

### Task 3 smoke gate
- ✅ "## End-to-End Smoke" section present in SMOKE.md
- ✅ ≥ 10 numbered checks (12 actual: 1, 2, 2b, 3, 3a, 3b, 4, 4a, 5, 6, 7, 8a, 8b, 9, 10)
- ✅ Every check verdict is PASS
- ✅ Form submissions performed in a real Chromium browser via Playwright (no curl)
- ✅ Step 10 (city tampering) PASSES — DOM-injected `<input name="city">` was ignored by the action; inserted `city` was `null`, not `"MaliciousCity"`

### Task 3b Vercel preview gate
- ✅ "## Vercel Preview International Check" section present in SMOKE.md
- ✅ Option B (deferred) recorded with the explicit 2026-04-27 user decision

### Checkpoint (human-verify)
- ✅ Approved per phase finalization commit `e91810e`

## Truths Established (per `must_haves.truths`)

| # | Truth | Status |
|---|-------|--------|
| 1 | User reaching `/signup` sees Name input, Phone input, Country Code dropdown (all 9 codes), and CTA | ✅ — Smoke step 3 (curl confirms `+91` and `Joining from` text rendered server-side) |
| 2 | Submitting a valid 3-field form creates a `signups` row and lands the user at `/room/<that-row-id>` | ✅ — Smoke step 4: redirected to `/room/6353ba5e-030b-47b1-b770-7be7a943316d`; row in DB |
| 3 | Submitting a duplicate phone shows the verbatim friendly error and does NOT create a second row | ✅ at Plan 02-04 close (Smoke step 7: error verbatim, exactly 1 row in DB). **See post-close addendum below — commit `e8065f5` later softened this to redirect-to-existing-room.** |
| 4 | Form submission disables the CTA and shows "Joining…" while pending | ✅ — `disabled={pending}` + `{pending ? 'Joining…' : ...}` in SignupForm.tsx |
| 5 | Detected city is shown above the form as static text — no edit UI | ✅ — Smoke step 4a: 0 input elements named `city` or `detected_city`; visible text reads "Joining from your detected location" (city was null on local) |
| 6 | City field is never sent in formData; SignupForm has no input element with `name="city"` | ✅ — grep gate, smoke step 10 (DOM-injected city ignored by action) |
| 7 | Visiting `/?ref=<uuid>` then `/signup` writes `referrer_id` correctly into the inserted row | ✅ — Smoke steps 8a/8b: `localStorage.yp_ref` set, `?ref=` stripped from URL, inserted row's `referrer_id` matched the REF |
| 8 | Landing First Load JS ≤ 100KB (HARD FAIL above 100KB) | ⚠️ Renegotiated to ≤ 120 KB shared + ≤ 5 KB per-route delta on 2026-04-27. Current `/`: 118 kB First Load JS, 3.6 kB per-route → PASS under renegotiated budget. User-approved deviation; REQ-LANDING acceptance updated. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 – Blocking issue] Switched signup action from anon to service-role admin client**
- **Found during:** Task 3 first browser run
- **Issue:** Live Supabase project enabled RLS by default on `signups`; anon INSERT was rejected with Postgres `42501` ("new row violates row-level security policy"). The Phase 1/2 contract assumed RLS off.
- **Fix:** Changed `app/actions/signup.ts` to import `createAdminClient` from `@/lib/supabase/admin` (service-role key, server-only). The action stays inside a `'use server'` module, so the key never reaches the browser. Plan 02-02 SUMMARY explicitly pre-approved this as one of two acceptable Phase 4 pivots.
- **Files modified:** `app/actions/signup.ts`
- **Commit:** `0468c31`

### User-approved budget renegotiation

**2. [Rule 4 – User decision] Bundle budget renegotiated from ≤ 100 KB to ≤ 120 KB shared + ≤ 5 KB per-route**
- **Found during:** Task 2 first build
- **Issue:** Initial First Load JS for `/` was 118 kB — over the 100 kB hard cap. Top contributing chunk (`chunks/931112685eb8e7de.js`, 59.2 kB) is the Next.js 15 + React 19 App Router runtime, which cannot be removed without abandoning server actions (the foundation of the entire signup flow).
- **Fix:** Surfaced HARD FAIL to user with bytes-over-budget breakdown and contributing chunks. User accepted the renegotiated budget on 2026-04-27. `.planning/REQUIREMENTS.md` REQ-LANDING was updated.
- **Files modified:** `.planning/REQUIREMENTS.md`, `.planning/phases/02-landing-signup/SMOKE.md`
- **Commit:** `c3f7110` (audit), `e91810e` (REQUIREMENTS update)

### Process deviations recorded in SMOKE.md

- **Deviation A** — RLS gate (same as Rule 3 above)
- **Deviation B** — Smoke verification reads use the service-role key (anon SELECT was RLS-blocked too); key never leaves the developer's machine
- **Deviation C** — `smoke.mjs` committed at repo root for repeatability; not in the plan's `files_modified`

### User decision deferral

- **Vercel preview international check (Task 3b) deferred to Phase 3 kickoff (Option B)** — no non-IN VPN was available in the time budget. Local-only evidence (`country_code = '+1'` stored correctly on a local signup) recorded in SMOKE.md row #9. User-acknowledged acceptable Phase 2 close per 2026-04-27 decision.

## Post-Plan Addenda (after Plan 04 closed at commit `e91810e`)

These changes were committed AFTER the formal Plan 02-04 close. They are recorded here for traceability since they touch files this plan owns.

| Commit | Title | Touches | Notes |
|--------|-------|---------|-------|
| `3cd3f65` | `feat(ui): redesign landing + signup with late-night broadcast aesthetic` | `app/signup/page.tsx`, `components/signup/SignupForm.tsx`, `components/signup/CountryCodeSelect.tsx`, plus landing components | Editorial dark-mode UI overhaul. Brand-neutrality preserved (zero "yoga"/"habuild" in visible UI). The on-screen brand mark was changed to "Watch · Party" because "YogaParty" contains the banned token. CTA copy changed from "Join the Watch Party" to "Tune in" inside the form (the landing CTA "Join a Watch Party" linking to `/signup` is unchanged). Bundle drift: shared baseline went to 121 kB (+1 kB over the renegotiated 120 kB ceiling) due to font additions — accepted in the commit message. |
| `a542ccc` | `fix(ui): replace 'YogaParty' brand reference in duplicate-phone error` | `app/actions/signup.ts` (string only) | Brand-neutrality compliance fix on the duplicate-phone error string. |
| `e8065f5` | `refactor(signup): update duplicate phone error handling and messaging` | `app/actions/signup.ts` | **Behavioral change to locked truth #3.** Duplicate phone now does an idempotent redirect to `/room/<existing-uuid>` (looking up the existing row by phone) instead of returning the verbatim friendly error. The friendly error string was also replaced with a different fallback (`"This number is already registered. Your seat is saved; watch-room details will arrive before we go live."`) shown only if the lookup itself fails. **This softens the locked truth** — duplicate phones no longer show the original verbatim error in the happy path. The "does NOT create a second row" half of the truth is preserved (the 23505 path still prevents the second insert; the new redirect uses the existing id). Flag this for Phase 3 / pre-demo review: confirm the new UX is the desired behavior, or revert to the verbatim error path. |

## Authentication Gates

None during the planned tasks. The Rule 3 RLS pivot was a database access-policy issue surfaced as a blocking error; resolved by switching to the service-role client (server-only, no user auth involved).

## Forward Notes for Phase 3

- **Idempotent duplicate-phone behavior (`e8065f5`):** Phase 3 should verify the new redirect-to-existing-room flow is the intended UX before demo. If reverting, the verbatim error string `"This number is already in! Check your messages — you're already tuned in."` is what locked truth #3 originally specified.
- **Vercel preview international check is outstanding.** Re-run on the live Vercel preview from a non-IN endpoint (VPN to US) at Phase 3 kickoff: confirm `x-geo-country` resolves correctly and the inserted `signups.city` is a non-IN city or null (NOT an IN city). Outstanding-verification table is in SMOKE.md.
- **RLS hardening pivot.** The signup action is now on the service-role admin client. When Phase 4 hardens RLS, no further change is required for this code path — but every other write path will need the same treatment OR a permissive insert policy will need to be added per-table.
- **Bundle baseline drift to 121 kB.** Post-redesign baseline is 1 kB over the renegotiated 120 kB ceiling due to font additions. Accept-or-tighten decision deferred to Phase 7 polish; current state was deemed acceptable in the redesign commit.
- **Brand mark change.** The on-screen brand "Watch · Party" replaces "YogaParty" anywhere user-visible. Repo and URL names are unchanged.

## Threat Compliance (per `<threat_model>`)

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-02-13 (Tampering — hidden `referrer_id` edited via DevTools) | mitigate | ✅ Plan 02-02 server-side UUID regex + 23503 retry already covers; hidden input is convenience, not security |
| T-02-14 (Info Disclosure — error echoes user input) | mitigate | ✅ All error strings are static; no user input interpolated into error messages |
| T-02-15 (Repudiation — no CSRF) | accept | ✅ Next.js 15 server actions ship built-in CSRF (encrypted action ID + Origin/Host validation) |
| T-02-16 (Tampering — `<input name="city">` injected via DevTools) | mitigate | ✅ Smoke step 10 actively verified: DOM-injected city was ignored by the action; inserted `city` was `null`, not `"MaliciousCity"` |

## Threat Flags

None. No new security surface introduced beyond what the plan's `<threat_model>` already accounts for. The Rule 3 admin-client pivot expanded the trust boundary inside the server (service-role key now lives in the action), but `lib/supabase/admin.ts` is documented as server-only, sits inside a `'use server'` module, and is never imported into client code.

## Self-Check: PASSED

- ✅ `components/signup/CountryCodeSelect.tsx` exists at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/components/signup/CountryCodeSelect.tsx`
- ✅ `components/signup/SignupForm.tsx` exists at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/components/signup/SignupForm.tsx`
- ✅ `app/signup/page.tsx` exists at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/app/signup/page.tsx`
- ✅ `.planning/phases/02-landing-signup/SMOKE.md` exists at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/.planning/phases/02-landing-signup/SMOKE.md`
- ✅ Commit `86500ae` exists in git log (Task 1 — feat(02-04): add SignupForm, CountryCodeSelect, signup page)
- ✅ Commit `c3f7110` exists in git log (Task 2 — docs(02-04): record bundle audit with renegotiated budget)
- ✅ Commit `0468c31` exists in git log (Rule 3 — fix(02-04): switch signup action to service-role admin client)
- ✅ Commit `c3ea685` exists in git log (Task 3 — docs(02-04): record end-to-end smoke (12/12 PASS, browser-driven))
- ✅ Commit `0575a79` exists in git log (Task 3b — docs(02-04): record Vercel preview international check (Option B deferred))
- ✅ Commit `e91810e` exists in git log (Phase 2 finalization — docs(02): finalize requirements deviations and state for phase 2)
- ✅ `npx tsc --noEmit` exits 0 against current `main`
