---
phase: 02-landing-signup
plan: 02
subsystem: signup-action
tags: [server-action, supabase-write, validation, server-authoritative-city]
requires:
  - lib/supabase/server.ts        # createClient() — anon-key server client (Phase 1)
  - lib/geo.ts                    # getDetectedCity() — sole source of city (Plan 02-01)
  - lib/types.ts                  # SignupState (Plan 02-01)
  - next/navigation               # redirect() control-flow throw
  - next/server (signups table)   # Phase 1 migration 0001_init.sql
provides:
  - app/actions/signup.ts         # createSignup() — sole writer to signups in Phase 2
  - re-export type SignupState    # client form imports both from one module
affects:
  - app/page.tsx                  # NOT modified here — Plan 02-03 wires the form to this action
tech_stack:
  added: []
  patterns:
    - "'use server' module-level directive (Next.js 15 server action)"
    - "useActionState contract: (prevState, formData) => Promise<State>"
    - "redirect() OUTSIDE try/catch (it throws a control-flow signal)"
    - "Postgres unique-violation detected via error.code === '23505' (never error.message)"
    - "Postgres FK-violation detected via error.code === '23503' with one-shot retry"
    - "UUID shape regex pre-check before sending to FK column"
key_files:
  created:
    - app/actions/signup.ts
  modified: []
decisions:
  - "City is server-authoritative: action reads it ONLY from getDetectedCity(); formData.get('city'|'detected_city'|...) does not appear in the file (T-02-08b mitigation, grep-enforced)"
  - "Allowed formData reads are exactly four: name, phone, country_code, referrer_id — anything else is silently ignored"
  - "FK violation on referrer_id retries once with null instead of pre-querying signups (avoids round-trip; matches RESEARCH Topic 3)"
  - "Phone validation is regex-only (/^\\d{6,15}$/) — no zod/yup, two if-statements suffice"
  - "Duplicate-phone error string is the verbatim CONTEXT.md copy: \"This number is already in! Check your messages — you're already part of YogaParty.\""
  - "console.error logs only the error object — never form data — to satisfy T-02-07"
metrics:
  duration_minutes: 3
  tasks_completed: 1
  files_created: 1
  files_modified: 0
  completed_date: 2026-04-27
---

# Phase 2 Plan 02: createSignup Server Action Summary

**One-liner:** The single write path for Phase 2 — `app/actions/signup.ts` validates `(name, phone, country_code, referrer_id)` from FormData, sources `city` only from Vercel Edge headers via `getDetectedCity()`, inserts via the anon-key Supabase client, maps `23505` to the locked friendly duplicate message, retries once on `23503` with `referrer_id = null`, and redirects to `/room/<inserted-id>` on success.

## What Shipped

| File | Purpose | Exports |
|------|---------|---------|
| `app/actions/signup.ts` | Sole writer to `signups` for Phase 2 | `createSignup`, `type SignupState` (re-exported) |

86 lines, including the FK retry path. No other file was touched.

## Tasks & Commits

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create `app/actions/signup.ts` with full validation, 23505/23503 branches, server-authoritative city, and post-success redirect | `f269c3f` | `app/actions/signup.ts` |

## Verification (per `<verify>` gate)

