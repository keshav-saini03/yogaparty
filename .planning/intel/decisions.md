# Decisions

This file aggregates locked and proposed architectural/product decisions extracted during ingest. Each decision retains its source for provenance.

No ADR documents were ingested in this batch.

The source SPEC contains several technical decisions made by the author for the hackathon build. Because these were authored as a SPEC (not a formal ADR), they are surfaced as `proposed` engineering decisions rather than locked ADRs. Downstream roadmapping may promote any of these to formal ADRs.

---

## Proposed (from SPEC)

### D-001: Use Next.js 15 App Router as the application framework
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: web application framework
- rationale: SSR, server actions, Vercel-native deployment

### D-002: Use Supabase (Postgres + Realtime) as the only backend
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: backend / data layer
- rationale: free tier covers 50K MAU + 500 concurrent realtime; SQL for leaderboards; channels for sync/chat/presence; eliminates need for separate backend server or Redis

### D-003: Deploy on Vercel free tier with `git push` workflow
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: hosting / deployment
- rationale: free, instant, single-command deploys; matches 48-hour solo build constraint

### D-004: No phone OTP verification at signup
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: signup flow / lead capture
- rationale: friction kills conversion; hackathon scoring rewards raw signups (name + phone + country code)

### D-005: No user accounts or passwords
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: identity model
- rationale: signup is just name + phone; identity is the signup row itself

### D-006: Auto-detect city from IP via Vercel Edge `request.geo`
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: city assignment / geolocation
- rationale: free, automatic; user lands in their city's room without typing

### D-007: YouTube IFrame API (via `react-youtube`) is the video layer
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: video playback
- rationale: avoids hosting/streaming costs; Habuild content is already on YouTube

### D-008: Host model — first joiner is host; transfers to next person on leave
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: realtime sync / room control
- rationale: simplest control model; only host can play/pause/seek

### D-009: Sync algorithm — host broadcasts play/pause/seek; clients heartbeat every 5s; drift > 2s triggers `sync_correct` to that client only
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: video sync protocol
- rationale: adapted from Watch-Mate; minimizes corrective traffic

### D-010: Pre-curated Habuild video list — host selects from list, no free-form URL input
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: content moderation / room setup
- rationale: keeps rooms focused on Habuild content; avoids moderation overhead

### D-011: WhatsApp is the only sharing channel; native `wa.me` URLs
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: viral / sharing strategy
- rationale: target audience uses WhatsApp; no API integration needed

### D-012: Referral attribution via `?ref={userId}` URL param stored in localStorage
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: referral tracking
- rationale: applied at signup → `referrer_id` column; powers referrer leaderboard

### D-013: Two room types — public city rooms (auto-created) and private squad rooms (user-created)
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: room model
- rationale: city rooms drive city competition; squad rooms drive friend-group invites

### D-014: No admin panel — use Supabase dashboard for ops
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: operations
- rationale: hackathon time budget; Supabase dashboard is sufficient

### D-015: No i18n framework — Hinglish copy hardcoded
- source: docs/superpowers/specs/2026-04-24-yogaparty-design.md
- status: proposed
- scope: copy / localization
- rationale: target audience is Indian; Hinglish copy is the right voice; full i18n is out of scope
