# Phase 3: City Watch Room - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 3 (4 gray areas explored interactively)

<domain>
## Phase Boundary

After signup, two users from the same city land in the same `/room/[id]` and watch a Habuild yoga video together — playback synced (host-controlled), live chat, and a presence list. This is the moment the product becomes a product.

**In scope:**
- `/room/[id]` page — synced YouTube player + chat + presence + live count
- Auto-create one `rooms` row per detected city on first signup from that city (`type='city'`)
- Sync protocol: host broadcasts `sync_play | sync_pause | sync_seek`; clients heartbeat every 5s; host issues `sync_correct` on drift > 2s (C-006/C-008)
- Host election: presence-derived (first joiner by `joined_at`); auto re-election on host leave/timeout
- Curated Habuild video list at `lib/videos.ts`; host-only video picker (modal/sheet)
- Chat: bottom sheet on mobile, sidebar on desktop (REQ-CHAT)
- Presence: `track({user_id, name, city})` (C-007); host badge on presence list
- Update Phase 2 signup action: redirect to `/room/{rooms.id}` (was `/room/{signups.id}`) for both fresh-signup and idempotent duplicate-phone paths
- HTTP-only `yp_session={signupId}` cookie set by signup action; read by `/room/[id]` server component for identity hydration
- `/signup?next=/room/{id}` flow for unauthed visitors landing via shared URLs

**Out of scope (later phases):**
- WhatsApp share button on the room page (Phase 4 — but the room page should expose a stable place for it, e.g., a slot in the header)
- Live signup counter / leaderboard (Phase 5)
- Squad/private rooms (Phase 6)
- Emoji reactions (Phase 7)
- User-created public rooms with topics, multi-video playlists, user-set room locations — explicitly deferred (see `<deferred>`)

</domain>

<decisions>
## Implementation Decisions

### Room URL & city-room resolution (LOCKED)
- **D-301:** `/room/[id]` resolves by `rooms.id` (NOT `signups.id`). The URL identifies the room itself.
- **D-302:** Signup action does **find-or-create** on the `rooms` row for the user's detected `signups.city` (`type='city'`, `is_active=true`) and redirects to `/room/{room.id}`. This is shared between fresh-signup and duplicate-phone paths.
- **D-303:** Anyone with the URL can join a city room — no city-locked redirect. Aligns with Phase 4 WhatsApp share (cross-city friends, NRIs invited from India). Presence still shows each participant's home `{name, city}`.
- **D-304:** Phase 2 deviation flagged — `app/actions/signup.ts:93` and `:106` currently `redirect('/room/${signups.id}')`. Phase 3 must update both lines via a single `findOrCreateCityRoom(city)` helper to redirect to `rooms.id`. Update PHASE 2's `02-04-SUMMARY.md` cross-reference and `STATE.md` to acknowledge softened locked truth.

### Identity carry from signup → room (LOCKED)
- **D-305:** Server-rendered identity. Signup action sets HTTP-only cookie `yp_session={signupId}`, `SameSite=Lax`, `Secure` (in prod), `Path=/`, no expiry (or 30d).
- **D-306:** `/room/[id]` is a server component. Server reads `yp_session` cookie → fetches `name, city` from `signups` → passes to a client `<RoomClient>` component as props. Single source of truth: `signups` table.
- **D-307:** Client uses `{user_id: signupId, name, city}` for `channel.track()` (C-007) and as `chat` event payload sender.
- **D-308:** Unauthed visitor (no `yp_session` or stale id) → server-side redirect to `/signup?next=/room/{id}`. Signup action reads `next` param and, on success, redirects there instead of the default city room. Self-redirect protection: only allow `next` paths that match `^/room/[0-9a-f-]{36}$` (UUID guard).

