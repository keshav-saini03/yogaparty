# Phase 3: City Watch Room — Discussion Log

**Date:** 2026-04-27
**Mode:** /gsd-discuss-phase 3 (default mode, AskUserQuestion-driven)
**Phase:** 03-city-watch-room
**Status:** CONTEXT.md written, ready for planning

> Human-readable record of the discussion. Not consumed by downstream agents — they read `03-CONTEXT.md`.

---

## Areas Selected by User

User selected all four proposed gray areas (multiSelect):

1. Room URL & city-room resolution
2. Identity carry from signup → room
3. Host election & disconnect handling
4. Video picker UX & curated list source

User also added free-form notes proposing private/public user-created rooms with topics and user-set room location. These were redirected as scope creep (see Deferred section below).

---

## Area 1 — Room URL & city-room resolution

### Q1.1 — How should /room/[id] resolve, and what does the URL identifier represent?
- **Options presented:** rooms.id (Recommended) / signups.id (status quo) / city slug
- **User chose:** rooms.id (Recommended)
- **Rationale:** Clean URL semantics, deep-linkable, only one extra DB upsert per signup, future-proof for squad rooms (Phase 6).
- **Captured as:** D-301, D-302, D-304

### Q1.2 — Who can join a given city room?
- **Options presented:** Anyone with the URL (Recommended) / City-locked
- **User chose:** Anyone with the URL (Recommended)
- **Rationale:** Aligns with Phase 4 WhatsApp share virality; cross-city friends and NRIs can join an Indian friend's room.
- **Captured as:** D-303

---

## Area 2 — Identity carry from signup → room

### Q2.1 — How should client-side identity be carried into the room?
- **Options presented:** HTTP-only cookie (Recommended) / localStorage / Server-rendered, no client identity
- **User chose:** HTTP-only cookie (Recommended)
- **Rationale:** Tamper-proof, refresh-safe, single source of truth (`signups` table), works with Next.js 15 server components.
- **Captured as:** D-305, D-306, D-307

### Q2.2 — What happens for an unauthed visitor on /room/{id}?
- **Options presented:** Redirect to /signup?next=… (Recommended) / Read-only spectator mode / Hard signup wall
- **User chose:** Redirect to /signup?next=/room/{id} (Recommended)
- **Rationale:** Signup is THE success metric. Deep-link continuity preserved via `?next` param. Self-redirect protection via UUID-shaped path guard.
- **Captured as:** D-308

---

## Area 3 — Host election & disconnect handling

### Q3.1 — Where does host state live, and how is "first joiner" decided?
- **Options presented:** Presence-derived (Recommended) / rooms.host_id column / Hybrid
- **User chose:** Presence-derived (Recommended)
- **Rationale:** Zero schema drift from PROJECT.md locked schema, no DB writes on transfer, automatic re-election.
- **Captured as:** D-309, D-310, D-313

### Q3.2 — How should host disconnect / network drop be handled?
- **Options presented:** Trust Supabase presence timeout (Recommended) / Aggressive heartbeat-based detection / Manual host-claim button
- **User chose:** Trust Supabase presence timeout (Recommended)
- **Rationale:** Acceptable for hackathon scale; documented as known limitation.
- **Captured as:** D-311

### Q3.3 — Visual indicator for who is host?
- **Options presented:** Crown/badge in presence list (Recommended) / Top banner / Both
- **User chose:** Crown/badge in presence list (Recommended)
- **Rationale:** Subtle, mobile-friendly, fits broadcast aesthetic (`--accent` yellow).
- **Captured as:** D-312

---

## Area 4 — Video picker UX & curated list source

### Q4.1 — Where should the curated Habuild video list live?
- **Options presented:** Hardcoded TS const at lib/videos.ts (Recommended) / new `videos` table / static JSON
- **User answer:** "Other" with notes — "curated list for all things and people can make rooms public which we show to all and people can join based on their topic of interest and curated playlist for saving time as people want not to think watch what we have made"
- **Resolution:** Locked option A (`lib/videos.ts` hardcoded const) since it's the only option compatible with the locked schema (no `videos` table per D-014, no admin panel) and the user's emphasis on "curated list…saving time" matches it. The added scope ("user-created public topic rooms" and "playlist") is captured in `<deferred>`.
- **Captured as:** D-314, D-315

### Q4.2 — How does the host swap video, and what happens on swap?
- **Options presented:** "Change video" button → modal/sheet (Recommended) / persistent inline picker / picker visible to all
- **User chose:** "Change video" button → modal/sheet, swap resets to t=0
- **Captured as:** D-316

### Q4.3 — What does the room show before the host picks a video?
- **Options presented:** Auto-pick first video on create (Recommended) / Wait for host pick — placeholder / Random video
- **User chose:** Wait for host pick — show placeholder with prompt
- **Rationale:** More "correct" semantics; host-driven from t=0; explicit empty-state UX work accepted.
- **Captured as:** D-317, D-318

---

## Deferred Ideas (from discussion)

User-suggested features deferred per scope guardrail:

- Private/invite-only rooms → Phase 6 (REQ-SQUAD-ROOM, already roadmapped).
- User-created public rooms with custom topics/headings → new capability beyond v1 scope. Backlog.
- User-set room location (override detected city) → explicitly rejected in Phase 2 (server-authoritative city). Reaffirmed.
- Multi-video curated playlist with auto-advance → schema is single `youtube_video_id` per room. v2.
- Topic-based room discovery / search → no discovery surface in v1. v2.

Default-position items also captured in `<deferred>`:

- Persisted chat history → ephemeral broadcast-only in v1 (D-319).
- Aggressive host-disconnect recovery → trust Supabase presence (D-311).
- Spectator/read-only mode for unauthed visitors → forced signup (D-308).
- Auto-pick first video on room create → user chose "wait for host pick" (D-317).

---

## Claude's Discretion (left flexible)

Items the user did not lock; planner/executor have judgment:

- Exact YouTube IFrame API option flags
- Exact bottom-sheet implementation library (vanilla CSS / framer-motion / Headless UI)
- Animation timing
- Empty-state illustration style
- Whether to extract `usePresence` / `useRoomSync` hooks
- Loading skeleton between mount and first presence sync
- Reconnection UI banner

---

## Phase 2 Cross-References / Required Updates

- `app/actions/signup.ts` — lines 93 and 106 redirect targets change to `/room/{rooms.id}` via shared `findOrCreateCityRoom(city)` helper. Resolves the open Phase 2 review item flagged in `02-04-SUMMARY.md` and `STATE.md` ("idempotent duplicate-phone redirect to be reviewed in Phase 3").
- Set `yp_session` HTTP-only cookie in the signup action just before redirect.
- Read `next` query param in signup action; on success, redirect to `next` if it matches `^/room/[0-9a-f-]{36}$`, otherwise default city room.

These updates belong in Phase 3's plans, not as a Phase 2 retro.

---

*Generated by /gsd-discuss-phase 3 on 2026-04-27.*
