# PROJECT: YogaParty

## Core Value

A watch-party platform where you sign up, join your city's room, and watch Habuild yoga sessions together with people nearby. The product turns a solo activity into a shared one and uses squad invites + city competition to drive WhatsApp-native virality. Every visitor is a potential lead; every signup is a node in a referral graph.

## Success Metric

**Total signups captured** — `name + phone + country code` rows in `signups`.

Hackathon scoring weighting (informs trade-offs, not the primary metric):
- 60% virality
- 20% creativity
- 10% novelty
- 10% user insight

Lead value: Indian (`+91`) = 1 pt, International = 3 pts. International capture is treated as a force-multiplier, not a separate metric.

Target funnel (from SPEC, used as guardrails when sequencing work):
- Landing-to-signup conversion > 40%
- Signups who invite ≥ 1 friend > 30%
- Avg referrals per user > 1.5
- K-factor > 1.0
- Share rate > 40% of signups

## Project Context

- **Event:** Habuild "Kuch Karke Dikha" 48-hour hackathon, Mon Apr 27 09:00 → Tue Apr 28 21:00, 2026.
- **Team:** Solo full-stack developer. Implementer is Claude Code CLI.
- **Audience:** No existing audience at start. Cold growth via WhatsApp shares from each signup.
- **Downstream:** Captured leads feed Habuild's June fitness challenge.
- **Build philosophy:** Layered priority P0–P6, always-shippable cumulative milestones. Fallback: ship P0–P3 (watch together + invite friends) if behind schedule.

## Locked Decisions

These are stack/scope choices treated as **locked** for the duration of the hackathon. Hours are scarce; revisiting them costs more than they save.

### Stack & Hosting

- **D-001 — Next.js 15 App Router** as the application framework. SSR + Server Actions + Vercel-native.
- **D-002 — Supabase (Postgres + Realtime)** as the only backend. Free tier covers 50K MAU + 500 concurrent realtime connections + 500MB DB. SQL powers leaderboards; channels power sync/chat/presence. No separate backend server, no Redis.
- **D-003 — Vercel free tier** with single `git push` deploy. No staging environment.
- **D-007 — YouTube IFrame API via `react-youtube`** is the video layer. Habuild content is already on YouTube; no hosting/streaming costs.
- **Tailwind CSS** for styling.

### Identity & Signup

- **D-004 — No phone OTP** at signup. Friction kills conversion and the hackathon rewards raw signups.
- **D-005 — No user accounts / no passwords.** Identity = the signup row.
- **D-006 — City auto-detected from Vercel Edge `request.geo`** (editable before submit). No typing required.
- **C-018 — Phone is `UNIQUE NOT NULL`.** One phone = one signup.

### Realtime & Rooms

- **D-008 — First joiner is host.** Host transfers to next person on leave. Only host can play/pause/seek.
- **D-009 — Sync algorithm:** host broadcasts `sync_play | sync_pause | sync_seek`; clients send `heartbeat { currentTime }` every 5s; host sends `sync_correct` to a single client when drift > 2s.
- **D-010 — Pre-curated Habuild video list.** Host picks from list; no free-form URL input.
- **D-013 — Two room types:** public `city` rooms (auto-created) and private `squad` rooms (user-created).

### Virality

- **D-011 — WhatsApp is the only sharing channel.** Native `https://wa.me/?text={encoded}` URLs. No share APIs, no SMS, no email.
- **D-012 — Referral attribution via `?ref={userId}`** captured on landing, persisted in `localStorage`, applied at signup as `signups.referrer_id`.

### Out of Scope (Locked Exclusions)

- **D-014 — No admin panel.** Use the Supabase dashboard for ops.
- **D-015 — No i18n framework.** Hinglish copy hardcoded.
- No personality quiz / archetypes.
- No WebRTC voice/video. Chat is sufficient.
- No video queue. Host picks one video.
- No typing indicators, no @mentions, no screen share.

## Constraints

### Free-tier envelope (C-013)

- Supabase: ≤ 50K MAU, ≤ 500 concurrent Realtime connections, ≤ 500MB DB, ≤ 1GB storage.
- Vercel free tier for hosting and Edge functions.
- All work must fit inside these limits without paid plans.

### Performance (C-012)

- Landing bundle target < 100KB.
- Mobile-first.
- Load time < 2 seconds on 4G.

### Time budget (C-015)

- 48-hour build window. Solo developer.
- Cumulative milestones: P0 ≈ 2h, P2 ≈ 14h, P4 ≈ 22h, P6 ≈ 29h.
- After P2 the product is functional. After P4 the viral engine is complete. P5–P6 are multipliers.

### Deployment (C-014)

- Single `git push` triggers a Vercel deploy. No separate backend server, Redis, or OTP service to operate.

## Reference Schema (Locked)

```sql
-- Source of truth: .planning/intel/constraints.md (C-001..C-004)

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
  type TEXT NOT NULL DEFAULT 'city', -- 'city' or 'squad'
  city TEXT,
  squad_id UUID REFERENCES squads(id),
  youtube_video_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Realtime Protocol (Locked)

- Channel name per room: `room:{roomId}` (C-005).
- Presence payload: `channel.track({ user_id, name, city })` (C-007).
- Events (C-006):
  - `sync_play | sync_pause | sync_seek` — Host → All — `{ timestamp }`
  - `heartbeat` — Client → Host — `{ currentTime }` every 5s
  - `sync_correct` — Host → Client — `{ timestamp }` when drift > 2s (C-008)
  - `chat` — Any → All — `{ user, text, timestamp }`
  - `reaction` — Any → All — `{ user, emoji }`

## Pages Inventory

- `/` Landing (live counter, top-5 cities, social proof, CTA)
- `/signup` 3-field signup
- `/room/[id]` Watch room (YouTube + chat + presence + invite + reactions)
- `/squad` Create private watch party
- `/join/[inviteCode]` Squad invite landing
- `/leaderboard` City + referrer rankings

## Sources

- SPEC: `docs/superpowers/specs/2026-04-24-yogaparty-design.md`
- Intel: `.planning/intel/SYNTHESIS.md`, `decisions.md`, `requirements.md`, `constraints.md`, `context.md`
