# REQUIREMENTS: YogaParty

All requirements are **v1** — there is no v2 in a 48-hour hackathon. The "fallback if behind" cut line is P0–P3 (REQ-INFRA, REQ-LANDING, REQ-SIGNUP, REQ-CITY-ROOM, REQ-ROOM-SYNC, REQ-CHAT, REQ-PRESENCE, REQ-WHATSAPP-SHARE, REQ-REFERRAL, REQ-CONTENT-LIST). Phases 5–7 are multipliers.

Each requirement has acceptance criteria written as observable behaviors. Source: `.planning/intel/requirements.md` plus an explicitly-added INFRA requirement to cover P0 scaffolding work the SPEC implies but did not name.

---

## Category: Infrastructure

### REQ-INFRA — Deployable scaffold
- **Description:** A Next.js 15 app wired to Supabase and deployed on Vercel via `git push`, ready to host all subsequent features.
- **Acceptance:**
  - Next.js 15 App Router project exists with Tailwind CSS configured
  - Supabase project provisioned with the four tables from PROJECT.md schema applied via migration/SQL
  - Supabase URL + anon key wired through environment variables on Vercel
  - `git push` to main triggers a successful Vercel production deploy
  - A reachable production URL serves a placeholder homepage
- **Source:** SPEC build priority P0, decisions D-001/D-002/D-003

---

## Category: Landing & Signup

### REQ-LANDING — Public landing page
- **Description:** Mobile-first landing page that converts cold visitors into the signup flow. Brand-neutral and content-agnostic — do not mention "yoga" or "Habuild" on the landing (revised 2026-04-27 to broaden top-of-funnel reach).
- **Acceptance:**
  - Hero copy "Watch together with people near you"
  - Single CTA "Join a Watch Party" routes to `/signup`
  - Visitor sees social proof line "X people from {city} watching" using their detected city
  - Top-5 cities preview rendered from `signups` aggregate
  - Bundle < 100KB; loads < 2s on 4G mobile
- **Source:** REQ-landing-page

### REQ-SIGNUP — Three-field signup
- **Description:** Single-screen signup capturing the hackathon-deliverable lead.
- **Acceptance:**
  - Form fields: Name, Phone, Country Code dropdown (default `+91`, all codes available)
  - Detected city pre-filled (read server-side from Vercel Edge `x-geo-city` header). City is **server-authoritative for hackathon scope** — not user-editable. (Revised 2026-04-27: editability dropped per Phase 2 deviation to save build time and prevent leaderboard-gaming.)
  - `?ref={userId}` from landing applied as `signups.referrer_id` if present in localStorage
  - No OTP, no password, no email field
  - Phone uniqueness enforced; duplicate-phone signups surface a friendly error
  - On success the user is redirected to their city's `/room/[id]`
- **Source:** REQ-signup

### REQ-LIVE-COUNTER — Animated signup counter on landing
- **Description:** Real-time signup counter on `/` showing total + India/International split.
- **Acceptance:**
  - Total signup count visible on first paint
  - India (`+91`) vs International split visible
  - Counter updates in real time when new signups occur (Supabase Realtime or polling fallback within 30s)
- **Source:** REQ-live-counter

### REQ-INTERNATIONAL — International lead capture
- **Description:** Capture international leads, which score 3× Indian leads.
- **Acceptance:**
  - Country-code dropdown contains common international codes alongside `+91`
  - City detection works for non-IN visitors via Vercel Edge `request.geo`
  - International signups land in their detected city's room (not forced into an India room)
- **Source:** REQ-international-strategy

---

## Category: Watch Room (City)

### REQ-CITY-ROOM — Public city watch room
- **Description:** One auto-created public room per detected city; users land here after signup.
- **Acceptance:**
  - One `rooms` row per active city, `type = 'city'`
  - Page renders synced YouTube player, chat, presence list
  - Header shows "{N} people from {city} watching right now"
  - "Invite Friends on WhatsApp" CTA always visible
- **Source:** REQ-city-room

### REQ-ROOM-SYNC — Synchronized YouTube playback
- **Description:** All participants see the same playback state, controlled by the host.
- **Acceptance:**
  - First joiner of a room becomes host; host transfers when host leaves
  - Only host UI exposes play / pause / seek controls
  - Host broadcasts `sync_play | sync_pause | sync_seek` with `{ timestamp }`
  - Non-host clients seek to host timestamp on receipt
  - Clients send `heartbeat { currentTime }` every 5s
  - Host detects drift > 2s and sends `sync_correct` to that client only
- **Source:** REQ-room-sync, C-006/C-008

### REQ-CHAT — In-room text chat
- **Description:** Text chat broadcast to everyone in the room.
- **Acceptance:**
  - `chat` event broadcast with `{ user, text, timestamp }`
  - Mobile: bottom-sheet UI; Desktop: sidebar UI
  - Messages render in chronological order with sender name
- **Source:** REQ-chat

### REQ-PRESENCE — Live presence per room
- **Description:** Each room shows who is currently watching.
- **Acceptance:**
  - Channel `track({ user_id, name, city })` on join, untrack on leave
  - Live participant count visible in the room header
  - Participant list visible (at minimum: name + city)
