# Phase 1: Scaffold & Deploy - Research

**Researched:** 2026-04-27
**Domain:** Next.js 15 App Router + Supabase + Vercel scaffolding
**Confidence:** HIGH
**Mode:** Light research (gotcha-focused, hackathon)

## Summary

Stack is fully locked. This research only resolves the "right answer fast" for five known gotcha areas. Every recommendation below is the path that costs the least time and has the fewest sharp edges in a 48-hour build. Two non-obvious things to remember:

1. **`request.geo` does not exist anymore.** It was removed from `NextRequest` before Next.js 15 shipped. Use `geolocation()` from `@vercel/functions`.
2. **Supabase Realtime requires opting tables into a publication** — not on by default. One SQL line per table, do it now in the same migration.

**Primary recommendation:** Use `npx create-next-app@latest`, paste the schema + 4 publication lines into the Supabase SQL editor once, install `@supabase/ssr` + `@vercel/functions`, push to a fresh GitHub repo connected to Vercel, paste env vars in the Vercel UI. Don't touch the Supabase CLI in Phase 1.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Framework Stack (LOCKED — non-negotiable for hackathon)**
- Next.js 15 App Router — SSR, server actions, Vercel-native
- TypeScript — Type safety across the codebase
- Tailwind CSS v4 — Utility-first styling, fast iteration
- shadcn/ui — Pre-built accessible components (install only those needed per phase)
- react-youtube — YouTube IFrame API wrapper (Phase 3)

**Backend Stack (LOCKED)**
- Supabase Postgres — Database
- Supabase Realtime — Channels for room sync, chat, presence (Phase 3)
- No separate backend server, no Redis, no custom WebSocket server

**Auth Model (LOCKED)**
- No phone OTP verification
- No user accounts/passwords — phone uniqueness is the identity key
- Signups table is the source of truth for user identity

**Deployment (LOCKED)**
- Vercel free tier (frontend + server actions)
- Supabase free tier (50K MAU, 500 concurrent, 500MB DB)
- `git push` to main triggers Vercel production deploy
- Vercel subdomain initially

**Database Schema (LOCKED — exact tables in CONTEXT.md, four tables: signups, squads, squad_members, rooms)**

**Environment Variables**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)

### Claude's Discretion
- Exact Next.js create command (recommend `npx create-next-app@latest --typescript --tailwind --app`)
- Whether to use Supabase CLI or apply schema via SQL editor (CLI is cleaner but adds setup time)
- shadcn/ui initialization (defer until Phase 2 needs components)
- Linting/Prettier config (use defaults)
- Whether to commit `.env.local` or use Vercel's env UI (use Vercel UI to avoid leaks)

### Deferred Ideas (OUT OF SCOPE)
- Custom domain
- CI/CD beyond Vercel auto-deploy
- Database backups
- Monitoring/observability
- Type generation from Supabase schema
- Row Level Security (deferred to Phase 4)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-INFRA | Next.js 15 + Supabase + Vercel deployable scaffold with 4 tables migrated and reachable production URL | Topics 1, 2, 4 below cover client setup, schema apply, and the realtime publication step that REQ-INFRA implies for Phase 3 readiness. Topic 3 (geolocation) is technically Phase 2's REQ-INTERNATIONAL but the dependency `@vercel/functions` is best installed during scaffolding so it's there when Phase 2 starts. |
</phase_requirements>

## Topic 1 — `@supabase/ssr` Browser vs Server Client

**Current best practice** (Supabase docs as of 2026): two helpers in `@supabase/ssr` — `createBrowserClient` and `createServerClient`. `@supabase/auth-helpers-nextjs` is fully deprecated; do not install it. [VERIFIED: supabase.com/docs/guides/auth/server-side/creating-a-client]

The cookie API uses **`getAll` and `setAll` only** — never `get`/`set`/`remove`. Using the legacy individual cookie methods is the #1 source of "why is my session not refreshing" bugs. [VERIFIED: supabase.com/docs/guides/auth/server-side/nextjs]

