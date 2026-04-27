---
phase: 01-scaffold-deploy
plan: 01
subsystem: infra
tags: [scaffold, nextjs, supabase, vercel, tailwind]
requires: []
provides:
  - REQ-INFRA (partial — buildable scaffold ready; live deploy is Plan 01-02)
  - lib/supabase/{client,server,admin}.ts (browser, server, service-role factories)
  - middleware.ts (Vercel geolocation header injection)
  - supabase/migrations/0001_init.sql (4 tables + Realtime publication + indexes)
  - .env.example (env var contract)
  - README.md (setup, schema, env, deploy)
affects:
  - All future phases depend on this scaffold
tech-stack:
  added:
    - "next@15.5.15"
    - "react@19.1.0"
    - "react-dom@19.1.0"
    - "typescript@^5"
    - "tailwindcss@^4"
    - "@tailwindcss/postcss@^4"
    - "eslint@^9"
    - "eslint-config-next@15.5.15"
    - "@supabase/ssr@^0.10.2"
    - "@supabase/supabase-js@^2.104.1"
    - "@vercel/functions@^3.4.4"
  patterns:
    - "@supabase/ssr browser/server client factories (Next.js 15 async cookies)"
    - "Service-role admin client created via @supabase/supabase-js directly (NOT through @supabase/ssr — per RESEARCH.md Topic 1 gotchas)"
    - "Edge middleware geolocation injection via @vercel/functions (replaces removed request.geo)"
    - "Tailwind v4 CSS-first config (no tailwind.config.ts file — A2 confirmed)"
    - "Supabase Realtime publication enabled in same migration as table DDL (RESEARCH.md Topic 2)"
key-files:
  created:
    - "package.json"
    - "package-lock.json"
    - "tsconfig.json"
    - "next.config.ts"
    - "postcss.config.mjs"
    - "eslint.config.mjs"
    - ".gitignore"
    - ".env.example"
    - "README.md"
    - "app/layout.tsx"
    - "app/page.tsx"
    - "app/globals.css"
    - "app/favicon.ico"
    - "public/file.svg"
    - "public/globe.svg"
    - "public/next.svg"
    - "public/vercel.svg"
    - "public/window.svg"
    - "lib/supabase/client.ts"
    - "lib/supabase/server.ts"
    - "lib/supabase/admin.ts"
    - "middleware.ts"
    - "supabase/migrations/0001_init.sql"
  modified: []
decisions:
  - "Pinned create-next-app to v15 (not @latest, which is now v16.2.4) — plan locks Next.js 15 and middleware.ts root convention; Next.js 16 renames it to proxy.ts"
  - "Scaffolded into /tmp/yp-scaffold first, then moved files into repo root — create-next-app refuses to scaffold into a non-empty directory and --yes does not bypass the conflict check"
  - "Renamed package from create-next-app default 'yp-scaffold' to 'yogaparty'"
  - "Boilerplate README.md from create-next-app committed in Task 1 was overwritten in Task 3 (intentional — Task 3 owns the real README)"
  - "Added !.env.example exception to .gitignore — the default .env* pattern blocked committing the env contract (Rule 3 deviation)"
metrics:
  duration_seconds: 292
  duration_human: "4m 52s"
  tasks_completed: 3
  files_created: 23
  files_modified: 0
  commits: 3
  completed_at: "2026-04-27T05:26:33Z"
---

# Phase 1 Plan 01: Scaffold & Deploy — Local Scaffold Summary

A buildable Next.js 15 + TypeScript + Tailwind v4 repo at `/Users/habuild/Desktop/work/Habuild/hack-a-thon/` with Supabase client wrappers, Vercel geolocation middleware, four-table schema migration, env contract, and project README — ready for Plan 01-02 to push to GitHub and provision Supabase + Vercel.

## What Shipped