All grep gates and type/build checks pass:

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` exits 0 | ✅ |
| `npm run build` succeeds (Turbopack, all 5 pages generated) | ✅ |
| `'use server'` present at top | ✅ |
| `23505` branch present | ✅ |
| `23503` retry branch present | ✅ |
| `redirect(\`/room/...)` present | ✅ |
| Verbatim duplicate string present | ✅ |
| `getDetectedCity()` present (called once) | ✅ |
| **Negative gate:** no `try {` block in file | ✅ (no match) |
| **Negative gate:** `formData.get('city'...)` absent | ✅ (no match) |
| **Negative gate:** `formData.get('detected_city'...)` absent | ✅ (no match) |

Build output: `/`, `/_not-found`, `/room/[id]` registered (113 kB First Load JS — same as after Plan 02-01). Server actions are bundled into the route that consumes them, so this plan does not introduce a new route entry.

## Truths Established (per `must_haves.truths`)

- ✅ Server action `createSignup` accepts `(prevState, FormData)` and returns `Promise<SignupState>`
- ✅ Successful insert redirects to `/room/<inserted-uuid>` (selected via `.select('id').single()`)
- ✅ Duplicate phone returns the locked friendly error string verbatim
- ✅ Empty / malformed `referrer_id` is coerced to `null` via UUID regex shape check (no `23503` leakage to user)
- ✅ Phone is validated as 6–15 digits before hitting the database
- ✅ Detected city is read from `x-geo-city` via `lib/geo.ts` (server-authoritative); city is NEVER read from `formData`

## Behavior Coverage

Every input branch from the `<behavior>` block is wired:

| Input | Output |
|-------|--------|
| Empty / whitespace `name` | `{ error: 'Please enter your name.' }` |
| `phone` not matching `/^\d{6,15}$/` | `{ error: 'Phone must be 6–15 digits.' }` |
| Missing `country_code` form field | Defaults to `'+91'` (uses `||` so empty string also defaults) |
| `referrer_id` empty string | Stored as `null` |
| `referrer_id` not matching UUID regex | Stored as `null` |
| `referrer_id` valid UUID but absent in `signups` | Caught (`23503`) and retried once with `referrer_id = null` |
| Supabase `error.code === '23505'` | Verbatim duplicate-phone error string |
| Other Supabase error | `console.error('signup insert failed', error)` + `{ error: 'Something went wrong. Try again.' }` |
| Success | `redirect(\`/room/${data.id}\`)` (outside any try/catch) |
| Any client-supplied `city` field | Silently ignored — `formData.get` is never called for `city` |

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes were needed.

A minor implementation choice worth documenting (not a deviation): for `country_code` we use `||` rather than `??` so an empty string from the form (e.g., `<input value="">`) also defaults to `'+91'`. This matches the `<behavior>` clause "Missing country_code form field → defaults to '+91'" more loosely (treats empty-string as missing) and is the safer behavior for a `NOT NULL DEFAULT '+91'` column.

## Authentication Gates

None — the action uses the anon-key client; RLS is off in Phase 1/2 per the plan's stated contract.

## Forward Notes for Plan 02-03 / 02-04

- **Plan 02-03 (signup form, parallel wave 2):** can `import { createSignup, type SignupState } from '@/app/actions/signup'` — both are exported from this single module. Wire it via `useActionState` from `react` (NOT `react-dom`).
- **Plan 02-04 (smoke test):** the redirect target `/room/<uuid>` is reachable thanks to the placeholder route from Plan 02-01. Smoke can submit a unique phone, expect a 303-style redirect to `/room/<some-uuid>`, then submit the same phone again and expect the verbatim duplicate-phone error string.
- **Phase 4 (RLS hardening):** when RLS is turned on, this action will need to either (a) move to the service-role client or (b) add a permissive insert policy for `anon`. Today's anon-key insert with RLS-off is the explicit Phase 1/2 contract.
- **Phase 5 (live counter / leaderboard):** `data.id` returned from the insert is the canonical user identity (D-001..D-015 in PROJECT.md). Self-referral checks should hook off `referrer_id !== id`.

## Threat Coverage

The plan's `<threat_model>` mitigations are satisfied:

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-02-03 (Tampering — non-digit phone) | ✅ mitigated | Regex `/^\d{6,15}$/` rejects before insert |
| T-02-04 (Tampering — self-referral) | accepted | Out of scope per CONTEXT (Phase 5 leaderboard concern) |
| T-02-05 (Tampering — non-UUID referrer) | ✅ mitigated | UUID regex shape check; non-matching → `null` |
| T-02-06 (DoS — bot signup flood) | accepted | Deferred to Phase 4 per CONTEXT |
| T-02-07 (Info disclosure — error logs) | ✅ mitigated | `console.error` logs the error object only, never form data; user sees generic message |
| T-02-08 (Repudiation) | accepted | `id + created_at` is sufficient identity |
| T-02-08b (Tampering — client `city` spoof) | ✅ mitigated | Action does not read `city` from `formData`; sole source is `getDetectedCity()`; grep gate enforces this |

## Threat Flags

None. No new security surface beyond what the threat register anticipates. Specifically:
- The action does not introduce any new endpoint accepting user input beyond what PLAN.md modeled (server action invoked from `/signup` form, which Plan 02-03 will wire up).
- No new file-system or network egress patterns introduced.
- No new auth/trust boundaries — same anon-key boundary the rest of Phase 1/2 already crosses.

## Self-Check: PASSED

- ✅ `app/actions/signup.ts` exists at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/app/actions/signup.ts`
- ✅ Commit `f269c3f` exists in git log (`feat(02-02): add createSignup server action`)
- ✅ All 9 grep gates from `<verify>` pass (6 positive, 3 negative)
- ✅ `npx tsc --noEmit` exits 0
- ✅ `npm run build` exits 0