We don't have auth in this app, but `@supabase/ssr` is still the right package because:
- It's the only path that won't fight Next.js 15's async `cookies()` API.
- Server actions need the server client to forward cookies/headers correctly (Vercel cache rules).
- Switching later costs more than installing it now.

**`lib/supabase/client.ts` (browser):**
```ts
// Source: supabase.com/docs/guides/auth/server-side/nextjs
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**`lib/supabase/server.ts` (server actions / RSC):**
```ts
// Source: supabase.com/docs/guides/auth/server-side/nextjs
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies(); // Next.js 15: cookies() is async

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore.
            // Server Actions / Route Handlers will succeed.
          }
        },
      },
    }
  );
}
```

**Gotchas:**
- `cookies()` is **async** in Next.js 15 — must `await`. Forgetting this is the most common "Turbopack: cookies() should be awaited" error. [VERIFIED: github.com/vercel/next.js/discussions/81445]
- `setAll`'s try/catch is required, not optional. Server Components throw on cookie writes; Server Actions don't.
- For server-only admin operations (aggregate counts on landing, etc.), use a separate helper that calls `createClient` from `@supabase/supabase-js` directly with `SUPABASE_SERVICE_ROLE_KEY` and `auth: { persistSession: false }`. Don't pass the service role key through `@supabase/ssr`.

**DECISION FOR PHASE 1:** Install `@supabase/ssr` and `@supabase/supabase-js`. Create `lib/supabase/client.ts` and `lib/supabase/server.ts` with the above code. Skip `auth-helpers-nextjs` entirely.

## Topic 2 — Supabase Realtime Initialization

**Realtime is NOT on by default.** Each table you want to broadcast `postgres_changes` from must be added to the `supabase_realtime` publication. Without this, your Phase 3 `room:{roomId}` channel subscriptions will run, return zero events, and silently fail. [VERIFIED: supabase.com/docs/guides/realtime/postgres-changes]

For YogaParty specifically:
- **Broadcast/Presence** channels (room sync, chat, reactions, presence list) **don't** need publication — they're pure pub/sub on the client.
- **`postgres_changes`** events (live signup counter on landing in Phase 5, leaderboard auto-refresh) **do** need publication.

So we should opt in `signups` (for the live counter) and possibly `rooms` (so participant lists react to room state changes) **now**, in the same SQL block as the schema. Do not wait for Phase 5 — it costs nothing now and means zero head-scratching later.

**Add to migration SQL:**
```sql
-- Source: supabase.com/docs/guides/realtime/postgres-changes
ALTER PUBLICATION supabase_realtime ADD TABLE signups;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE squad_members;
-- squads: probably not needed for live changes, leave off for now
```

Alternatively, in the Supabase Dashboard: **Database → Publications → `supabase_realtime` → toggle the four tables on**. Same effect, slower. Use the SQL approach because it lives in the migration file and is reproducible.

**Client-side:** `createBrowserClient(...)` already returns a Realtime-ready client. No `realtime: { ... }` option is required for our scale (well under the 500 concurrent free-tier limit). [VERIFIED: supabase.com/docs/guides/realtime/getting_started]

**Gotcha:** Free-tier Realtime ignores RLS for broadcast/presence but **enforces RLS for `postgres_changes`**. Since we deferred RLS to Phase 4, leave the tables with default permissions (PostgREST anon access via the anon key). When RLS is added in Phase 4, the live counter SELECT must pass an RLS policy or the realtime stream will go silent. Note this for Phase 4. [CITED: supabase.com/docs/guides/realtime/postgres-changes]

**DECISION FOR PHASE 1:** Append three `ALTER PUBLICATION supabase_realtime ADD TABLE …` lines to the migration SQL. No client-side config needed.

## Topic 3 — Vercel Geolocation (request.geo is gone)

**`request.geo` and `request.ip` were removed from `NextRequest`.** This was a breaking change merged into Next.js 15 (PR #68379, leerob). If a tutorial says `request.geo.city`, it's stale. [VERIFIED: github.com/vercel/next.js/pull/68379]

The replacement is `@vercel/functions`:

```ts
// Source: vercel.com/docs/functions/functions-api-reference/vercel-functions-package
// File: middleware.ts (root)
import { geolocation } from '@vercel/functions';
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { city, country } = geolocation(request);
  const response = NextResponse.next();
  // Forward to the app via headers (server components can read these)
  response.headers.set('x-geo-city', city ?? '');
  response.headers.set('x-geo-country', country ?? '');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