- **Source:** REQ-presence

### REQ-CONTENT-LIST — Curated Habuild video list
- **Description:** Host picks a video from a pre-curated list of Habuild YouTube content.
- **Acceptance:**
  - Host UI exposes a list of pre-loaded Habuild video IDs
  - Selecting a video sets `rooms.youtube_video_id` and broadcasts state to the room
  - No free-form URL input is exposed in the UI
- **Source:** REQ-content-list

---

## Category: Virality

### REQ-WHATSAPP-SHARE — WhatsApp-native share entry points
- **Description:** Every share action opens WhatsApp via `wa.me` with prewritten Hinglish copy.
- **Acceptance:**
  - All share links use `https://wa.me/?text={encodedMessage}`
  - Triggers wired: post-signup, in-room invite, city-competition prompt, post-session
  - City/general shares append `?ref={userId}`; squad invites use `/join/{inviteCode}`
  - Hinglish copy variants per trigger match the SPEC (see context.md "Viral copy")
- **Source:** REQ-whatsapp-share

### REQ-REFERRAL — Referral attribution
- **Description:** Track who referred whom so we can rank referrers and credit them.
- **Acceptance:**
  - `?ref={userId}` on landing captured into localStorage
  - Value survives navigation across pages until signup
  - On signup submit, value is written to `signups.referrer_id`
  - Self-referral (own id) is ignored
- **Source:** REQ-referral-attribution, C-010

---

## Category: Competition

### REQ-LEADERBOARD — City + referrer leaderboard page
- **Description:** Public `/leaderboard` showing city rankings and top referrers.
- **Acceptance:**
  - Cities ranked by signup count (DESC)
  - Top 20 referrers ranked by referral count (DESC)
  - Auto-refresh every 30 seconds
  - Per-row "Share city" button that opens WhatsApp with the city-competition Hinglish copy
- **Source:** REQ-leaderboard

---

## Category: Squads

### REQ-SQUAD-ROOM — Private squad watch room
- **Description:** A user creates a named squad with a WhatsApp invite link; the squad gets its own private room.
- **Acceptance:**
  - User can create a squad from `/squad`, providing a name → row in `squads` with unique `invite_code`
  - WhatsApp invite link uses `/join/{inviteCode}`
  - Joining via the link adds a `squad_members` row and lands the joiner in the squad's private `rooms` row (`type = 'squad'`)
  - Persistent "squad incomplete" banner shown until member count ≥ 3
  - Squad room shows member list with status (joined / not joined yet for invitees if surfaced)
- **Source:** REQ-squad-room

---

## Category: Polish

### REQ-REACTIONS — Emoji reactions
- **Description:** Users send floating emoji reactions to everyone in the room.
- **Acceptance:**
  - `reaction` event broadcast with `{ user, emoji }`
  - Reactions render visibly on every client in the room (e.g., floating animation)
  - At least 4 distinct emoji available
- **Source:** REQ-reactions

### REQ-POLISH-MOBILE — Mobile-first polish & share prompts everywhere
- **Description:** Final-pass polish to lift conversion and share rate inside the time budget.
- **Acceptance:**
  - All viral-moment screens (post-signup, in-room, leaderboard, post-session) display a WhatsApp share prompt
  - Mobile layout verified at 360px width across `/`, `/signup`, `/room/[id]`, `/squad`, `/leaderboard`, `/join/[code]`
  - Tap targets ≥ 44px; primary CTAs reachable without horizontal scroll
- **Source:** SPEC build priority P6

---

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| REQ-INFRA | Phase 1 | Pending |
| REQ-LANDING | Phase 2 | Pending |
| REQ-SIGNUP | Phase 2 | Pending |
| REQ-INTERNATIONAL | Phase 2 | Pending |
| REQ-CITY-ROOM | Phase 3 | Pending |
| REQ-ROOM-SYNC | Phase 3 | Pending |
| REQ-CHAT | Phase 3 | Pending |
| REQ-PRESENCE | Phase 3 | Pending |
| REQ-CONTENT-LIST | Phase 3 | Pending |
| REQ-WHATSAPP-SHARE | Phase 4 | Pending |
| REQ-REFERRAL | Phase 4 | Pending |
| REQ-LEADERBOARD | Phase 5 | Pending |
| REQ-LIVE-COUNTER | Phase 5 | Pending |
| REQ-SQUAD-ROOM | Phase 6 | Pending |
| REQ-REACTIONS | Phase 7 | Pending |
| REQ-POLISH-MOBILE | Phase 7 | Pending |

**Coverage:** 16 / 16 v1 requirements mapped to exactly one phase. No orphans, no duplicates.

> Note on REQ-LIVE-COUNTER placement: the live counter is a landing-page element (Phase 2 page), but it depends on having signup volume + a real-time aggregate, and ships alongside the leaderboard as part of the "competition engine" (P4). Implementing it in Phase 5 keeps Phase 2 ship-light (a static counter or zero-state placeholder is sufficient until Phase 5 wires the realtime aggregate). This matches the SPEC's P1 vs P4 split.
