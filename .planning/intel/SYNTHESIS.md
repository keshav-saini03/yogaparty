# Synthesis Summary

Single-source ingest. The classification batch contained one SPEC describing the YogaParty hackathon platform. No ADRs, PRDs, or DOCs were classified, and there is no prior `.planning/` context (mode: new).

## Doc counts by type

| Type | Count |
|---|---|
| ADR | 0 |
| SPEC | 1 |
| PRD | 0 |
| DOC | 0 |
| **Total** | **1** |

## Decisions

- Locked: 0
- Proposed (lifted from SPEC): 15
- Source paths:
  - docs/superpowers/specs/2026-04-24-yogaparty-design.md

## Requirements

- Extracted: 14
- IDs: REQ-landing-page, REQ-signup, REQ-city-room, REQ-squad-room, REQ-room-sync, REQ-chat, REQ-reactions, REQ-presence, REQ-whatsapp-share, REQ-referral-attribution, REQ-leaderboard, REQ-live-counter, REQ-content-list, REQ-international-strategy

## Constraints

- Total: 19
- By type:
  - schema: 5 (signups, squads, squad_members, rooms, phone uniqueness)
  - protocol: 4 (channel naming, event protocol, presence payload, sync drift threshold)
  - api-contract: 3 (WhatsApp share, geolocation, key SQL queries)
  - nfr: 6 (landing performance, free-tier envelope, single-deploy workflow, time budget, lead scoring, referral capture, success metrics)
  - (Note: counts above sum > 19 because `referral capture` is counted as protocol; see file for canonical types.)

## Context topics

- Hackathon framing
- Product one-liner
- User journey (7 steps, 4 viral moments)
- Deliberate exclusions
- International lead strategy
- Build priority (P0–P6)
- Viral share copy (4 triggers)
- Pages inventory

## Conflicts

- BLOCKERS: 0
- Competing variants: 0
- Auto-resolved: 0

Single-source ingest. No prior context. No conflicts possible.

## Pointers

- Conflicts report: `.planning/INGEST-CONFLICTS.md`
- Per-type intel:
  - `.planning/intel/decisions.md`
  - `.planning/intel/requirements.md`
  - `.planning/intel/constraints.md`
  - `.planning/intel/context.md`
- Source classifications: `.planning/intel/classifications/`

## Status

READY — safe to route to `gsd-roadmapper`.