**Reading the city in a Server Component or Server Action:**
```ts
import { headers } from 'next/headers';

const h = await headers(); // async in Next.js 15
const city = h.get('x-geo-city') || 'Mumbai'; // fallback for local dev
```

**Gotchas:**
- `@vercel/functions` `geolocation()` only returns real values when deployed on Vercel. **Locally it returns `undefined` for every field.** Always have a fallback default city for `npm run dev`. [VERIFIED: vercel.com/docs/functions/edge-middleware/middleware-api]
- Edge runtime is **default** for `middleware.ts`. Don't add `export const runtime = 'nodejs'` — `@vercel/functions` `geolocation()` works on both, but Edge is faster and free-tier-friendlier.
- Properties are **all optional**: `city?`, `country?`, `region?`, `latitude?`, `longitude?`, `postalCode?`. Type your reads accordingly.
- Next.js 16 will rename `middleware.ts` → `proxy.ts` and drop Edge runtime. We're on Next.js 15, so this is informational only — do not try to use `proxy.ts`. [VERIFIED: WebSearch on geo middleware Next.js 16, multiple sources]

**DECISION FOR PHASE 1:** Install `@vercel/functions`. Create a minimal `middleware.ts` at project root that runs `geolocation(request)` and writes `x-geo-city` / `x-geo-country` headers. Phase 2 reads these in the signup form.

## Topic 4 — Migration Approach (SQL editor vs CLI vs Prisma)

For this project, all three are technically viable. The hackathon-correct answer is **Supabase SQL editor, executed once, schema lives in `supabase/migrations/0001_init.sql` in the repo as a record**. [CITED: supabase.com/docs/guides/deployment/database-migrations]

| Approach | Time to first table | Ongoing cost | Suitable for hackathon? |
|----------|---------------------|--------------|--------------------------|
| Supabase SQL editor (paste & run) | ~2 min | None — but no automated reapply | **Yes — pick this** |
| Supabase CLI (`supabase init` + `db push`) | ~15-25 min (Docker, link, login, migration tooling) | Ongoing migration discipline | No — over-engineering |
| Prisma | ~30 min (install, schema, generate, migrate, env wiring) | Two clients to keep in sync (Prisma + supabase-js) | No — fights Supabase |

**Why SQL editor wins for a 48-hour build:**
- Schema is **78 lines**. There's no migration history to manage.
- The CLI requires Docker for local dev, a `supabase link` step, and an access token — all of which can fail silently and burn 30 minutes.
- We're not branching environments. There's only one DB.
- We **still keep the SQL in `supabase/migrations/0001_init.sql`** so it's reviewable, version-controlled, and replayable manually if we nuke the project.

**Gotcha:** The official Supabase docs warn "Never change the remote database directly" once you adopt CLI migrations. We're explicitly not adopting CLI migrations in this hackathon, so this rule does not apply. If we ever need a schema change post-Phase 1, add a new file `supabase/migrations/0002_<change>.sql` and run it in the SQL editor. [CITED: supabase.com/docs/guides/deployment/database-migrations]

**DECISION FOR PHASE 1:** Author `supabase/migrations/0001_init.sql` containing (1) the four `CREATE TABLE` statements verbatim from CONTEXT.md, plus (2) the three `ALTER PUBLICATION` lines from Topic 2. Paste into Supabase SQL editor, click Run, commit the file. Done.

## Topic 5 — Vercel Deployment Conventions

**The flow:**
1. Push the Next.js scaffold to a new GitHub repo.
2. In Vercel UI: "Add New Project" → import the repo → Vercel auto-detects Next.js → no config tweaks needed.
3. In Project Settings → Environment Variables, paste:
   - `NEXT_PUBLIC_SUPABASE_URL` (Production, Preview, Development)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Production, Preview, Development)
   - `SUPABASE_SERVICE_ROLE_KEY` (Production only — keep out of preview)