### Task 1 — Next.js 15 scaffold + runtime deps (commit `992210a`)
- `npx create-next-app@15` (pinned to v15.5.15) ran into `/tmp/yp-scaffold`, then files moved into repo root preserving `.planning/`, `docs/`, `.env`, `.git/`, `.claude/`.
- Installed `@supabase/ssr@^0.10.2`, `@supabase/supabase-js@^2.104.1`, `@vercel/functions@^3.4.4`.
- Replaced auto-generated `app/page.tsx` with the YogaParty placeholder.
- Renamed package from `yp-scaffold` to `yogaparty`.
- `npm run build` exits 0 with "Compiled successfully".

### Task 2 — Supabase client wrappers + middleware (commit `609db49`)
- `lib/supabase/client.ts` — `createBrowserClient` from `@supabase/ssr`.
- `lib/supabase/server.ts` — `createServerClient` with `await cookies()` (Next.js 15 async API), `getAll`/`setAll` cookie handlers, try/catch in `setAll`.
- `lib/supabase/admin.ts` — service-role client via `@supabase/supabase-js` directly with `auth: { persistSession: false, autoRefreshToken: false }`. Throws if env vars missing (fails closed).
- `middleware.ts` at repo root — `geolocation()` from `@vercel/functions` writes `x-geo-city` and `x-geo-country` response headers. Edge runtime (default).
- `npx tsc --noEmit` exits 0.

### Task 3 — Schema + env contract + README (commit `6ce8c00`)
- `supabase/migrations/0001_init.sql` — verbatim CONTEXT.md schema for `signups`, `squads`, `squad_members`, `rooms`; three `ALTER PUBLICATION supabase_realtime ADD TABLE` lines for `signups`, `rooms`, `squad_members`; five hot-path indexes.
- `.env.example` — three env vars with `SUPABASE_SERVICE_ROLE_KEY` correctly UN-prefixed (Pitfall 2 mitigated).
- `README.md` — stack, local setup, schema apply path, env vars table, deploy mechanism, and the local-geolocation gotcha (Pitfall 5).

## Verification

| Check | Result |
|-------|--------|
| `npm run build` | Compiled successfully (0 errors, 0 warnings) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0, no warnings |
| `npm run dev` + `curl localhost:3000` | Returns "YogaParty" placeholder |
| `.planning/`, `docs/` | Untouched |
| `.gitignore` | `.env.local` ignored, `.env.example` committable |
| Realtime publication lines | 3 (signups, rooms, squad_members) |
| `lib/supabase/` files | admin.ts, client.ts, server.ts |
| Deprecated package check | No `@supabase/auth-helpers-nextjs` anywhere |
| Removed API check | No `request.geo` anywhere |

## Deviations from Plan

### 1. [Rule 3 — Blocking] `create-next-app` flag corrections
**Found during:** Task 1
**Issue:** The plan specified `npx create-next-app@latest . --src-dir=false --no-experimental-app --yes`. Three problems:
- `--latest` resolves to v16.2.4 (current as of 2026-04-27), but the plan locks **Next.js 15** and assumes `middleware.ts` at root (Next.js 16 renames it to `proxy.ts`).
- `--src-dir=false` is not a supported flag — `--src-dir` is a boolean (presence enables; absence is the default "no src dir").
- `--no-experimental-app` was removed from the CLI (it was a Next.js 13 transitional flag).
- `--yes` does NOT bypass the non-empty-directory conflict check; create-next-app explicitly refuses when `.claude/`, `.env`, and `.planning/` are present.

**Fix:** Pinned to `create-next-app@15` (resolved to v15.5.15). Removed invalid flags. Scaffolded into `/tmp/yp-scaffold` first, then `mv`'d files into the repo root preserving `.planning/`, `docs/`, `.env`, `.git/`, `.claude/`.

**Files modified:** N/A (process change)

**Commit:** `992210a`

