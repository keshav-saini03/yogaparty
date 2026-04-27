# YogaParty

Watch yoga together with people near you. Built for the Habuild "Kuch Karke Dikha" 48-hour hackathon (Apr 27–28, 2026).

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Realtime)
- Vercel (free tier, auto-deploy on `git push` to `main`)

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in your Supabase project credentials:
   ```bash
   cp .env.example .env.local
   ```

3. Run the dev server:
   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

> **Local geolocation is always empty.** `@vercel/functions` `geolocation()` only returns real values on Vercel's edge network. The signup form (Phase 2) falls back to a default city in dev.

## Database

Schema lives in `supabase/migrations/0001_init.sql` (four tables: `signups`, `squads`, `squad_members`, `rooms`, plus Realtime publication setup).

To apply on a fresh Supabase project:

1. Open the Supabase Dashboard → SQL Editor.
2. Paste the contents of `supabase/migrations/0001_init.sql`.
3. Click Run.
4. Verify in **Database → Publications → `supabase_realtime`** that `signups`, `rooms`, and `squad_members` are toggled on.

## Environment Variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | Public, exposed to browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `.env.local` | Public, exposed to browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (Production only) + `.env.local` | **Server-only.** Bypasses RLS. Never prefix with `NEXT_PUBLIC_`. |

## Deployment

`git push origin main` triggers a Vercel production deploy. No `vercel.json`, no custom build command — Next.js auto-detection covers everything.

## Project Structure

```
app/                  # Next.js App Router pages
lib/supabase/         # Browser, server, and admin Supabase clients
middleware.ts         # Vercel geolocation header injection
supabase/migrations/  # SQL schema (apply via Supabase SQL editor)
public/               # Static assets
.planning/            # GSD planning artifacts (ignored by Next.js build)
docs/                 # Spec (ignored by Next.js build)
```

## Phase Status

See `.planning/ROADMAP.md` for the 7-phase plan.
