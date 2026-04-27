# Phase 3 — City Watch Room manual smoke

Two browsers required (window A = mobile profile 360px; window B = desktop ≥ 1024px). Run against the Vercel preview URL after `git push`.

## Setup
- A and B both have a fresh `localStorage` and no `yp_session` cookie.
- Both spoof to the same city (e.g., via Vercel `x-vercel-ip-city` override or VPN to the same IP region).

## Checklist
1. **Sign up A then B** — both arrive at `/room/{same-uuid}`. Header reads `2 people from {city}`.
2. **Host badge** — A shows `◆ HOST` next to its name in the presence list; B does not.
3. **Auto-open picker on host** — A sees the picker auto-open the first time (room is empty).
4. **Pick a video on A** — B's player swaps to the same video within ~2s.
5. **A presses play** — B's player starts within ~2s at the same timestamp.
6. **A presses pause** — B's player pauses within ~2s.
7. **A scrubs to 2:00** — B's player seeks within ~2s.
8. **Drift correction** — In B's DevTools throttle to "Slow 3G". Within ~5s of next heartbeat (5s cadence), B's player jumps back to A's position.
9. **Host drop & re-elect** — A closes its tab. Within ~30s, B's name gets the `◆ HOST` badge and B's player gains controls + the `Change video` button.
10. **Chat ordering** — Send 5 messages alternating A/B. Both windows show identical chronological order.
11. **Mobile bottom-sheet vs desktop sidebar** — On A (360px) chat is a bottom sheet behind a `Chat` button in the header. On B (≥md) chat is always-visible right sidebar.
12. **Unauthed deep link** — Open a fresh incognito tab on `/room/{uuid}`. It redirects to `/signup?next=/room/{uuid}`. Sign up; lands on the same room id.
13. **Self-redirect block** — Try `/signup?next=https://evil.example/x`. Hidden field is empty; signup goes to the default city room, NOT the external host.
14. **Idempotent duplicate-phone** — Submit the signup form again with A's phone in a fresh tab. You're redirected to A's city room (same uuid).
15. **Server validation** — In DevTools, call `pickVideo(roomId, 'fake-id')` via the React tree (React DevTools / window.next). It returns `{error: 'Video not in curated list.'}`.
16. **Reload room mid-broadcast** — Reload B. B re-joins, presence count goes to 1 then 2, and B's player resumes near A's current timestamp via the next heartbeat → sync_correct.

## Pass criteria
All 16 steps green on mobile + desktop. If a step fails, open a follow-up in `STATE.md` Risks section and decide whether it blocks Phase 4.