### 2. [Rule 3 — Blocking] `.gitignore` `.env*` blocked `.env.example`
**Found during:** Task 3 (`git add .env.example` failed)
**Issue:** Default `create-next-app` `.gitignore` uses pattern `.env*` (broader than the plan's must_have `.env*.local`). This satisfies the security requirement (the existing `.env` file at repo root is correctly ignored, as is `.env.local`) — but it also blocks committing the documented `.env.example` contract.
**Fix:** Added `!.env.example` exception to `.gitignore`.
**Files modified:** `.gitignore`
**Commit:** `6ce8c00`

### 3. [Note — Tailwind v4 CSS-first config]
**Found during:** Task 1
**Issue:** Per RESEARCH.md A2, Tailwind v4 may scaffold without a `tailwind.config.ts`.
**Outcome:** Confirmed — no `tailwind.config.ts` file exists. Configuration lives in `app/globals.css` via `@import "tailwindcss"` and PostCSS plugin (`@tailwindcss/postcss` in `postcss.config.mjs`). No action needed; matches RESEARCH.md expectation.

### 4. [Note — middleware bundle size]
**Found during:** Final build verification
**Issue:** N/A (informational)
**Outcome:** Next.js 15 reports `ƒ Middleware 42.9 kB` after Task 2. Within Vercel free-tier Edge runtime limits (≤ 1 MB compressed). No action needed.

## Authentication Gates

None — Plan 01-01 is fully local and required no external service auth. Plan 01-02 will hit auth gates (GitHub, Vercel, Supabase logins).

## Open Questions for Plan 02

The following must be resolved by the human in Plan 01-02 (none affect Plan 01-01's correctness):

1. **GitHub repository name and URL.** Plan 02 must create a repo and `git push origin main`. Suggested name: `yogaparty` (matches `package.json`), but the user owns the namespace.
2. **Supabase project name and region.** Suggested region: `ap-south-1` (Mumbai) for India-first hackathon audience. The created project URL becomes `NEXT_PUBLIC_SUPABASE_URL` and the anon/service-role keys go into Vercel env UI.
3. **Vercel project name.** Defaults to GitHub repo name; user can override.
4. **Custom domain?** Out of scope for Plan 01-02 per CONTEXT.md "Deferred Ideas" — Vercel subdomain (`yogaparty.vercel.app` or whatever it auto-assigns) is the deliverable.
5. **`SUPABASE_SERVICE_ROLE_KEY` scope in Vercel.** RESEARCH.md Topic 5 recommends "Production only — keep out of preview" to prevent preview deploys from getting RLS-bypass keys. Plan 02 should explicitly set this scope (Vercel UI → Environment Variables → uncheck Preview/Development).

## Threat Flags

None — no new security surface beyond what's already in the threat model. All Phase 1 threat-register mitigations apply:
- T-01-01 (service role key disclosure): mitigated — env named correctly, only `lib/supabase/admin.ts` reads it, .env.example documents the rule.
- T-01-02 (geolocation header spoofing): mitigated — middleware sets headers from `geolocation(request)`; client-supplied geo headers must be ignored in Phase 2+ readers.
- T-01-04 (.env.local accidentally committed): mitigated — `.gitignore` `.env*` pattern (broader than plan asked for) catches all `.env.local` variants; `!.env.example` allows only the contract through.
- T-01-07 (anon key client elevates to service role): mitigated — three separate factories, `admin.ts` throws if env missing.

## Self-Check: PASSED

Verified via filesystem and git log:

```
FOUND: app/page.tsx
FOUND: app/layout.tsx
FOUND: lib/supabase/client.ts
FOUND: lib/supabase/server.ts
FOUND: lib/supabase/admin.ts
FOUND: middleware.ts
FOUND: supabase/migrations/0001_init.sql
FOUND: .env.example
FOUND: README.md
FOUND: package.json
FOUND: 992210a (Task 1 commit)
FOUND: 609db49 (Task 2 commit)
FOUND: 6ce8c00 (Task 3 commit)
```