### Host election & disconnect handling (LOCKED)
- **D-309:** Presence-derived host. No `host_id` column on `rooms` (preserves the locked schema from PROJECT.md / `supabase/migrations/0001_init.sql`). Every client computes `host = participants.sort((a,b) => a.joined_at - b.joined_at)[0]`; ties broken by `signup_id` lex sort. Re-election fires automatically on every presence event.
- **D-310:** Track joined_at via Supabase presence metadata: `channel.track({ user_id, name, city, joined_at: Date.now() })`.
- **D-311:** On host disconnect, trust Supabase Realtime presence timeout (~15-30s) to fire untrack. During the timeout window, no client is host → playback freezes for everyone. Documented as known limitation; acceptable for hackathon scale (avg session = 1 video). No aggressive heartbeat-based fallback in v1.
- **D-312:** Host visual indicator — small badge in presence list (e.g., `◆` glyph or `HOST` mono-uppercase tag) using `--accent` color from `app/globals.css`. No top banner. Tooltip: "Controls playback for the room."
- **D-313:** Host-only UI exposes: play/pause/seek (passed through react-youtube `onStateChange`/`getCurrentTime` API), and "Change video" button. Non-hosts see a passive player (no controls overlay; YouTube IFrame `controls=0`).

### Video picker & curated list (LOCKED)
- **D-314:** Curated list lives at `lib/videos.ts` as a hardcoded TS const:
  ```typescript
  export const CURATED_VIDEOS = [
    { id: 'YOUTUBE_VIDEO_ID', title: '...', durationSec: 600, thumbnail?: '...' },
    // ...
  ] as const;
  ```
  Honors D-014 (no admin panel) and D-010 (no free-form URL input). Schema unchanged.
- **D-315:** Active todo "Source curated Habuild YouTube video IDs" is content work, not infra; planner should treat the list seed as a separate task that can stub with placeholder IDs and be filled in pre-demo. Validate each video has `embed=true` (per existing risk in `STATE.md`).
- **D-316:** Host swap UX — "Change video" button on host UI → bottom sheet on mobile / centered modal on desktop. Sheet/modal lists curated thumbnails + titles. Selection: (a) write `rooms.youtube_video_id = X` via Supabase, (b) broadcast `sync_play` with `{ timestamp: 0 }` after the YouTube player emits `onReady` for the new video. All clients reload player at t=0.
- **D-317:** New rooms are created with `youtube_video_id = NULL` (column is already nullable per `supabase/migrations/0001_init.sql`). Room shows a placeholder "{host_name} is choosing a video…" until the host picks. Non-hosts see "Waiting for {host_name} to pick a video." Host sees the picker auto-opened on first arrival to a video-less room.
- **D-318:** Late joiner sync — when client receives presence sync + room state, it reads `rooms.youtube_video_id` and the host's last `heartbeat.currentTime` to seek into the live timestamp. Drift correction (C-008) takes over after first heartbeat.

### Chat (Claude's discretion within these guardrails)
- **D-319:** Chat is **ephemeral / broadcast-only** in v1 — no `messages` table, no history persistence, no schema migration. Refresh = lose chat history. Aligns with hackathon scope and D-014 (no admin panel for moderation). Confirmed via the locked schema's absence of a messages table and no requirement for chat history in REQ-CHAT.
- **D-320:** Chat state lives in client `useState`, fed by Supabase Realtime `chat` event subscription. Render: `{user, text, timestamp}`.
- **D-321:** Mobile chat = bottom sheet (collapsible drawer pinned to bottom, expand to ~60% viewport height); desktop = right-side sidebar (~320px width). Locked from REQ-CHAT.

### Presence list
- **D-322:** Always-visible participant chip-row in room header (mobile: horizontal scroll if > N), and a tap-to-expand full list (desktop: inline sidebar component or part of chat sidebar).
- **D-323:** Participant row shows `{name} · {city}` with the host badge from D-312. Live count in header: "{N} people from {city} watching right now" — note: count is room-scoped (could include cross-city joiners per D-303); copy uses the room's city, not the viewer's.

### Sync protocol implementation
- **D-324:** YouTube player via `react-youtube` (D-007 locked). Add to `package.json` in this phase.
- **D-325:** Heartbeat (C-006) — every client sends `heartbeat { currentTime, sentAt }` every 5s on its room channel; only the host computes drift `Math.abs(serverTimeAdjusted - clientTime) > 2s` and replies with `sync_correct { timestamp }` to that client only (server-side filter not needed; client filters by `if (msg.target_user_id !== self.user_id) return`).
- **D-326:** Sync events use Supabase Realtime broadcast (not presence) on `room:{roomId}` channel; payload format per C-006.

