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

- **Phase:** Pre-execution (planning complete, no code yet)
- **Plan:** None — awaiting `/gsd-plan-phase 1`
- **Status:** Ready to plan Phase 1
- **Progress:** `[░░░░░░░] 0/7 phases complete`

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
| Landing bundle | < 100KB | n/a |
| Landing load time | < 2s on 4G | n/a |

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
- **Action:** Roadmap created from ingested SPEC.
- **Files written:**
  - `.planning/PROJECT.md`
  - `.planning/REQUIREMENTS.md`
  - `.planning/ROADMAP.md`
  - `.planning/STATE.md`
- **Next action:** `/gsd-plan-phase 1` to plan Scaffold & Deploy.

### History

- 2026-04-27 — Ingest synthesis from SPEC `docs/superpowers/specs/2026-04-24-yogaparty-design.md` (15 proposed decisions, 14 requirements, 19 constraints).
- 2026-04-27 — Roadmap drafted: 7 phases, 16 requirements, 100% coverage. Linear dependency chain. Fallback ship line: end of Phase 4.