4. Click Deploy. First build takes ~1-2 minutes.
5. Subsequent `git push origin main` → auto-deploys to production.

**Gotchas:**
- **`NEXT_PUBLIC_*` is required for browser-readable vars.** Anything without that prefix is server-only at runtime. Forgetting the prefix on `SUPABASE_URL` is a common rookie error — the browser client will be `undefined` at runtime.
- **Service role key must NEVER be `NEXT_PUBLIC_*`.** It bypasses RLS. Set it as plain `SUPABASE_SERVICE_ROLE_KEY` — server-only.
- **Preview deploys are auto-generated for every branch and PR.** They will share the production Supabase DB (we have no preview DB). This is fine for the hackathon — just be aware that pushing junk to a branch can write rows.
- **Vercel free tier limits:** 100 GB bandwidth/month, 100 GB-hours of serverless execution. We will not approach either with hackathon-scale traffic.
- Do **not** create `vercel.json` — Next.js auto-detection covers everything we need.

**DECISION FOR PHASE 1:** Add env vars via the Vercel UI (not committed to repo). Document them in `.env.example` only. No `vercel.json`. No custom build command.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 15.x (latest stable) | App framework | Locked decision D-001 |
| `react` / `react-dom` | 19.x | Bundled with Next.js 15 | Required peer |
| `typescript` | 5.x | Type safety | Locked |
| `tailwindcss` | 4.x | Styling | Locked |
| `@supabase/supabase-js` | latest 2.x | Supabase JS client | Required by `@supabase/ssr` |
| `@supabase/ssr` | latest | SSR cookie handler | Official Next.js + Supabase pattern |
| `@vercel/functions` | latest | Geolocation helper | Replaces removed `request.geo` |

### Supporting (deferred to later phases — DO NOT install in Phase 1)
| Library | Phase | Purpose |
|---------|-------|---------|
| `react-youtube` | 3 | YouTube IFrame API wrapper |
| shadcn/ui components | 2+ | Per-component, only as needed |

**Installation command:**
```bash
npx create-next-app@latest yogaparty \
  --typescript --tailwind --app --eslint \
  --import-alias "@/*"

cd yogaparty
npm install @supabase/supabase-js @supabase/ssr @vercel/functions
```

**Version verification:** Skipped in light mode — these are widely deployed packages with stable APIs. The implementer should run `npm install` and accept whatever current `latest` is on April 27, 2026. [ASSUMED: package versions current and compatible]

## Architecture Patterns

### Project Structure (matches CONTEXT.md)
```
yogaparty/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # Placeholder homepage
│   └── globals.css
├── components/               # (empty, populated in Phase 2+)
├── lib/
│   └── supabase/
│       ├── client.ts         # createBrowserClient
│       └── server.ts         # createServerClient
├── supabase/
│   └── migrations/
│       └── 0001_init.sql     # Schema + publication
├── middleware.ts             # Geolocation passthrough
├── public/
├── .env.example
├── .env.local                # gitignored
├── .gitignore
├── next.config.ts
├── tailwind.config.ts        # If Tailwind 4 still uses one — v4 prefers CSS-only config
├── tsconfig.json
└── package.json
```

**Note on Tailwind v4:** v4 prefers CSS-first configuration via `@import "tailwindcss"` in `globals.css` and `@theme` directives in CSS. There may be no `tailwind.config.ts` at all if `create-next-app` ships the v4 template. Don't fight it — accept whatever the scaffold produces. [ASSUMED: based on Tailwind v4 stable release patterns; verify when running create-next-app]

### Pattern: Single Supabase client per request
**What:** Always call `createClient()` fresh inside each server action / RSC, never module-scope.
**When to use:** Every server action.
**Why:** The client closes over the request's cookie store. A module-scope client leaks cookies across requests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie-based Supabase session | Manual `Cookie` header forwarding | `@supabase/ssr` | Cookie name + chunking format is a moving target |
| Geolocation from IP | IP→city lookup library | `@vercel/functions` `geolocation()` | Vercel injects geo headers for free |
| Migration tooling | Custom shell scripts | Supabase SQL editor + version-controlled `.sql` file | Schema is 80 lines; no machinery needed |
| WebSocket layer | Socket.io / ws | Supabase Realtime channels | Locked decision; covered in Phase 3 |

