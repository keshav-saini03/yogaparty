---
phase: 3
slug: city-watch-room
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Hybrid approach: vitest unit tests for pure-function logic (`electHost`, `shouldCorrect`, server actions, `findOrCreateCityRoom`) + a documented two-window manual smoke for Realtime end-to-end behavior. Realtime-over-Supabase E2E is non-trivial in headless tests; the algorithmic core is the high-risk surface and gets unit coverage.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x (Wave 0 install — none currently in `package.json`) |
| **Config file** | `vitest.config.ts` (Wave 0 task) |
| **Quick run command** | `npx vitest run --no-coverage` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~3-5 seconds on a small suite |
| **Manual smoke** | `tests/manual-smoke-phase3.md` — two-window checklist on the Vercel preview URL |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --no-coverage` (~3s)
- **After every plan wave:** Run `npx vitest run` + a quick manual smoke spot-check
- **Before `/gsd-verify-work`:** Full vitest suite green AND the 9-step manual smoke checklist signed off on both mobile and desktop against the Vercel preview URL
- **Max feedback latency:** 5 seconds (vitest), ~5 minutes (manual smoke for full E2E)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-W0-01 | TBD | 0 | (infra) | — | N/A | install | `npx vitest --version` | ❌ W0 | ⬜ pending |
| 03-W0-02 | TBD | 0 | (infra) | — | N/A | config | `test -f vitest.config.ts` | ❌ W0 | ⬜ pending |
| 03-W0-03 | TBD | 0 | REQ-CITY-ROOM | — | N/A | unit stub | `npx vitest run lib/rooms.test.ts` | ❌ W0 | ⬜ pending |
| 03-W0-04 | TBD | 0 | REQ-ROOM-SYNC | — | N/A | unit stub (extract) | `npx vitest run lib/sync-utils.test.ts` | ❌ W0 | ⬜ pending |
| 03-XX-01 | TBD | 1+ | REQ-CITY-ROOM | T-03-01 / V4 | `findOrCreateCityRoom` returns same id on repeat call; `next` redirect param matches `^/room/[0-9a-f-]{36}$` regex | unit | `npx vitest run lib/rooms.test.ts -t findOrCreate` | ❌ W0 | ⬜ pending |
| 03-XX-02 | TBD | 1+ | REQ-ROOM-SYNC | — | N/A | unit | `npx vitest run lib/sync-utils.test.ts -t electHost` | ❌ W0 | ⬜ pending |
| 03-XX-03 | TBD | 1+ | REQ-ROOM-SYNC | — | N/A | unit | `npx vitest run lib/sync-utils.test.ts -t shouldCorrect` | ❌ W0 | ⬜ pending |
| 03-XX-04 | TBD | 1+ | REQ-ROOM-SYNC | — | sync_play handler uses suppressNextEvent ref to break the seek→onStateChange→sync_seek loop | unit | `npx vitest run hooks/useRoomSync.test.ts` | ❌ W0 | ⬜ pending |
| 03-XX-05 | TBD | 1+ | REQ-CHAT | — | N/A | unit | `npx vitest run components/room/Chat.test.tsx -t order` | ❌ W0 | ⬜ pending |
| 03-XX-06 | TBD | 1+ | REQ-PRESENCE | — | track payload = `{user_id, name, city, joined_at}` exactly | unit | `npx vitest run app/room/RoomClient.test.tsx -t track` | ❌ W0 | ⬜ pending |
| 03-XX-07 | TBD | 1+ | REQ-CONTENT-LIST | T-03-02 / V5 | `pickVideo(roomId, videoId)` rejects videoId not in `CURATED_VIDEOS` | unit | `npx vitest run app/actions/pick-video.test.ts -t rejects` | ❌ W0 | ⬜ pending |
| 03-XX-08 | TBD | last | (E2E) | — | full smoke checklist | manual | `tests/manual-smoke-phase3.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> The planner will assign concrete plan/wave numbers and replace TBD/XX placeholders. Task IDs above are illustrative; the binding contract is the requirement-to-test mapping.

