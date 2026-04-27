# YogaParty — Watch Habuild Yoga Together With People Near You

## One-Liner

A watch-party platform where you sign up, join your city's room, and watch Habuild yoga sessions together with people nearby — driving signups through squad invites, city competition, and the core mechanic: watching alone is boring.

## Context

**Hackathon:** Habuild "Kuch Karke Dikha" — 48-hour lead-gen competition
**Goal:** Maximize real signups (name + phone + country code) for Habuild's June challenge
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
│   ├── /signup        3-field signup              │
│   ├── /squad         Create squad, invite friends │
│   ├── /room/[id]     Watch party room            │
│   ├── /leaderboard   City + referrer rankings    │
│   └── Server Actions  signup, referral, squad    │
│                                                  │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│            Supabase (Free Tier)                  │
│                                                  │
│   Database     signups, squads, referrals, rooms │
│   Realtime     Room channels (sync, chat,        │
│                presence)                         │
│                                                  │
│   Free limits: 50K MAU, 500 concurrent Realtime  │
│                500MB DB, 1GB storage             │
└─────────────────────────────────────────────────┘
```

No separate backend server. No Redis. No OTP. Single `git push` deployment.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR, server actions, Vercel-native |
| UI | Tailwind CSS + shadcn/ui | Fast to build, polished look |
| Database | Supabase Postgres | Free, SQL leaderboards, relations |
| Realtime | Supabase Realtime | Room channels, presence, broadcast |
| Video | react-youtube | YouTube IFrame API wrapper |
| Deployment | Vercel | Free, instant, git-push deploys |
| Domain | Vercel subdomain | yogaparty.vercel.app |
| IP geolocation | Vercel Edge request.geo | Auto-detect city, free |

## User Journey

### Step 1: Discover
User receives a WhatsApp message from a friend:
"Ek yoga watch party chal rahi hai, aaja mere saath → link"

Or sees the landing page shared with a city stat:
"128 people in Mumbai watching yoga right now — join them"

### Step 2: Landing Page
- Hero: "Watch yoga together with people near you"
- Live signup counter (animated, real-time)
- City leaderboard preview (top 5 cities)
- Social proof: "X people from {visitor's city} watching"
- One CTA: [Join a Watch Party]
- Mobile-first, loads in < 2 seconds

### Step 3: Signup (3 fields, one screen, no OTP)
- Name
- Phone number
- Country code (dropdown, default +91)
- Auto-detect city from IP via Vercel Edge `request.geo`
- Referral attribution from `?ref=` URL param

### Step 4: City Room
After signup, user lands in their city's watch room:
- Synced YouTube player — Habuild yoga session playing
- Chat with everyone in their city's room
- Presence: "23 people from Mumbai watching right now"
- [Invite Friends on WhatsApp] button — always visible

**VIRAL MOMENT #1:** "23 people from Mumbai watching — invite your friends!"

### Step 5: Squad (optional, second viral loop)
- "Create a private watch party with friends"
- Name your squad → Get WhatsApp invite link
- Friends sign up → join your squad's private room
- Persistent "squad incomplete" banner until 3 members

**VIRAL MOMENT #2:** "Meri squad mein 2 jagah bachi hai → link"

### Step 6: City Leaderboard
- Live leaderboard: "Delhi: 234 | Mumbai: 201 | Bangalore: 156"
- Updated in real-time as people sign up
- Share button: city pride drives ongoing recruitment

**VIRAL MOMENT #3:** "Mumbai peechhe hai, signup kar → link"

### Step 7: Room Sharing
- After watching, share that you just did yoga with X people
- "Just watched yoga with 23 people from Mumbai → link"

**VIRAL MOMENT #4:** Post-session social proof

## Data Model (Supabase Postgres)

```sql
-- Core signup table (the hackathon deliverable)
CREATE TABLE signups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  country_code TEXT NOT NULL DEFAULT '+91',
  city TEXT,
  referrer_id UUID REFERENCES signups(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Squads (private watch parties for friend groups)
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

-- Rooms (city rooms are auto-created, squad rooms are user-created)
CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'city', -- 'city' or 'squad'
  city TEXT,                          -- for city rooms
  squad_id UUID REFERENCES squads(id), -- for squad rooms
  youtube_video_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Key Queries

```sql
-- City leaderboard
SELECT city, COUNT(*) AS members
FROM signups
WHERE city IS NOT NULL
GROUP BY city
ORDER BY members DESC;

-- Top referrers
SELECT s.name, s.city, COUNT(r.id) AS referral_count
FROM signups s
JOIN signups r ON r.referrer_id = s.id
GROUP BY s.id, s.name, s.city
ORDER BY referral_count DESC
LIMIT 20;

-- Live counter
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE country_code = '+91') AS india,
       COUNT(*) FILTER (WHERE country_code != '+91') AS international
FROM signups;

-- People in your city
SELECT COUNT(*) FROM signups WHERE city = $1;
```

## Watch Room — Realtime Sync

Supabase Realtime Channels handle all real-time communication.

### Room Types

1. **City rooms** — One per city, auto-created. Anyone from that city joins automatically after signup. Open, public, larger groups.
2. **Squad rooms** — Private, created by a user. Friends join via invite link. Small groups (3-6 people).

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
| `chat` | Any → All | `{ user, text, timestamp }` | Chat message |
| `reaction` | Any → All | `{ user, emoji }` | Emoji reaction |

### Presence
Supabase Realtime Presence tracks who's in each room:
```typescript
channel.track({ user_id, name, city })
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

### Habuild Content
Pre-loaded list of Habuild YouTube video URLs. Host selects from this list — not a free-form URL input. This keeps the rooms focused on Habuild content and avoids moderation issues.

## WhatsApp Sharing (Viral Engine)

Every share point uses the native WhatsApp share URL:
```
https://wa.me/?text={encodedMessage}
```

### Share Triggers

1. **Post-signup (immediate):**
   ```
   Main abhi Habuild yoga dekh raha hun 23 logon ke saath!
   Tu bhi aaja → yogaparty.vercel.app?ref={userId}
   ```

2. **Squad invite:**
   ```
   Mere saath yoga dekh, squad mein jagah hai
   → yogaparty.vercel.app/join/{inviteCode}
   ```

3. **City competition:**
   ```
   Mumbai peechhe hai leaderboard pe 😤
   Signup kar apni city ke liye → yogaparty.vercel.app?ref={userId}
   ```

4. **Post-session:**
   ```
   Abhi 23 logon ke saath yoga kiya Mumbai se 🧘
   Tu bhi try kar → yogaparty.vercel.app?ref={userId}
   ```

### Referral Attribution
Every link carries `?ref={userId}` or `/join/{inviteCode}`.
- `ref` param stored in localStorage on landing
- Applied at signup time → `referrer_id` in signups table
- Powers referral leaderboard

## International Lead Strategy (3x Points)

1. **NRI diaspora:** Share in Facebook groups ("Indians in {City}") and WhatsApp groups of Indians abroad. The watch-together concept appeals to NRIs who miss community yoga.
2. **Global yoga communities:** Reddit r/yoga (2M+ members), r/meditation, Facebook yoga groups.
3. **Country code auto-detection:** Default +91 in dropdown, but international codes available. City detection works globally via Vercel Edge.

## Pages

### / (Landing)
- Hero: "Watch yoga together with people near you"
- Live signup counter (animated)
- City leaderboard preview (top 5)
- Social proof: "X people from {visitor's city} watching"
- One CTA: [Join a Watch Party]
- Mobile-first, < 100KB, loads in < 2 seconds

### /signup
- 3 fields: Name, Phone, Country code dropdown
- City auto-detected (shown but editable)
- Referral attribution applied from URL param
- Submit → redirect to city room

### /room/[id]
- Synced YouTube player (host controls)
- Chat panel (bottom sheet on mobile, sidebar on desktop)
- Participant list with count
- "Invite Friends" WhatsApp button (always visible, prominent)
- Emoji reaction bar

### /squad
- "Create a Private Watch Party"
- Name your squad
- Invite link generator (WhatsApp share button)
- Member list with status
- "Start Watching" → creates squad room

### /leaderboard
- Cities ranked by total signups
- Top referrers ranked by referral count
- Auto-refresh every 30 seconds
- Share button per city row

## Deliberate Exclusions

- No personality quiz or archetypes (unnecessary complexity)
- No phone OTP verification (friction kills conversion; collect raw phone numbers)
- No WebRTC voice/video (chat is sufficient)
- No video queue (host selects one video from Habuild list)
- No user accounts/passwords (signup = just name + phone)
- No admin panel (use Supabase dashboard)
- No i18n system (Hinglish copy hardcoded)
- No typing indicators, @mentions, screen share

## Build Priority (Layered, Always Shippable)

| Priority | Layer | Hours | Cumulative | Shippable? |
|---|---|---|---|---|
| P0 | Next.js scaffold + Supabase setup + Vercel deploy | 2h | 2h | Deploys |
| P1 | Landing page + signup form + city detection | 3-4h | 6h | Collects signups |
| P2 | Watch room (synced YouTube + chat + presence) | 6-8h | 14h | Core product works |
| P3 | WhatsApp invite + referral tracking | 3-4h | 18h | Primary viral loop |
| P4 | City leaderboard + live signup counter | 3-4h | 22h | Competition engine |
| P5 | Squad creation (private rooms for friends) | 3-4h | 26h | Second viral loop |
| P6 | Polish: reactions, mobile UX, share prompts everywhere | 2-3h | 29h | Delight |

**P0-P4 = ~22h = working watch party + viral sharing + city competition.**

After P2 (~14h), the product is functional. After P4 (~22h), the viral engine is complete. P5-P6 are multipliers.

**Fallback if behind:** Ship P0-P3 as "watch together + invite friends." Still a complete product.

## Success Metrics

| Metric | Target |
|---|---|
| Landing-to-signup conversion | > 40% |
| Signups who invite at least 1 friend | > 30% |
| Average referrals per user | > 1.5 |
| Viral coefficient (K-factor) | > 1.0 |
| Share rate (any share action) | > 40% of signups |