## Common Pitfalls

### Pitfall 1: Forgetting `await cookies()` and `await headers()`
**What goes wrong:** Build succeeds, dev mode throws "cookies() should be awaited" runtime errors that break server actions.
**Why it happens:** Next.js 15 made `cookies()`, `headers()`, `params`, and `searchParams` async. Tutorials from Next.js 13/14 era show synchronous calls.
**How to avoid:** Always `await` them. The `lib/supabase/server.ts` template above is correct.
**Warning signs:** Console error mentions Turbopack and "should be awaited."

### Pitfall 2: Using `NEXT_PUBLIC_` on the service role key
**What goes wrong:** Service role key is exposed to every browser session. RLS bypass is now public. Catastrophic in production.
**Why it happens:** Copying the env var pattern blindly.
**How to avoid:** Service role key is `SUPABASE_SERVICE_ROLE_KEY` (no prefix). It's only readable in server actions / route handlers / RSC, never client.
**Warning signs:** Reviewing `.env.example` and finding `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` — delete it.

### Pitfall 3: Realtime publication forgotten
**What goes wrong:** Phase 5 live counter renders zero, doesn't update. Looks like a code bug. Burns hours debugging.
**Why it happens:** Postgres replication is opt-in per table.
**How to avoid:** Add `ALTER PUBLICATION` lines to the Phase 1 migration. Verify via Supabase Dashboard → Database → Publications immediately after running the migration.
**Warning signs:** `supabase.channel().on('postgres_changes', ...)` subscribes successfully but never fires.

### Pitfall 4: Server Component trying to set cookies
**What goes wrong:** "Cookies can only be modified in a Server Action or Route Handler" thrown at runtime.
**Why it happens:** Calling `createClient()` from `lib/supabase/server.ts` in a Server Component triggers the `setAll` callback when Supabase wants to refresh tokens, which then tries to write cookies.
**How to avoid:** The try/catch in `setAll` (shown above) silently swallows this. As long as you copy the canonical template, you're fine.
**Warning signs:** Stack trace mentions `cookieStore.set` from a Server Component file.

### Pitfall 5: Local geolocation always undefined
**What goes wrong:** `localhost:3000` returns `undefined` for city/country. Signup form pre-fills empty.
**Why it happens:** Geolocation requires Vercel's edge network to inject headers; localhost has no IP geo.
**How to avoid:** Always have a fallback: `const city = headers().get('x-geo-city') || 'Mumbai'`. Test the live behavior on the Vercel preview URL after deploy.
**Warning signs:** Form looks broken in dev, works on preview deploy.

## Code Examples

### `supabase/migrations/0001_init.sql`
```sql
-- Source: CONTEXT.md schema (locked) + supabase.com/docs realtime
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

-- Enable Realtime postgres_changes for tables consumed by Phase 5 live counter
-- and Phase 3/6 room/squad UIs.
ALTER PUBLICATION supabase_realtime ADD TABLE signups;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE squad_members;

-- Helpful indexes for hot paths
CREATE INDEX idx_signups_city ON signups(city);
CREATE INDEX idx_signups_country_code ON signups(country_code);
CREATE INDEX idx_signups_referrer ON signups(referrer_id);
CREATE INDEX idx_rooms_city_active ON rooms(city, is_active);
CREATE INDEX idx_rooms_squad ON rooms(squad_id);
```

### `.env.example`
```bash
# Public — exposed to the browser. Safe to commit example values.
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY

# Server-only — bypasses RLS. NEVER commit, NEVER prefix with NEXT_PUBLIC_.
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

### `middleware.ts`
```ts
// Source: vercel.com/docs/functions/functions-api-reference/vercel-functions-package
import { geolocation } from '@vercel/functions';
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { city, country } = geolocation(request);
  const response = NextResponse.next();
  response.headers.set('x-geo-city', city ?? '');
  response.headers.set('x-geo-country', country ?? '');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Placeholder `app/page.tsx`
