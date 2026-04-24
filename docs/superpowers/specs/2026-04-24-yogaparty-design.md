# YogaParty — Social Yoga Watch Parties for Habuild

## One-Liner

A viral watch-party platform where users take a yoga personality quiz, form squads, and watch Habuild yoga sessions together — driving signups through the product's core mechanic: you can't watch alone.

## Context

**Hackathon:** Habuild "Kuch Karke Dikha" — 48-hour lead-gen competition
**Goal:** Maximize real signups (name + verified phone + country code) for Habuild's June challenge
**Scoring:** 60% virality, 20% creativity, 10% novelty, 10% user insight
**Constraints:** Solo full-stack dev, no existing audience, 48-hour build window (Mon Apr 27 9AM – Tue Apr 28 9PM)
**Points:** Indian lead = 1 pt, International lead = 3 pts

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Vercel (Free Tier)                  │
│                                                  │
│   Next.js 15 App Router                         │
│   ├── /              Landing + live counter      │
│   ├── /quiz          5-question personality quiz  │
│   ├── /signup        Phone OTP verification       │
│   ├── /squad         Create squad, invite friends │
│   ├── /room/[id]     Watch party room            │
│   ├── /leaderboard   City + squad rankings       │
│   └── /api/*         Server actions / API routes  │
│                                                  │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│            Supabase (Free Tier)                  │
│                                                  │
│   Auth         Phone OTP → verified number       │
│   Database     signups, squads, referrals, rooms │
│   Realtime     Room channels (sync, chat,        │
│                presence)                         │
│   Storage      Share card images (optional)      │
│                                                  │
│   Free limits: 50K MAU, 500 concurrent Realtime  │
│                500MB DB, 1GB storage             │
└─────────────────────────────────────────────────┘
```

No separate backend server. No Redis. Single `git push` deployment.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR, API routes, Vercel-native |
| UI | Tailwind CSS + shadcn/ui | Fast to build, polished look |
| Auth | Supabase Auth (Phone OTP) | Free, gives verified phone numbers |
| Database | Supabase Postgres | Free, SQL leaderboards, relations |
| Realtime | Supabase Realtime | Room channels, presence, broadcast |
| Video | react-youtube | YouTube IFrame API wrapper |
| Deployment | Vercel | Free, instant, git-push deploys |
| Domain | Vercel subdomain or custom | yogaparty.vercel.app initially |
| Share cards | @vercel/og | Dynamic OG image generation |
| IP geolocation | Vercel Edge request.geo | Auto-detect city, free |

## User Journey

### Step 1: Discover
User sees a WhatsApp forward, Instagram Reel, or direct link.
Hook: "What's your yoga personality? Take the 30-second quiz"

### Step 2: Quiz (no signup required)
5 fun questions, multiple choice, ~30 seconds total.

Questions:
1. "When do you feel most alive?" — Morning / Afternoon / Night
2. "Pick your vibe" — Calm & focused / Energetic / Social & chatty
3. "What's your fitness goal?" — Flexibility / Strength / Mental peace
4. "How do you prefer to workout?" — Alone / With a partner / In a group
5. "Pick a mantra" — "Consistency beats intensity" / "Go hard or go home" / "Peace is power"

Each answer maps to one of 4 archetypes with weighted scoring.

**VIRAL MOMENT #1:** Share result card on WhatsApp Status / Instagram Stories.

### Step 3: Signup (gated behind quiz result)
"Join the June challenge as a Morning Warrior"
- Phone OTP via Supabase Auth (verifies real phone number)
- Captures: name, phone (verified), country code (from phone number)
- Auto-detect city from IP via Vercel Edge `request.geo`

### Step 4: Form Squad
"Yoga is better together. Create your squad of 3."
- Name your squad
- Get WhatsApp invite link with referral attribution
- Squad shows as incomplete until 3 members join

**VIRAL MOMENT #2:** "I need 2 more for my squad!" — natural WhatsApp forward.

### Step 5: Watch Together
Squad watches Habuild YouTube sessions in a synced room.
- Synchronized YouTube playback (host controls play/pause/seek)
- Live chat alongside video
- Presence indicators ("Priya is watching")
- Emoji reactions on key moments

**VIRAL MOMENT #3:** Share a room moment or screenshot.

### Step 6: Compete
City leaderboard shows squads and members per city.
- Auto-detected city grouping
- Live counter of total signups
- "Mumbai: 142 squads | Delhi: 127 squads"

**VIRAL MOMENT #4:** "Mumbai is losing to Delhi! Join and help us win!"

### Step 7: Achieve
Completion cards for milestones.
- "I completed Day 1!" shareable image
- Squad completion badges
- Referral milestone cards (3, 5, 10 referrals)

**VIRAL MOMENT #5:** Post achievement card on WhatsApp Status.

## Archetypes

| Archetype | Emoji | Color | Vibe | Recommended Session |
|---|---|---|---|---|
| Morning Warrior | ⚔️ | Orange | Early riser, discipline-focused | 6:30 AM sessions |
| Zen Master | 🧘 | Purple | Calm, mindfulness-first | Evening wind-down |
| Social Yogi | 🤝 | Green | Community-driven, group energy | Group sessions |
| Night Owl | 🌙 | Blue | Evening practice, wind-down | 7 PM sessions |

## Data Model (Supabase Postgres)

```sql
-- Core signup table (the hackathon deliverable)
CREATE TABLE signups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  country_code TEXT NOT NULL,
  city TEXT,
  archetype TEXT NOT NULL,
  referrer_id UUID REFERENCES signups(id),
  supabase_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Squads
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

-- Watch rooms
CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  squad_id UUID REFERENCES squads(id),
  youtube_video_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Quiz results (for analytics and archetype distribution)
CREATE TABLE quiz_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  signup_id UUID REFERENCES signups(id),
  answers JSONB NOT NULL,
  archetype TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Key Queries

```sql
-- City leaderboard
SELECT city,
       COUNT(DISTINCT sm.squad_id) AS squads,
       COUNT(*) AS members
FROM signups s
JOIN squad_members sm ON sm.signup_id = s.id
GROUP BY city
ORDER BY members DESC;

-- Top referrers
SELECT s.name, s.city, COUNT(r.id) AS referral_count
FROM signups s
JOIN signups r ON r.referrer_id = s.id
GROUP BY s.id, s.name, s.city
ORDER BY referral_count DESC
LIMIT 20;

-- Total signup counter
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE country_code = '+91') AS india,
       COUNT(*) FILTER (WHERE country_code != '+91') AS international
FROM signups;
```

## Watch Room — Realtime Sync

Supabase Realtime Channels replace the Go WebSocket backend.

### Channel Structure
Each room gets a Supabase Realtime channel: `room:{roomId}`

### Events

| Event | Direction | Payload | Purpose |
|---|---|---|---|
| `sync_play` | Host → All | `{ timestamp }` | Play video at position |
| `sync_pause` | Host → All | `{ timestamp }` | Pause video at position |
| `sync_seek` | Host → All | `{ timestamp }` | Seek to position |
| `heartbeat` | Client → Host | `{ currentTime }` | Drift detection |
| `sync_correct` | Host → Client | `{ timestamp }` | Fix drifted client |
| `chat` | Any → All | `{ user, text }` | Chat message |
| `reaction` | Any → All | `{ user, emoji }` | Emoji reaction |

### Presence
Supabase Realtime Presence tracks who's in each room:
```typescript
channel.track({ user_id, name, archetype })
```

### Host Model
- First person to join room = host
- Only host can play/pause/seek
- Host transfers to next person if host leaves
- Host badge visible in UI

### Sync Model (adapted from Watch-Mate)
- Host sends `sync_play` with current timestamp on play
- Clients receive and seek to timestamp + play
- Every 5 seconds: clients send `heartbeat` with their `currentTime`
- If drift > 2 seconds: host sends `sync_correct` to drifted client only

## WhatsApp Sharing (Viral Engine)

Every share point uses the native WhatsApp share URL:
```
https://wa.me/?text={encodedMessage}
```

### Share Triggers

1. **Quiz result:**
   ```
   I'm a Morning Warrior! ⚔️🧘
   Take the yoga personality quiz → yogaparty.vercel.app/quiz?ref={userId}
   ```

2. **Squad invite:**
   ```
   Join my yoga squad "{squadName}"!
   We watch Habuild yoga sessions together 🧘‍♀️
   → yogaparty.vercel.app/join/{inviteCode}
   ```

3. **City competition:**
   ```
   {City} needs more yogis! We're #{rank} on the leaderboard.
   Join and represent {City} → yogaparty.vercel.app?ref={userId}
   ```

4. **Achievement:**
   ```
   I just completed Day 1 of the Habuild June Challenge! 🎉
   Join me → yogaparty.vercel.app/quiz?ref={userId}
   ```

### Referral Attribution
Every link carries `?ref={userId}` or `/join/{inviteCode}`.
- `ref` param stored in cookie/localStorage on landing
- Applied at signup time → `referrer_id` in signups table
- Powers referral leaderboard and milestone rewards

## International Lead Strategy (3x Points)

International leads are worth 3x — targeted via:

1. **NRI diaspora:** Share in Facebook groups ("Indians in {City}") and WhatsApp groups of Indians abroad
2. **Global yoga communities:** Reddit r/yoga (2M+ members), r/meditation, Facebook yoga groups
3. **The quiz itself:** "What's your yoga personality?" is universally appealing, not India-specific
4. **Country detection:** Supabase Auth phone OTP captures country code automatically from the phone number

## Pages

### / (Landing)
- Hero: "Watch yoga together. Find your tribe."
- Live signup counter (animated)
- "Take the Quiz" primary CTA
- City leaderboard preview (top 5)
- Social proof: "X people from {visitor's city} joined"
- Mobile-first, loads in < 2 seconds

### /quiz
- 5 questions, one per screen, swipe/tap to answer
- Progress bar at top
- No signup required (reduce friction)
- Result screen: archetype card + "Share" + "Join the Challenge" CTA

### /signup
- Name input
- Phone input with country code dropdown (default +91)
- OTP verification via Supabase Auth
- Referral attribution applied from URL param

### /squad
- "Create Squad" — name your squad
- Invite link generator (WhatsApp share button)
- Member list with status (joined / pending)
- "Start Watching" button (enabled when 2+ members)

### /room/[id]
- Synced YouTube player (host controls)
- Chat sidebar (or bottom sheet on mobile)
- Participant list with archetypes
- Emoji reaction bar
- "Invite More" button

### /leaderboard
- City tab: cities ranked by total members
- Squads tab: squads ranked by size
- Referrers tab: top referrers
- Auto-refresh every 30 seconds

## Risk: Supabase Phone OTP Limits

Supabase free tier allows ~30 OTP SMS per hour. If signups exceed this, the OTP flow will bottleneck.

**Mitigation options (pick at build time based on traction):**
1. **WhatsApp OTP instead of SMS** — Supabase supports custom phone providers. Route OTP via WhatsApp (free via WATI) instead of SMS.
2. **Upgrade to Supabase Pro** ($25/mo) — Removes SMS rate limits if traction warrants it.
3. **Fallback: manual phone entry without OTP** — Collect phone number without verification. Loses fraud protection but removes the bottleneck entirely. Only use if OTP limits are actually hit.

For hackathon purposes, option 3 is the pragmatic fallback — judges care about signup count, and we can note that OTP verification is available for production.

## Deliberate Exclusions

- No WebRTC voice/video (chat is sufficient, saves 8+ hours)
- No video queue (one video per session)
- No user accounts/passwords (phone OTP only)
- No admin panel (use Supabase dashboard)
- No paid ads integration
- No i18n system (Hinglish copy hardcoded in UI)
- No typing indicators, @mentions, screen share (MVP cuts)
- No playlist import (host pastes a single YouTube URL)

## Build Priority (Layered, Always Shippable)

| Priority | Layer | Hours | Cumulative | Shippable? |
|---|---|---|---|---|
| P0 | Next.js scaffold + Supabase setup + Vercel deploy | 2h | 2h | Deploys |
| P1 | Signup flow (phone OTP) + landing page | 3-4h | 6h | Collects signups |
| P2 | Quiz funnel + archetype result + share card | 4-5h | 11h | Quiz → signup funnel |
| P3 | Squad creation + WhatsApp invite links | 3-4h | 15h | Core virality works |
| P4 | Watch room (synced YouTube + chat + presence) | 6-8h | 23h | Full product |
| P5 | City leaderboard + live signup counter | 3-4h | 27h | Competition layer |
| P6 | Referral tracking + referral leaderboard | 2-3h | 30h | Power-user retention |
| P7 | Polish: reactions, achievement cards, mobile UX | 3-4h | 34h | Delight layer |

**Critical path:** P0 → P1 → P2 → P3 → P4. After P4 (~23h) the product is fully functional. P5-P7 multiply viral coefficient.

**Fallback if behind schedule:** Drop P4 (watch room), ship quiz + squad + leaderboard as a standalone viral signup tool. Still strong.

## Success Metrics

| Metric | Target |
|---|---|
| Quiz completion rate | > 70% |
| Quiz-to-signup conversion | > 30% |
| Signups who create/join a squad | > 50% |
| Average squad size | 3+ |
| Viral coefficient (K-factor) | > 1.0 |
| Share rate (any share action) | > 40% of signups |
