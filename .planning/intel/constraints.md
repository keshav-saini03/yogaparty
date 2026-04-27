# Constraints

Technical contracts, schemas, protocols, and non-functional requirements extracted from SPEC documents. Each entry retains its source.

---

## C-001: Database schema — `signups`
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: schema
- content:
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
```

## C-002: Database schema — `squads`
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: schema
- content:
```sql
CREATE TABLE squads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id UUID REFERENCES signups(id) NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## C-003: Database schema — `squad_members`
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: schema
- content:
```sql
CREATE TABLE squad_members (
  squad_id UUID REFERENCES squads(id) NOT NULL,
  signup_id UUID REFERENCES signups(id) NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (squad_id, signup_id)
);
```

## C-004: Database schema — `rooms`
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: schema
- content:
```sql
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

## C-005: Realtime channel naming
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: protocol
- content: Each room uses a Supabase Realtime channel named `room:{roomId}`.

## C-006: Realtime event protocol
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: protocol
- content:
```
sync_play     Host → All     { timestamp }                Play video at position
sync_pause    Host → All     { timestamp }                Pause video at position
sync_seek     Host → All     { timestamp }                Seek to position
heartbeat     Client → Host  { currentTime }              Drift detection (every 5s)
sync_correct  Host → Client  { timestamp }                Fix drifted client
chat          Any → All      { user, text, timestamp }    Chat message
reaction      Any → All      { user, emoji }              Emoji reaction
```

## C-007: Presence payload
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: protocol
- content: `channel.track({ user_id, name, city })`

## C-008: Sync drift threshold
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: protocol
- content: Heartbeat cadence = 5 seconds. Drift > 2 seconds → host sends `sync_correct` to the drifted client only.

## C-009: WhatsApp share URL contract
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: api-contract
- content: All share entry points must use `https://wa.me/?text={encodedMessage}`. Squad invites must include `/join/{inviteCode}`. Other shares must include `?ref={userId}`.

## C-010: Referral capture
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: protocol
- content: `?ref={userId}` is captured on landing, persisted in localStorage, and applied at signup-time as `signups.referrer_id`.

## C-011: Geolocation source
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: api-contract
- content: City auto-detection uses Vercel Edge `request.geo`. The detected city is editable by the user before submit.

## C-012: NFR — Landing performance
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: nfr
- content: Landing bundle target < 100KB; mobile-first; load time < 2 seconds.

## C-013: NFR — Free-tier capacity envelope
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: nfr
- content: Must operate within Supabase free tier — 50K MAU, 500 concurrent Realtime connections, 500MB DB, 1GB storage. Vercel free tier for hosting.

## C-014: NFR — Single-deployment workflow
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: nfr
- content: Single `git push` deploys the app via Vercel. No separate backend server, no Redis, no OTP service.

## C-015: NFR — Hackathon time budget
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: nfr
- content: 48-hour build window (Mon Apr 27 9AM – Tue Apr 28 9PM); solo full-stack developer; layered priority P0–P6 with always-shippable cumulative milestones (P0 2h, P4 ~22h, P6 ~29h).

## C-016: NFR — Lead scoring
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: nfr
- content: Hackathon scoring weights — 60% virality, 20% creativity, 10% novelty, 10% user insight. Indian lead = 1 pt, International lead = 3 pts.

## C-017: Success metrics targets
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: nfr
- content:
```
Landing-to-signup conversion       > 40%
Signups who invite at least 1 friend > 30%
Average referrals per user         > 1.5
Viral coefficient (K-factor)       > 1.0
Share rate (any share action)      > 40% of signups
```

## C-018: Phone uniqueness
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: schema
- content: `signups.phone` is `UNIQUE NOT NULL`. One phone = one signup row.

## C-019: Key SQL queries (reference)
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- type: api-contract
- content:
```sql
-- City leaderboard
SELECT city, COUNT(*) AS members
FROM signups WHERE city IS NOT NULL
GROUP BY city ORDER BY members DESC;

-- Top referrers
SELECT s.name, s.city, COUNT(r.id) AS referral_count
FROM signups s
JOIN signups r ON r.referrer_id = s.id
GROUP BY s.id, s.name, s.city
ORDER BY referral_count DESC LIMIT 20;

-- Live counter (total / India / International)
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE country_code = '+91') AS india,
       COUNT(*) FILTER (WHERE country_code != '+91') AS international
FROM signups;

-- People in your city
SELECT COUNT(*) FROM signups WHERE city = $1;
```