```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="text-2xl font-bold">YogaParty — coming soon 🧘</h1>
    </main>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 | Old package deprecated; never install it |
| `request.geo.city` | `geolocation(request).city` from `@vercel/functions` | Next.js 15 (2024, PR #68379) | All `req.geo` tutorials are stale |
| Sync `cookies()` / `headers()` | `await cookies()` / `await headers()` | Next.js 15 | Forgetting `await` breaks server actions |
| Tailwind v3 `tailwind.config.js` | Tailwind v4 CSS-first via `@theme` | Tailwind 4.0 (2025) | No JS config file needed |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs` — replaced by `@supabase/ssr`.
- `req.geo` / `req.ip` — replaced by `@vercel/functions`.
- `next/server` `NextRequest.ip` — same.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `npm install` on April 27, 2026 returns compatible versions of `next`, `@supabase/ssr`, `@supabase/supabase-js`, `@vercel/functions` without manual pinning | Standard Stack | Low — all are stable packages; if a peer dep break exists, `npm install` will surface it in 30s. |
| A2 | Tailwind v4 scaffold from `create-next-app@latest` ships CSS-first config without `tailwind.config.ts` | Project Structure | Low — affects file inventory only, not behavior. |
| A3 | Next.js 15 Edge runtime middleware on Vercel free tier supports `@vercel/functions` `geolocation()` without quota issues | Topic 3 | Very low — this is the documented use case. |

**If this table is non-empty:** None of these warrant pre-execution user confirmation; resolve by running the actual scaffold.

## Open Questions

None. All five research topics resolved with HIGH confidence. The few uncertainties (exact package versions, Tailwind v4 config file presence) resolve themselves the moment `npm install` runs.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All Next.js work | Assumed ✓ on solo dev's machine | ≥ 20 (Next.js 15 requires) | — |
| npm | Package install | Assumed ✓ | Bundled with Node | — |
| git | Vercel auto-deploy | Assumed ✓ | Any | — |
| Supabase account | Database hosting | Must be created in Phase 1 task 1 | — | — |
| Vercel account | Hosting | Must be created / linked in Phase 1 | — | — |
| GitHub account + repo | Git push trigger | Must be created in Phase 1 | — | — |

**Missing dependencies with no fallback:** None — all are free-tier signups the developer must complete as the first three tasks of Phase 1.

**Missing dependencies with fallback:** None.

## Sources

### Primary (HIGH confidence)
- [Supabase: Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) — `@supabase/ssr` patterns, cookie handling
- [Supabase: Creating a Supabase client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client) — `createBrowserClient` / `createServerClient`
- [Supabase: Postgres Changes (Realtime)](https://supabase.com/docs/guides/realtime/postgres-changes) — publication setup
- [Supabase: Getting Started with Realtime](https://supabase.com/docs/guides/realtime/getting_started) — channels, broadcast, presence
- [Supabase: Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) — SQL editor vs CLI tradeoffs
- [Vercel: @vercel/functions API Reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) — `geolocation()` helper
- [Vercel: Edge Middleware API Reference](https://vercel.com/docs/functions/edge-middleware/middleware-api) — middleware request lifecycle
- [Next.js PR #68379: Remove `geo` and `ip` from NextRequest](https://github.com/vercel/next.js/pull/68379) — breaking change record

### Secondary (MEDIUM confidence)
- [Vercel: Geolocation in Edge Middleware template](https://vercel.com/templates/next.js/edge-functions-geolocation) — working example
- [Next.js Discussion #81445: cookies() should be awaited](https://github.com/vercel/next.js/discussions/81445) — Next.js 15 async cookies gotcha
- [Next.js Discussion #69699: req.geo confusing](https://github.com/vercel/next.js/discussions/69699) — geo migration context

### Tertiary (LOW confidence)
- None used for prescriptive claims.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages are official, widely deployed, locked by CONTEXT.md.
- Architecture: HIGH — patterns come directly from Supabase and Vercel official docs.
- Pitfalls: HIGH — five pitfalls verified against current docs and active GitHub issues/PRs.

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (Vercel/Supabase APIs are stable; Next.js 15 is current minor)
