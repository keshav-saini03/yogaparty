# Requirements

This file aggregates product requirements extracted during ingest. No PRD documents were classified in this batch; the requirements below were lifted from the SPEC's user-journey, pages, and exclusions sections so downstream consumers can see them in requirement form.

Each requirement keeps a `source:` reference. IDs are derived from feature slugs.

---

## REQ-landing-page
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Public landing page that converts cold visitors into the signup flow
- acceptance:
  - Hero copy: "Watch yoga together with people near you"
  - Live, animated signup counter (real-time)
  - City leaderboard preview (top 5 cities)
  - Social proof line: "X people from {visitor's city} watching"
  - Single CTA: [Join a Watch Party]
  - Mobile-first; bundle < 100KB; loads in < 2 seconds
- scope: landing / acquisition

## REQ-signup
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Three-field signup that captures the hackathon-deliverable lead (name + phone + country code) on a single screen
- acceptance:
  - Fields: Name, Phone, Country Code (dropdown, default +91)
  - City auto-detected from IP, displayed as editable
  - Referral attribution applied from `?ref=` URL param
  - No OTP, no password, no email
  - Phone is unique
  - On submit: redirect to city room
- scope: signup / lead capture

## REQ-city-room
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Public watch room scoped to a city; user lands here automatically after signup
- acceptance:
  - One room per city, auto-created
  - Synced YouTube player (host-controlled)
  - Live chat with everyone in the room
  - Presence display: "{N} people from {city} watching right now"
  - Always-visible "Invite Friends on WhatsApp" CTA
  - Emoji reaction bar
- scope: realtime / watch experience

## REQ-squad-room
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Private watch room created by a user for friends
- acceptance:
  - User can name a squad and generate a WhatsApp invite link
  - Invite uses route `/join/{inviteCode}` with unique code
  - Members join via the link → land in the squad's private room
  - Persistent "squad incomplete" banner shown until ≥ 3 members
  - Member list with status visible
- scope: realtime / friend-loop

## REQ-room-sync
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Synchronized YouTube playback across all participants of a room
- acceptance:
  - Host broadcasts `sync_play`, `sync_pause`, `sync_seek` events with timestamp
  - Clients seek to host timestamp on receipt
  - Clients send `heartbeat { currentTime }` every 5 seconds
  - If host detects client drift > 2 seconds, host sends `sync_correct` to that client only
  - Only the host can play/pause/seek; first joiner is host; host transfers when host leaves
- scope: realtime / video sync

## REQ-chat
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Text chat inside every room
- acceptance:
  - `chat` event broadcast with `{ user, text, timestamp }`
  - Bottom sheet on mobile, sidebar on desktop
- scope: realtime / engagement

## REQ-reactions
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Emoji reactions broadcast to room
- acceptance:
  - `reaction` event with `{ user, emoji }` broadcast to all room members
- scope: realtime / engagement

## REQ-presence
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Live presence tracking per room
- acceptance:
  - Channel `track({ user_id, name, city })`
  - Participant list and live count visible in room UI
- scope: realtime / presence

## REQ-whatsapp-share
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: WhatsApp-native share entry points across the app
- acceptance:
  - All share links use `https://wa.me/?text={encodedMessage}`
  - Triggers: post-signup, squad invite, city-competition prompt, post-session
  - Each share carries `?ref={userId}` (or `/join/{inviteCode}` for squad invites)
  - Hinglish copy variants per trigger as defined in the SPEC
- scope: viral / sharing

## REQ-referral-attribution
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Track who referred whom for the referrer leaderboard
- acceptance:
  - `?ref={userId}` captured on landing and stored in localStorage
  - Applied at signup time → written to `signups.referrer_id`
  - Survives navigation across pages before signup
- scope: viral / attribution

## REQ-leaderboard
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Public leaderboard page showing city and referrer rankings
- acceptance:
  - Cities ranked by total signup count
  - Top 20 referrers ranked by referral count
  - Auto-refresh every 30 seconds
  - Share button per city row
- scope: leaderboard / competition

## REQ-live-counter
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Animated total signup counter on landing page
- acceptance:
  - Total signup count
  - Split visible: India (`+91`) vs International
  - Updates in real time as new signups occur
- scope: landing / social proof

## REQ-content-list
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Curated list of Habuild YouTube videos selectable by host
- acceptance:
  - Host picks from a pre-loaded Habuild video list
  - No free-form URL input allowed
- scope: content / moderation

## REQ-international-strategy
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- description: Capture international leads (3x scoring weight)
- acceptance:
  - Country code dropdown supports international codes
  - City detection works globally via Vercel Edge
  - Default selection is `+91`, but other codes one-tap accessible
- scope: lead-gen / international