### Claude's Discretion
- Exact YouTube IFrame API option flags (recommend `controls: 0` for non-hosts, `controls: 1` for hosts; `disablekb: 1` always; `rel: 0`)
- Exact bottom-sheet implementation (vanilla CSS transform, framer-motion if already added, or Headless UI — pick the lightest)
- Animation timing for presence-list updates and host-badge transitions
- Empty-state illustration vs text-only for "waiting for host" placeholder
- Whether to add a thin `usePresence(channel)` and `useSync(channel, isHost)` hook abstraction or keep logic inline (recommend hooks for readability)
- Loading skeleton between mount and first presence sync
- Error/disconnect UI (e.g., "Reconnecting…" banner if Realtime subscription drops)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source spec
- `docs/superpowers/specs/2026-04-24-yogaparty-design.md` — §"User Journey" steps 4-7, §"Pages" → `/room/[id]`, §"Realtime Protocol", §"Sync Algorithm"

### Project planning (locked decisions)
- `.planning/PROJECT.md` — D-005 (no accounts), D-007 (react-youtube), D-008 (host = first joiner), D-009 (sync algorithm spec), D-010 (curated list, no free-form URL), D-013 (city + squad room types); §"Realtime Protocol (Locked)" with channel name and event payloads (C-005..C-008)
- `.planning/REQUIREMENTS.md` — REQ-CITY-ROOM, REQ-ROOM-SYNC, REQ-CHAT, REQ-PRESENCE, REQ-CONTENT-LIST acceptance criteria
- `.planning/STATE.md` — open todo "Source curated Habuild YouTube video IDs"; carried risks (Realtime concurrency cap 500, sync correctness on poor networks, YouTube embed availability)

### Phase 2 artifacts that DO NOT need re-reading but DO get modified
- `app/actions/signup.ts` — current `/room/{signups.id}` redirect at lines 93, 106 must change to `/room/{rooms.id}` via `findOrCreateCityRoom(city)` helper (D-302/D-304)
- `.planning/phases/02-landing-signup/02-04-SUMMARY.md` — flags the idempotent-duplicate-phone redirect as Phase 3 review item; this phase resolves it

### Phase 1 / 2 files Phase 3 builds on (DO NOT recreate)
- `lib/supabase/{client,server,admin}.ts` — Supabase clients
- `lib/geo.ts` — `getDetectedCity()` server helper
- `app/globals.css` — `--accent`, `--live`, `--ink-*`, `pulse-dot`, `font-display`, `font-mono` tokens used in the broadcast aesthetic
- `app/room/[id]/page.tsx` — current placeholder; replace with the real watch room
- `supabase/migrations/0001_init.sql` — `rooms` schema (note: `youtube_video_id` already nullable, `host_id` does NOT exist by design per D-309)