---

## Wave 0 Requirements

- [ ] Add to `package.json` devDependencies: `vitest@^1`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`. Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts.
- [ ] `vitest.config.ts` — minimal config with `environment: 'jsdom'`, alias `@` → repo root (matches `tsconfig.json` paths).
- [ ] `lib/sync-utils.ts` — extract `electHost(participants): Participant | null` (sort by `joined_at` asc, then `user_id` asc) and `shouldCorrect(hostTime: number, clientTime: number, threshold = 2): boolean` as pure functions. These are the algorithmic risk surface; everything else is glue.
- [ ] `lib/sync-utils.test.ts` — stubs covering REQ-ROOM-SYNC: `electHost` ties broken deterministically, empty list returns null, single participant is host; `shouldCorrect` boundary cases (exactly 2.0s = false, 2.001s = true).
- [ ] `lib/rooms.test.ts` — stubs covering REQ-CITY-ROOM `findOrCreateCityRoom` (mock the admin client; verify second call returns same id; verify city normalization to uppercase/trim).
- [ ] `app/actions/pick-video.test.ts` — stubs covering REQ-CONTENT-LIST: rejects non-curated videoId.
- [ ] `tests/manual-smoke-phase3.md` — the 9-step two-window checklist (copy from `03-RESEARCH.md` § Validation Architecture → Manual smoke checklist).

---

## Manual-Only Verifications

> Realtime + IFrame integration cannot be exercised end-to-end in unit tests without a live Supabase connection and a real YouTube embed. The following are documented as manual-smoke against the Vercel preview URL.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two clients on same city land in same room and see correct count | REQ-CITY-ROOM, REQ-PRESENCE | Live Realtime presence + DB write | Two browsers, sign up with different phones, identical detected city → both arrive at same `/room/{id}`; header reads "2 people from {city} watching right now" |
| Host plays/pauses/seeks → all clients mirror within ~2s | REQ-ROOM-SYNC | Real YouTube IFrame + Realtime broadcast | Two windows; host A clicks play/pause/seek → B mirrors within 2s |
| Drift > 2s on one client triggers `sync_correct` only to that client | REQ-ROOM-SYNC | Network throttling + heartbeat round-trip | Throttle B to "Slow 3G" in DevTools; within ~5s of next heartbeat, B's player jumps to A's position |
| Host disconnect → next-by-joined_at re-elects within ~30s | REQ-ROOM-SYNC | Supabase presence-leave timeout (~15-30s) | A closes tab; within 30s, B's HOST badge appears; B's player gains controls |
| Mobile bottom-sheet vs desktop sidebar | REQ-CHAT | Tailwind `md:` breakpoint cross-render | Resize to 360px → chat is bottom sheet; resize to ≥1024px → sidebar visible |
| Unauthed visitor on `/room/{id}` redirects via `?next=` | REQ-CITY-ROOM | Server-side cookie + redirect; `next` allow-list | New incognito tab → `/room/{id}` → server redirects to `/signup?next=/room/{id}` → after signup, lands back on the same room |
| Reactions during room transitions don't duplicate or drop chat messages | REQ-CHAT | Order-stability under Realtime broadcast jitter | Send 5 messages from each window in quick alternation; both windows show identical chronological order |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (Realtime/sheet UI tasks may rely on manual smoke; planner must avoid grouping them adjacently)
- [ ] Wave 0 covers all MISSING references (vitest install, sync-utils extract, manual-smoke checklist)
- [ ] No watch-mode flags (`vitest run`, never `vitest` alone, in CI/agent commands)
- [ ] Feedback latency < 5s for unit tests
- [ ] Manual smoke checklist signed off on mobile + desktop against Vercel preview before phase verification
- [ ] `nyquist_compliant: true` set in frontmatter once planner integrates this map into PLAN.md tasks

**Approval:** pending
