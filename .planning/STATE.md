---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: discussing
last_updated: "2026-04-27T13:30:00.000Z"
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# STATE: YogaParty

> Project memory. Updated as work progresses. Never delete history — append.

## Project Reference

- **Project:** YogaParty
- **Runtime:** Claude Code CLI
- **Core value:** A watch-party platform where you sign up, join your city's room, and watch Habuild yoga sessions together with people nearby — driving signups via squad invites and city competition.
- **Success metric:** Total signups (name + phone + country code rows in `signups`)
- **Single milestone:** Hackathon MVP (Phases 1–7)
- **Window:** Mon Apr 27 09:00 → Tue Apr 28 21:00, 2026 (48h)
- **Implementer:** Solo dev + Claude Code

## Current Position

Phase: 03 (city-watch-room) — CONTEXT GATHERED
Plan: 0 of TBD

- **Phase:** Phase 03 (City Watch Room) — CONTEXT.md written; ready for `/gsd-plan-phase 3`
- **Status:** Phase 02 complete. Phase 03 context locked with 26 decisions (D-301..D-326) across 4 gray areas (URL, identity, host election, video picker).
- **Progress:** `[██████████] 2/7 phases complete (6/6 plans); Phase 3 ready to plan`

## Decisions

- 2026-04-27 — Plan 02-04 closed: signup funnel ships end-to-end (browser smoke 12/12 PASS); bundle budget renegotiated to ≤120 KB shared + ≤5 KB per-route (REQ-LANDING acceptance updated); signup action uses service-role admin client (Rule 3 pivot for live RLS — pre-approved by Plan 02-02 SUMMARY); Vercel preview international check deferred to Phase 3 kickoff (Option B, no non-IN VPN available within time budget).
- 2026-04-27 — Post-Plan-04 redesign: editorial dark-mode broadcast aesthetic (Fraunces serif + JetBrains Mono); on-screen brand mark is "Watch · Party" (the literal "YogaParty" string contains the banned `yoga` token). Repo/URL names unchanged.
- 2026-04-27 — Post-Plan-04 idempotent duplicate-phone behavior: `app/actions/signup.ts` now redirects existing users to `/room/<existing-uuid>` on duplicate phone (instead of returning the verbatim friendly error). This softens locked truth #3 of Plan 02-04; flagged in 02-04-SUMMARY for Phase 3 / pre-demo review.
- 2026-04-27 — Phase 3 context gathered (`/gsd-discuss-phase 3`). Key locks: `/room/[id]` resolves by `rooms.id` (D-301..304); HTTP-only `yp_session` cookie carries identity (D-305..308); presence-derived host election with no schema drift (D-309..313); curated videos in `lib/videos.ts` const, host swap via modal/sheet, room created with `youtube_video_id=NULL` and shows "waiting for host pick" (D-314..318); chat ephemeral broadcast-only (D-319..321). Phase 3 must update `app/actions/signup.ts:93` and `:106` to redirect to `rooms.id` via `findOrCreateCityRoom(city)` helper, resolving the open Phase 2 review item.
- 2026-04-27 — Phase 3 shipped (commits `5458a1e`, `386cd6c`, `516997f`). Two production fixes after deploy: (1) signup → /room redirect loop on stale Phase-2-era URLs (room page now falls back to user's city room when room id not found, signup action validates `next` against actual rooms row); (2) Supabase Realtime "cannot add callbacks after subscribe()" — all `.on()` registrations consolidated into RoomClient's single channel-lifecycle effect before `.subscribe()`. Hooks reduced to pure helpers (usePresence = host derivation, useRoomSync = imperative emitters).
- 2026-04-27 — **Scope pivot:** REQ-SQUAD-ROOM dropped (Phase 6 was "Squad Rooms"). Phase 6 now ships REQ-ROOM-SHARDING (multiple city rooms, 7-person cap, signup-time assignment via `signups.room_id`) + REQ-WEBRTC-CALL (peer-mesh audio + video overlay on the watch room, Supabase channel for signaling, STUN-only, no TURN/SFU). PROJECT.md decisions updated: D-013 revised, D-016 added (sharding), D-017 added (WebRTC mesh). Schema migration `0002_remove_squads_add_sharding.sql` ships in Phase 6.

## Performance Metrics

To be tracked once execution starts:

| Metric | Target | Current |
|---|---|---|
| Total signups | maximize | 0 |
| Indian leads | tracked | 0 |
| International leads (3× weight) | tracked | 0 |
| Landing → signup conversion | > 40% | n/a |
| Signups who invite ≥ 1 friend | > 30% | n/a |
| Avg referrals per user | > 1.5 | n/a |
| K-factor | > 1.0 | n/a |
| Share rate | > 40% of signups | n/a |
| Landing bundle | ≤ 120 KB shared + ≤ 5 KB per-route (renegotiated 2026-04-27) | 119 KB shared / 3.6 KB on `/` / 1.25 KB on `/signup` — PASS |
| Landing load time | < 2s on 4G | n/a (measure post Vercel preview) |

### Plan execution metrics

| Phase | Plan | Duration (min) | Tasks | Files |
|-------|------|----------------|-------|-------|
| 02 | 04 | 35 | 5 | 5 |

## Accumulated Context

### Locked decisions (do not revisit)

Reference `.planning/PROJECT.md` "Locked Decisions" for the canonical list. Summary:

- Stack: Next.js 15 App Router + Tailwind + Supabase + Vercel + react-youtube
- No OTP, no accounts, no admin panel, no i18n framework, no WebRTC
- WhatsApp is the only sharing channel (`wa.me`)
- City auto-detected via Vercel Edge `request.geo`
- First joiner is host; sync drift threshold = 2s; heartbeat = 5s
- Phone is `UNIQUE NOT NULL`

### Open questions

None at planning time. All technical decisions are locked per the SPEC.

### Active todos

- [ ] Create the actual GitHub repo
- [ ] Provision Supabase project + apply schema
- [ ] Provision Vercel project + connect repo + set env vars
- [ ] (Phase 1) Land first deploy
- [ ] Source curated Habuild YouTube video IDs (needed by Phase 3 / REQ-CONTENT-LIST)
- [ ] Identify seeding channels for international leads (Phase 4+ rollout, not build work): NRI Facebook groups, r/yoga, r/meditation

### Blockers

None.

### Risks (carried, not blocking)

- **Realtime concurrency cap (500):** Free-tier Supabase Realtime is capped at 500 concurrent connections. If a single city room exceeds this, presence/sync will fail. Mitigation: not addressed in v1; acceptable for hackathon scale.
- **Sync correctness on poor networks:** The 2s drift / 5s heartbeat heuristic is borrowed from Watch-Mate; untested at scale on 4G. Mitigation: ship and observe.
- **YouTube embed availability:** Some Habuild videos may have embedding disabled. Mitigation: validate the curated list during Phase 1 alongside the schema.
- **Time budget overrun:** SPEC says fallback ship line is end-of-Phase 4 (P0–P3 in SPEC numbering). Phases 5–7 are multipliers and can be cut.

## Session Continuity

### Last session

- **Date:** 2026-04-27
- **Action:** Closed Plan 02-04 — wrote SUMMARY.md, updated ROADMAP/REQUIREMENTS, marked Phase 2 complete.
- **Files written:**
  - `.planning/phases/02-landing-signup/02-04-SUMMARY.md` (new)
  - `.planning/STATE.md` (this file)
  - `.planning/ROADMAP.md` (Phase 2 progress → Complete)
  - `.planning/REQUIREMENTS.md` (REQ-LANDING / REQ-SIGNUP / REQ-INTERNATIONAL marked complete)
- **Next action:** `/gsd-plan-phase 3` to plan City Watch Room.

### History

- 2026-04-27 — Ingest synthesis from SPEC `docs/superpowers/specs/2026-04-24-yogaparty-design.md` (15 proposed decisions, 14 requirements, 19 constraints).
- 2026-04-27 — Roadmap drafted: 7 phases, 16 requirements, 100% coverage. Linear dependency chain. Fallback ship line: end of Phase 4.
- 2026-04-27 — Phase 1 closed (REQ-INFRA satisfied, 2/2 plans complete).
- 2026-04-27 — Phase 2 plans 02-01..02-03 closed.
- 2026-04-27 — Phase 2 Plan 02-04 closed: signup funnel end-to-end (12/12 smoke PASS), bundle budget renegotiated, signup action on service-role admin client (Rule 3), Vercel international check deferred (Option B). Phase 2 → Complete.
