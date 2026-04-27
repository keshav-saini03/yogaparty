# Phase 1: Scaffold & Deploy - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning
**Source:** PRD Express Path (`docs/superpowers/specs/2026-04-24-yogaparty-design.md`)

<domain>
## Phase Boundary

Stand up the foundation that every later phase builds on: a Next.js 15 App Router project wired to Supabase Postgres + Realtime, deployable to Vercel via `git push`, with the four core tables migrated and a reachable production URL.

**In scope:**
- Next.js 15 App Router project initialization with TypeScript
- Tailwind CSS v4 + shadcn/ui setup
- Supabase project provisioning (database + Realtime enabled)
- Database schema migration (signups, squads, squad_members, rooms tables)
- Environment variables wired (Supabase URL, anon key)
- Vercel project linked, auto-deploy on `git push` to main
- Placeholder homepage at production URL
- Basic `.env.example` and README

**Out of scope (later phases):**
- Landing page UI (Phase 2)
- Signup form logic (Phase 2)
- Watch room (Phase 3)
- WhatsApp sharing (Phase 4)
- Leaderboard (Phase 5)

</domain>

<decisions>
## Implementation Decisions

### Framework Stack (LOCKED — non-negotiable for hackathon)
- **Next.js 15 App Router** — SSR, server actions, Vercel-native
- **TypeScript** — Type safety across the codebase
- **Tailwind CSS v4** — Utility-first styling, fast iteration
- **shadcn/ui** — Pre-built accessible components (install only those needed per phase)
- **react-youtube** — YouTube IFrame API wrapper (will be needed in Phase 3)

### Backend Stack (LOCKED)
- **Supabase Postgres** — Database for signups, squads, rooms
- **Supabase Realtime** — Channels for room sync, chat, presence (Phase 3)
- **No separate backend server** — Server actions and Supabase client only
- **No Redis, no custom WebSocket server** — Supabase Realtime replaces both

### Auth Model (LOCKED)
- **No phone OTP verification** — friction kills conversion in a hackathon
- **No user accounts/passwords** — phone uniqueness is the identity key
- Signups table is the source of truth for user identity

### Deployment (LOCKED)
- **Vercel free tier** — frontend + server actions
- **Supabase free tier** — database + Realtime (50K MAU, 500 concurrent)
- **`git push` to main** triggers Vercel production deploy
- **Vercel subdomain initially** (e.g., `yogaparty.vercel.app`) — custom domain later if time

### Database Schema (LOCKED — exact tables from spec)

```sql
CREATE TABLE signups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  country_code TEXT NOT NULL DEFAULT '+91',
  city TEXT,
  referrer_id UUID REFERENCES signups(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE squads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id UUID REFERENCES signups(id) NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE squad_members (
  squad_id UUID REFERENCES squads(id) NOT NULL,
  signup_id UUID REFERENCES signups(id) NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (squad_id, signup_id)
);

CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'city',
  city TEXT,
  squad_id UUID REFERENCES squads(id),
  youtube_video_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

All four tables ship in this phase via a single migration / SQL script.

### Project Structure
```
hack-a-thon/
├── .planning/                  # GSD planning (already exists)
├── docs/                       # Spec (already exists)
├── app/                        # Next.js App Router pages
├── components/                 # React components
├── lib/                        # Supabase client, utilities
│   └── supabase/
│       ├── client.ts           # Browser client
│       └── server.ts           # Server client (server actions)
├── supabase/
│   └── migrations/             # SQL migrations
├── public/                     # Static assets
├── .env.example                # Documented env vars
├── .env.local                  # Real env vars (gitignored)
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anonymous key for client
- `SUPABASE_SERVICE_ROLE_KEY` — Server-only for admin queries (e.g., aggregates)

### Claude's Discretion
- Exact Next.js create command (recommend `npx create-next-app@latest --typescript --tailwind --app --src-dir false`)
- Whether to use Supabase CLI or apply schema via SQL editor (CLI is cleaner but adds setup time — for hackathon, SQL editor is fine)
- shadcn/ui initialization (defer until Phase 2 needs components)
- Linting/Prettier config (use defaults; this is not the time to debate semicolons)
- Whether to commit `.env.local` to nothing or use Vercel's env UI directly (use Vercel UI to avoid leaks)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source spec
- `docs/superpowers/specs/2026-04-24-yogaparty-design.md` — Full design spec; Phase 1 maps to "P0: Next.js scaffold + Supabase setup + Vercel deploy"

### Project planning
- `.planning/PROJECT.md` — Locked decisions (D-001 through D-015), tech stack
- `.planning/REQUIREMENTS.md` — REQ-INFRA acceptance criteria
- `.planning/ROADMAP.md` — Phase ordering and dependencies

### Architecture diagrams in spec
- Section "Architecture" of the SPEC — Vercel + Supabase topology
- Section "Tech Stack" — locked technology choices
- Section "Data Model" — exact SQL table definitions

</canonical_refs>

<specifics>
## Specific Ideas

- Use `npx create-next-app@latest` with App Router + TypeScript + Tailwind flags
- Place Supabase clients in `lib/supabase/{client,server}.ts` (the standard Next.js + Supabase pattern from Supabase docs)
- Use `@supabase/ssr` package for cookie-based session handling (even though we don't use auth, the helpers are useful for server actions)
- Vercel free tier auto-detects Next.js — no buildpack config needed
- Apply database schema via Supabase SQL editor for fastest path; CLI migrations can come later if time

</specifics>

<deferred>
## Deferred Ideas

- Custom domain (Vercel subdomain works for hackathon)
- CI/CD beyond Vercel's auto-deploy (GitHub Actions etc.)
- Database backups (free tier handles)
- Monitoring/observability (Vercel Analytics if any time at end)
- Type generation from Supabase schema (`supabase gen types typescript`) — nice-to-have but the schema is small enough to type by hand
- Row Level Security policies — defer until Phase 4 when referrals introduce more abuse vectors

</deferred>

---

*Phase: 01-scaffold-deploy*
*Context gathered: 2026-04-27 via PRD Express Path (spec-derived)*