### External docs (researcher should consult)
- Supabase Realtime — Presence (`channel.track`/`presence_state`/`sync` events), Broadcast events, channel lifecycle, untrack timeout behavior
- YouTube IFrame Player API — `loadVideoById`, `playVideo`, `pauseVideo`, `seekTo`, `getCurrentTime`, `getPlayerState`, `onReady`, `onStateChange`
- `react-youtube` — props mapping, ref access, server-rendering caveats with Next.js 15 App Router (it's a client-only component → mark with `'use client'`)
- Next.js 15 — server component cookies API (`cookies()` from `next/headers`), redirect with query params, `useFormState`/`useActionState`

</canonical_refs>

<specifics>
## Specific Ideas

### File structure to add

```
app/
├── room/
│   └── [id]/
│       ├── page.tsx               # Server component: read cookie, fetch identity + room state, hydrate
│       └── RoomClient.tsx         # 'use client' — Realtime channel, sync, chat, presence orchestrator

components/
└── room/
    ├── Player.tsx                 # react-youtube wrapper, host vs non-host modes
    ├── PresenceList.tsx           # chip row in header + expanded panel; host badge
    ├── Chat.tsx                   # bottom-sheet (mobile) / sidebar (desktop)
    ├── ChatMessage.tsx            # individual row
    ├── VideoPickerSheet.tsx       # host-only modal/sheet, lists CURATED_VIDEOS
    ├── HostBadge.tsx              # ◆ HOST tag glyph
    └── RoomHeader.tsx             # On Air pulse + count + city + share-slot (Phase 4)

lib/
├── videos.ts                      # CURATED_VIDEOS = [...] as const
├── rooms.ts                       # findOrCreateCityRoom(city) helper (server-only)
└── room-client.ts                 # types: SyncPlay, SyncPause, SyncSeek, Heartbeat, SyncCorrect, ChatMsg

hooks/
├── usePresence.ts                 # subscribes to channel, returns participants + host
└── useRoomSync.ts                 # subscribes to broadcast events, drives Player; sends heartbeats
```

### `findOrCreateCityRoom(city)` sketch (server-only, used by signup action and room route)

```typescript
import { createAdminClient } from '@/lib/supabase/admin';

export async function findOrCreateCityRoom(city: string | null): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const cityKey = city ?? 'GLOBAL'; // null detected city falls back to a single global room

  // Try to find existing active city room
  const existing = await supabase
    .from('rooms')
    .select('id')
    .eq('type', 'city')
    .eq('city', cityKey)
    .eq('is_active', true)
    .maybeSingle();

  if (existing.data) return { id: existing.data.id };

  // Create with youtube_video_id = NULL — host picks first
  const created = await supabase
    .from('rooms')
    .insert({ type: 'city', city: cityKey, is_active: true })
    .select('id')
    .single();

  if (created.error || !created.data) throw new Error('city room create failed');
  return { id: created.data.id };
}
```

### Cookie set in signup action (after successful insert and before redirect)

```typescript
import { cookies } from 'next/headers';
const c = await cookies();
c.set('yp_session', insertedRow.id, {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30d
});
```

### Sync event types

```typescript
type SyncPlay     = { type: 'sync_play';    timestamp: number };          // host time in seconds
type SyncPause    = { type: 'sync_pause';   timestamp: number };
type SyncSeek     = { type: 'sync_seek';    timestamp: number };
type Heartbeat    = { type: 'heartbeat';    user_id: string; currentTime: number; sentAt: number };
type SyncCorrect  = { type: 'sync_correct'; target_user_id: string; timestamp: number };
type ChatMsg      = { type: 'chat';         user: string; text: string; timestamp: number };
type Reaction     = { type: 'reaction';     user: string; emoji: string };  // Phase 7
```

### Realtime channel wiring (sketch)

```typescript
// in RoomClient.tsx
const channel = supabase.channel(`room:${roomId}`, { config: { presence: { key: signupId } } });

channel
  .on('presence', { event: 'sync' }, () => setParticipants(channel.presenceState()))
  .on('broadcast', { event: 'sync_play' }, ({ payload }) => player.playAt(payload.timestamp))
  .on('broadcast', { event: 'sync_pause' }, ({ payload }) => player.pauseAt(payload.timestamp))
  .on('broadcast', { event: 'sync_seek' }, ({ payload }) => player.seekTo(payload.timestamp))
  .on('broadcast', { event: 'sync_correct' }, ({ payload }) => {
    if (payload.target_user_id !== signupId) return;
    player.seekTo(payload.timestamp);
  })
  .on('broadcast', { event: 'chat' }, ({ payload }) => setMessages((m) => [...m, payload]))
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id: signupId, name, city, joined_at: Date.now() });
    }
  });
```

### Host election (client-side derivation)

```typescript
const host = useMemo(() => {
  const arr = Object.values(participants).flat();
  return arr.sort((a, b) => (a.joined_at - b.joined_at) || a.user_id.localeCompare(b.user_id))[0];
}, [participants]);
const isHost = host?.user_id === signupId;
```

### Mobile vs desktop layout heuristic

- Use Tailwind's `md:` breakpoint (768px). Below = mobile bottom sheet; ≥ md = sidebar.
- Player aspect ratio: 16:9, max-width clamped at room width.
- Header always pinned: pulse + city + count + (share slot for Phase 4 + chat-toggle on mobile).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/globals.css` — `pulse-dot` (live indicator already in use on the room placeholder header), `font-display` / `font-mono` helpers, `--accent` (yellow) / `--live` (green) / `--ink-*` palette. Reuse for host badge, on-air banner, chat send button.
- `lib/supabase/{server,admin,client}.ts` — server reads via `createClient()`/`createAdminClient()`; browser via `createBrowserClient()`. Realtime needs the **browser client** in `RoomClient.tsx`.
- `lib/geo.ts` `getDetectedCity()` — used by signup action to resolve city before find-or-create.
- `app/room/[id]/page.tsx` — current placeholder; salvage the broadcast header pattern (pulse + "On Air" mono tag + back link).

### Established Patterns
- `'use server'` actions in `app/actions/*.ts` for mutations (signup pattern; will add `pickVideo(roomId, videoId)` similarly if not handled via client-side write).
- Server components fetch then pass plain props to a `'use client'` child — same pattern Phase 2 used for the signup form.
- All server-side Supabase mutations use the **service-role admin client** (Plan 02-02 Rule-3 pivot) since RLS is enabled. Phase 3 `findOrCreateCityRoom` and `rooms.youtube_video_id` updates follow the same pattern.
- File naming: kebab-case for files in `lib/`, PascalCase for components.

### Integration Points
- `app/actions/signup.ts` — both fresh-signup (line 106) and duplicate-phone (line 93) redirects move from `/room/{signups.id}` to `/room/{rooms.id}` via `findOrCreateCityRoom(city)`. Cookie set just before redirect.
- `supabase/migrations/0001_init.sql` — no schema migration in this phase. `rooms.youtube_video_id` is already nullable; `rooms.host_id` deliberately not added (D-309).
- `package.json` — adds `react-youtube` dependency.
- `next.config.ts` — no changes expected (YouTube IFrame doesn't require remotePatterns since it loads via iframe, not next/image).

</code_context>

<deferred>
## Deferred Ideas

Captured from discussion but explicitly out of scope for Phase 3 (and v1 unless noted):

- **Private/invite-only rooms** → Phase 6 (REQ-SQUAD-ROOM, already on roadmap).
- **User-created public rooms with custom topics/headings** → new capability beyond REQ-CITY-ROOM and REQ-SQUAD-ROOM. Adds room-discovery UX, topic schema, moderation surface (banned by D-014). Backlog candidate for v2.
- **User-set room location** (override detected city) → explicitly rejected in Phase 2 (`02-CONTEXT.md` D decision: city is server-authoritative to prevent leaderboard-gaming). Reaffirmed.
- **Multi-video curated playlist with auto-advance** → schema is single `youtube_video_id` per room (D-010). Multi-video playlist + queue UI is v2.
- **Topic-based room discovery / search** → no discovery surface in v1 (signup auto-routes to detected city; URLs are shared via WhatsApp). v2.
- **Persisted chat history (`messages` table)** → ephemeral broadcast-only in v1 (D-319). If demos surface a need for retention, add in v2 with a TTL-truncated table.
- **Aggressive host-disconnect recovery** (faster than presence timeout) → trust Supabase presence in v1 (D-311). Revisit if hackathon demo shows a noticeable host-drop hang.
- **Host-claim button when room is host-less** → not needed; presence re-election handles it.
- **Spectator/read-only mode for unauthed visitors** → users always go through signup gate (D-308) since signup is the success metric.
- **Reactions** → Phase 7 (REQ-REACTIONS, already on roadmap).
- **WhatsApp share button on the room** → Phase 4 (REQ-WHATSAPP-SHARE). Phase 3 leaves a header slot for it.
- **Live signup counter / leaderboard widget on the room** → Phase 5 (REQ-LIVE-COUNTER / REQ-LEADERBOARD).
- **Auto-pick first video on room create** (alternate empty-state) → considered, rejected. We chose D-317 "wait for host pick" instead.

</deferred>

---

*Phase: 03-city-watch-room*
*Context gathered: 2026-04-27 via /gsd-discuss-phase 3*
