# Context

Running notes keyed by topic. Verbatim or near-verbatim excerpts with source attribution. No DOC documents were ingested in this batch; entries below were extracted from the SPEC's narrative sections (Context, User Journey, Deliberate Exclusions, International Strategy) for downstream roadmapping.

---

## Hackathon framing
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- Hackathon: Habuild "Kuch Karke Dikha" — 48-hour lead-gen competition.
- Goal: maximize real signups (name + phone + country code) for Habuild's June challenge.
- Scoring: 60% virality, 20% creativity, 10% novelty, 10% user insight.
- Constraints: solo full-stack dev, no existing audience, 48-hour window (Mon Apr 27 9AM – Tue Apr 28 9PM).
- Points: Indian lead = 1 pt, International lead = 3 pts.

## One-liner / product framing
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- A watch-party platform where you sign up, join your city's room, and watch Habuild yoga sessions together with people nearby — driving signups through squad invites, city competition, and the core mechanic: watching alone is boring.

## User journey
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- Step 1 — Discover: WhatsApp message from a friend, or shared landing page with a city stat.
- Step 2 — Landing: hero, live signup counter, top-5 city leaderboard preview, social proof for visitor's city, single CTA, mobile-first, < 2s load.
- Step 3 — Signup: 3 fields (name, phone, country code), city auto-detected, referral attribution applied, no OTP.
- Step 4 — City room: synced YouTube + chat + presence + always-visible WhatsApp invite. **VIRAL MOMENT #1.**
- Step 5 — Squad (optional): private watch party, name it, get WhatsApp link, "incomplete" banner until 3 members. **VIRAL MOMENT #2.**
- Step 6 — City leaderboard: real-time updates, share-button per row. **VIRAL MOMENT #3.**
- Step 7 — Room sharing: post-session social proof share. **VIRAL MOMENT #4.**

## Deliberate exclusions
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- No personality quiz or archetypes
- No phone OTP verification (friction kills conversion)
- No WebRTC voice/video (chat is sufficient)
- No video queue (host picks one video from Habuild list)
- No user accounts/passwords
- No admin panel (use Supabase dashboard)
- No i18n system (Hinglish hardcoded)
- No typing indicators, @mentions, screen share

## International lead strategy (3x points)
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- NRI diaspora — Facebook groups ("Indians in {City}") and WhatsApp groups of Indians abroad. Watch-together appeals to NRIs missing community yoga.
- Global yoga communities — Reddit r/yoga (2M+), r/meditation, FB yoga groups.
- Country code auto-detection — default +91 in dropdown, all codes available; city detection works globally via Vercel Edge.

## Build priority (layered, always shippable)
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- P0 — Next.js scaffold + Supabase + Vercel deploy (2h, 2h cum). Deploys.
- P1 — Landing + signup + city detection (3-4h, 6h cum). Collects signups.
- P2 — Watch room: synced YouTube + chat + presence (6-8h, 14h cum). Core product works.
- P3 — WhatsApp invite + referral tracking (3-4h, 18h cum). Primary viral loop.
- P4 — City leaderboard + live counter (3-4h, 22h cum). Competition engine.
- P5 — Squad rooms (3-4h, 26h cum). Second viral loop.
- P6 — Polish: reactions, mobile UX, share prompts everywhere (2-3h, 29h cum). Delight.
- P0–P4 (~22h) is the working watch party + viral sharing + city competition.
- After P2 (~14h) the product is functional. After P4 (~22h) the viral engine is complete. P5–P6 are multipliers.
- Fallback if behind: ship P0–P3 ("watch together + invite friends"). Still a complete product.

## Viral copy — share triggers (Hinglish)
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- Post-signup: "Main abhi Habuild yoga dekh raha hun 23 logon ke saath! Tu bhi aaja → yogaparty.vercel.app?ref={userId}"
- Squad invite: "Mere saath yoga dekh, squad mein jagah hai → yogaparty.vercel.app/join/{inviteCode}"
- City competition: "Mumbai peechhe hai leaderboard pe 😤 Signup kar apni city ke liye → yogaparty.vercel.app?ref={userId}"
- Post-session: "Abhi 23 logon ke saath yoga kiya Mumbai se 🧘 Tu bhi try kar → yogaparty.vercel.app?ref={userId}"

## Pages inventory
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- `/` Landing
- `/signup` 3-field signup
- `/room/[id]` Watch room (synced YouTube + chat + participants + invite + reactions)
- `/squad` Create private watch party
- `/leaderboard` City + referrer rankings
- Server Actions for signup, referral, squad creation
