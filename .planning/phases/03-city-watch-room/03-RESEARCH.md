# Phase 3: City Watch Room - Research

**Researched:** 2026-04-27
**Domain:** Supabase Realtime (presence + broadcast) + react-youtube + Next.js 15 App Router
**Confidence:** HIGH on Realtime / react-youtube APIs; MEDIUM on exact presence-leave timeout (Supabase docs do not publish a precise number — empirically ~15-30s after the last missed heartbeat).

## Summary

Phase 3 turns the placeholder room into a synchronized YouTube watch party. The architecture is: a server component at `app/room/[id]/page.tsx` reads the `yp_session` cookie, fetches `signups` + `rooms` rows via the service-role admin client, and hands a single `<RoomClient>` client component everything it needs as plain props. `<RoomClient>` opens **one** Supabase Realtime channel — `room:{roomId}` — and uses **broadcast** for sync events + chat (low-latency pub/sub, no DB write) and **presence** for the participant list (host election is a pure derivation over `presenceState()`). The YouTube layer is `react-youtube@10.1.0`, controlled imperatively via the player ref captured in `onReady` (`event.target`). Drift correction is local-only: every client sends its `currentTime` every 5s; only the elected host runs the diff and replies `sync_correct` to a single client when `|host.currentTime − client.currentTime| > 2`.

Three things make or break this phase: (1) **opening the channel exactly once per mount** despite React 19 StrictMode double-invocation, (2) **suppressing self-triggered sync loops** when a host's own `seekTo` callback re-fires `onStateChange`, and (3) **handling the host-disconnect "frozen" window** gracefully (the spec accepts ~15-30s of frozen playback during re-election). Everything else — chat, presence, video picker, mobile sheet — is straightforward UI work.

**Primary recommendation:** Build two custom hooks (`usePresence`, `useRoomSync`), keep all sync state inside them, and treat the player as a "dumb" imperative target. Plan ~6-8h: 2h scaffolding + finder helper, 2h sync hook + drift logic, 1.5h chat + presence UI, 1h video picker, 1h polish & testing.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Room URL & city-room resolution (D-301..D-304)**
- `/room/[id]` resolves by `rooms.id` (NOT `signups.id`).
- Signup action does **find-or-create** on the `rooms` row for the user's detected `signups.city` (`type='city'`, `is_active=true`) and redirects to `/room/{room.id}` — same path for fresh signup and idempotent duplicate-phone.
- Anyone with the URL can join a city room (no city-locked redirect).
- `app/actions/signup.ts:93` and `:106` must change to `/room/{rooms.id}` via a `findOrCreateCityRoom(city)` helper. Update Phase 2 cross-references.

**Identity carry from signup → room (D-305..D-308)**
- HTTP-only cookie `yp_session={signupId}`, `SameSite=Lax`, `Secure` (in prod), `Path=/`, `maxAge: 60*60*24*30`. Set just before redirect in the signup action.
- `/room/[id]` is a server component — read `yp_session` cookie → fetch `name, city` from `signups` → pass to `<RoomClient>` as plain props.
- Client uses `{user_id: signupId, name, city}` for `channel.track()` and as `chat` event sender.
- Unauthed visitor (no/stale cookie) → server-side redirect to `/signup?next=/room/{id}`. Signup action reads `next` and redirects there on success **only if** it matches `^/room/[0-9a-f-]{36}$`.

**Host election & disconnect handling (D-309..D-313)**
- **No `host_id` column.** Every client computes `host = participants.sort((a,b) => a.joined_at - b.joined_at)[0]`; ties broken by `signup_id` lex sort. Re-election fires automatically on every presence event.
- Track `joined_at` via Supabase presence metadata: `channel.track({ user_id, name, city, joined_at: Date.now() })`.
- On host disconnect, trust Supabase Realtime presence timeout (~15-30s) to fire untrack. During the window, no client is host → playback freezes for everyone. Documented as known limitation; acceptable for hackathon scale.
- Host visual indicator — small badge in presence list (e.g., `◆` glyph or `HOST` mono-uppercase tag) using `--accent` color from `app/globals.css`. No top banner.
- Host-only UI exposes: play/pause/seek (passed through react-youtube `onStateChange`/`getCurrentTime` API), and "Change video" button. Non-hosts see passive player (no controls overlay; YouTube IFrame `controls=0`).

**Video picker & curated list (D-314..D-318)**
- Curated list at `lib/videos.ts` as a hardcoded TS const. No schema, no admin panel.
- Active todo "Source curated Habuild YouTube video IDs" — content work; planner can stub with placeholder IDs.
- Host swap UX — "Change video" button → bottom sheet (mobile) / centered modal (desktop). Selection: (a) write `rooms.youtube_video_id = X` via Supabase, (b) broadcast `sync_play { timestamp: 0 }` after `onReady` fires for the new video.
- New rooms created with `youtube_video_id = NULL`. Placeholder UI: "{host_name} is choosing a video…" / "Waiting for {host_name} to pick a video." Host sees picker auto-opened on first arrival to a video-less room.
- Late joiner sync — read `rooms.youtube_video_id` and seek into the live timestamp once the first heartbeat from the host arrives.

**Chat (D-319..D-321)**
- **Ephemeral / broadcast-only** in v1 — no `messages` table, no schema migration.
- Chat state lives in client `useState`, fed by Supabase Realtime `chat` event subscription.
- Mobile = bottom sheet (~60% viewport height); desktop = right-side sidebar (~320px).

**Presence list (D-322..D-323)**
- Always-visible chip-row in room header (mobile: horizontal scroll); tap-to-expand full list.
- Each row: `{name} · {city}` plus host badge. Live count: "{N} people from {city} watching right now" — uses the room's city, not the viewer's.

**Sync protocol (D-324..D-326)**
- `react-youtube` (D-007 locked). Add to `package.json` this phase.
- Heartbeat: every client sends `heartbeat { user_id, currentTime, sentAt }` every 5s on its room channel; only the host computes drift `|hostTime − clientTime| > 2` and replies with `sync_correct { target_user_id, timestamp }`. Clients filter on receipt: `if (msg.target_user_id !== self.user_id) return`.
- Sync events use Supabase Realtime **broadcast** (not presence) on `room:{roomId}` channel.

### Claude's Discretion
- Exact YouTube IFrame option flags (recommend `controls: 0` for non-hosts, `controls: 1` for hosts; `disablekb: 1` always; `rel: 0`)
- Exact bottom-sheet implementation (vanilla CSS transform recommended — no library install)
- Animation timing for presence-list updates / host-badge transitions
- Empty-state illustration vs text-only for "waiting for host" placeholder
- Whether to extract `usePresence(channel)` and `useSync(channel, isHost)` hooks (recommend hooks for readability)
- Loading skeleton between mount and first presence sync
- Error/disconnect UI (e.g., "Reconnecting…" banner if Realtime drops)

### Deferred Ideas (OUT OF SCOPE)
- Private/invite-only rooms → Phase 6
- User-created public rooms with custom topics/headings → v2 / not v1
- User-set room location (override detected city) → reaffirmed rejected
- Multi-video curated playlist with auto-advance → v2
- Topic-based room discovery / search → v2
- Persisted chat history (`messages` table) → v2 with TTL truncation
- Aggressive host-disconnect recovery faster than presence timeout → trust Supabase in v1
- Host-claim button when room is host-less → not needed; presence re-election handles it
- Spectator/read-only mode for unauthed visitors → users always go through signup gate
- Reactions → Phase 7
- WhatsApp share button on the room → Phase 4 (leave a header slot)
- Live signup counter / leaderboard widget on the room → Phase 5
- Auto-pick first video on room create → rejected; "wait for host pick" instead
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-CITY-ROOM | One auto-created public room per detected city; users land here after signup. Page renders synced YouTube + chat + presence; "{N} people from {city} watching" header; "Invite Friends on WhatsApp" CTA always visible (slot only this phase). | §6 `findOrCreateCityRoom`, §5 server component pattern. |
| REQ-ROOM-SYNC | Host-controlled `sync_play | sync_pause | sync_seek`; clients heartbeat every 5s; host issues `sync_correct` on drift > 2s. First joiner = host; transfers on leave. | §1 broadcast semantics, §3 drift logic, §4 host election. |
| REQ-CHAT | `chat` event broadcast `{user, text, timestamp}`; mobile bottom-sheet, desktop sidebar; chronological order with sender name. | §1 broadcast self-flag, §7 sheet/sidebar pattern. |
| REQ-PRESENCE | `track({user_id, name, city})` on join, untrack on leave; live count + participant list visible. | §1 presence events, §4 presence-derived host. |
| REQ-CONTENT-LIST | Host UI exposes curated list; selecting sets `rooms.youtube_video_id` and broadcasts state; no free-form URL. | §2 react-youtube `loadVideoById` flow, locked decision D-314..D-318. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Identity hydration (read cookie, fetch signup row) | Frontend Server (RSC) | — | Cookie is HTTP-only; only the server can read it. Single round trip; no client-side auth library needed. |
| Find-or-create city room | API / Server Action | Database | Server-only mutation; service-role admin client (Plan 02-02 Rule-3 pivot); race-safe via UNIQUE-constraint pattern. |
| Realtime channel (sync, chat, presence) | Browser / Client | Supabase Realtime (managed) | Channels are pure pub/sub on the client; the server is not in the loop. |
| YouTube playback | Browser / Client | YouTube IFrame (external) | `react-youtube` is client-only; player methods are imperative ref calls. |
| Drift detection | Browser / Client (host only) | — | Pure local computation over heartbeat broadcasts; no server compute. |
| Video selection persistence | API / Server Action OR Client | Database | Either pattern works; recommendation in §6: write `rooms.youtube_video_id` via the **client** Supabase write (anon key on a row that has no RLS write policy → must use a server action). Choose server action to keep RLS posture consistent with Phase 2. |
| Chat | Browser / Client | Supabase Realtime broadcast | Ephemeral pub/sub only; no DB write. |
| Bottom sheet / sidebar layout | Browser / Client | — | Tailwind responsive classes; no JS library. |

**Why this matters for the planner:** Tasks should not put any sync/chat/presence logic on the server. The server's only jobs are: cookie read, signup/room fetch, find-or-create, and (recommended) the `pickVideo` server action. Everything else lives in `<RoomClient>` and the two hooks.

---

## §1 — Supabase Realtime: channels, presence, broadcast

### Channel lifecycle in a Next.js 15 client component

`supabase.channel('room:{id}')` returns a channel object. `.subscribe()` opens the WebSocket subscription. **You must `removeChannel(channel)` on unmount** or you'll leak channels across hot reloads and StrictMode double-mounts.

The canonical effect:

```typescript
'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

useEffect(() => {
  const supabase = createClient();
  const channel = supabase.channel(`room:${roomId}`, {
    config: {
      presence: { key: signupId },
      broadcast: { self: false },  // we DON'T want to receive our own broadcasts
    },
  });

  channel
    .on('presence', { event: 'sync' }, () => setParticipants(channel.presenceState()))
    .on('broadcast', { event: 'sync_play' }, ({ payload }) => playerRef.current?.seekTo(payload.timestamp, true))
    // ...
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: signupId, name, city, joined_at: Date.now() });
      }
    });

  return () => {
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };
}, [roomId, signupId]);
```

[VERIFIED: Supabase Realtime Broadcast docs] — `broadcast.self` defaults to `false`. Default is what we want for sync events (host doesn't need its own echo) and what we want for chat too — we'll optimistically append the host/client's own message to local state on send, not wait for the round trip. This avoids one-frame flicker.

[CITED: Supabase Realtime Presence docs] — Three events: `sync` (full presence state updated), `join` (client started tracking), `leave` (client stopped tracking). For host election we only care about `sync` — derive everything from `presenceState()` after each sync.

### React 19 StrictMode and double-mount

Next.js 15 dev mode enables React 19 StrictMode by default → effects fire twice in dev. The cleanup function above handles this correctly: the first cleanup unsubscribes the first channel before the second mount creates a new one. **Do not** memoize the channel outside the effect; recreate it each mount.

### `broadcast: { self: false }` semantics — verified

- Default is `false`: sender does **not** receive its own broadcast. Confirmed via Supabase docs and `realtime` source.
- Set to `true` only if the sender wants ack/echo. We don't need this — host sends `sync_play`, host's player is already playing locally; non-hosts receive it; everyone is in sync.
- For chat, prefer `self: false` + optimistic local append on send (UX: zero perceived latency; no flicker on round trip).

### Presence timeout / host-disconnect window

Heartbeat default: **25 seconds** (`heartbeatIntervalMs: 25000`, configurable). [VERIFIED: Supabase troubleshooting docs — Understanding and Monitoring Realtime Heartbeats]

After a missed heartbeat the server marks the client as gone; `presence_diff` with `leaves` fires for other clients. **Supabase does not publish a precise "leave timeout" number**; community discussions and observed behavior put it in the **15-30 second** range after the last successful heartbeat. The hackathon CONTEXT (D-311) explicitly accepts this as the host-frozen window.

**Hackathon implications:**
- The 5-second app-level heartbeat in our sync protocol is **not** the same as Phoenix's WS heartbeat — ours is a `broadcast` event we send manually for drift detection.
- A backgrounded mobile tab will likely have its WebSocket killed by the OS within 30s. On return, `realtime-js` auto-reconnects with exponential backoff (1s, 2s, 5s, 10s). Track will need to be re-issued — see "reconnect handling" below.
- **Optional optimization:** pass `realtime: { params: { eventsPerSecond: 10 } }` to `createBrowserClient` to throttle our 5s heartbeats well within free-tier limits. Free tier permits 10 messages/sec/channel; we send ~0.2 msg/sec heartbeat per client + chat bursts. Default is fine; only add this if a single city room sustains 100+ participants.
- **Optional resilience:** pass `realtime: { worker: true }` to the client so the WS lives in a Web Worker, dodging tab-throttling in some browsers. Not required for hackathon scale; document as a follow-up if presence flapping appears in demo. [CITED: Supabase Realtime troubleshooting]

### Reconnect handling

`realtime-js` auto-reconnects on transient drops; the `subscribe` callback fires again with `'SUBSCRIBED'` after re-establishment. **Track is not auto-restored** — re-issue `channel.track({...})` inside the `if (status === 'SUBSCRIBED')` block (not just on first subscribe). Otherwise on reconnect, other clients won't see this user in presence.

### Event ordering guarantees

Per Supabase Realtime: messages are delivered **FIFO per sender** within a single channel; cross-sender ordering is not guaranteed. For our protocol this is fine:
- `sync_play/pause/seek` — only the host sends these, so per-sender FIFO suffices.
- `heartbeat` — clients only send their own; host receives them out-of-order across clients but that's expected (they're independent streams).
- `chat` — cross-sender ordering doesn't matter at human pace; render in receipt order. (Add `timestamp` payload field for tie-breaking — locked already.)

### Realtime config to pass at client creation

```typescript
// In lib/supabase/client.ts — leave as-is. The default browserClient is fine.
// If presence flapping shows up in testing, switch to:
//   createBrowserClient(url, key, { realtime: { worker: true } })
```

[CITED: https://supabase.com/docs/guides/realtime/broadcast]
[CITED: https://supabase.com/docs/guides/realtime/presence]
[CITED: https://supabase.com/docs/guides/troubleshooting/realtime-heartbeat-messages]

---

## §2 — react-youtube + Next.js 15

### Required client boundary

`react-youtube` is **client-only** — it renders an `<iframe>` and attaches IFrame API listeners. Any component importing it must have `'use client'` at the top. Use it inside `<RoomClient>` or a child that's already a client component.

### Imperative control via the player ref

The player instance is exposed via `event.target` in the `onReady` handler. Capture it once into a `useRef`:

```typescript
'use client';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';
import { useRef } from 'react';

const playerRef = useRef<YouTubePlayer | null>(null);

const onReady = (e: YouTubeEvent) => {
  playerRef.current = e.target;
  // Late joiner: seek into live timestamp using lastHostHeartbeat.currentTime
  if (lastHostHeartbeat) {
    e.target.seekTo(lastHostHeartbeat.currentTime + 0.3, true); // small lookahead for buffering
    e.target.playVideo();
  }
};
```

[VERIFIED: react-youtube README on github.com/tjallingt/react-youtube] — `event.target` exposes `playVideo()`, `pauseVideo()`, `seekTo(seconds, allowSeekAhead)`, `getCurrentTime()`, `getPlayerState()`, `loadVideoById(videoId)`, plus `mute()/unMute()/getVolume()/setVolume()`.

### Player state codes (`YT.PlayerState`)

| Code | Constant | Meaning |
|------|----------|---------|
| -1 | UNSTARTED | Initial state before first play |
| 0 | ENDED | Video reached end |
| 1 | PLAYING | Currently playing |
| 2 | PAUSED | Paused |
| 3 | BUFFERING | Buffering |
| 5 | CUED | Cued and ready |

`onStateChange` fires on every transition. We use this only on the host:

```typescript
const onStateChange = (e: YouTubeEvent<number>) => {
  if (!isHost) return;
  if (suppressNextEvent.current) { suppressNextEvent.current = false; return; }
  const ts = playerRef.current?.getCurrentTime() ?? 0;
  if (e.data === 1) channel.send({ type: 'broadcast', event: 'sync_play', payload: { timestamp: ts } });
  if (e.data === 2) channel.send({ type: 'broadcast', event: 'sync_pause', payload: { timestamp: ts } });
};
```

### Loading new video on host swap

Two options:
1. **Re-render with new `videoId` prop** — react-youtube will tear down and recreate the iframe. Simpler. `onReady` fires again. **Use this.**
2. **Imperative `loadVideoById(newId)`** — keeps the iframe; faster transition. More moving parts (have to manually reset internal state).

**Recommendation:** prop-driven. Bind `videoId={room.youtube_video_id}` and let the host swap flow update local state → re-render → new player.

### `opts` configuration

```typescript
const HOST_OPTS = {
  width: '100%',
  height: '100%',
  playerVars: {
    controls: 1,        // host can scrub
    disablekb: 1,       // disable keyboard shortcuts so 'k'/space don't fight host UI
    rel: 0,             // no related videos at end
    modestbranding: 1,  // less YT branding
    playsinline: 1,     // mobile inline playback (iOS won't full-screen)
  },
};

const VIEWER_OPTS = {
  ...HOST_OPTS,
  playerVars: {
    ...HOST_OPTS.playerVars,
    controls: 0,        // hide controls entirely for non-hosts
  },
};
```

**Wrap the iframe in a 16:9 aspect-ratio container** (Tailwind: `aspect-video`) so the `width/height: 100%` fills correctly. react-youtube's wrapper div doesn't enforce aspect ratio.

### SSR / server component caveats

Next.js 15 server components must not import react-youtube directly. The `<Player>` wrapper in `components/room/Player.tsx` should declare `'use client'`. The room page itself is a server component but `<RoomClient>` (its only child) is a client component, so this is automatic.

[CITED: https://github.com/tjallingt/react-youtube]
[CITED: https://developers.google.com/youtube/iframe_api_reference]

---

## §3 — Drift detection & sync_correct

### Compute drift cleanly without a sync loop

The simplest, hackathon-correct algorithm:

```typescript
// Inside useRoomSync, host-only:
channel.on('broadcast', { event: 'heartbeat' }, ({ payload }) => {
  if (!isHost) return;
  const hostTime = playerRef.current?.getCurrentTime() ?? 0;
  const drift = Math.abs(hostTime - payload.currentTime);
  if (drift > 2) {
    channel.send({
      type: 'broadcast',
      event: 'sync_correct',
      payload: { target_user_id: payload.user_id, timestamp: hostTime + 0.3 }, // +0.3s lookahead for network latency
    });
  }
});
```

The **+0.3s lookahead** compensates for the round-trip time between `host.getCurrentTime()` and the client's `seekTo`. Without it, the corrected client immediately drifts again because by the time their seek lands, the host has moved 0.2-0.5s further. Tunable; 0.3s is a sane default for 4G mobile.

### Server-time vs client-time

**Don't use server time.** A simple wallclock comparison (`hostTime` vs `clientTime` taken at roughly the same moment) is fine for a 2-second drift budget. The actual transit time of the heartbeat (~50-300ms on 4G) is well under our threshold and the lookahead absorbs it. Bringing in `Date.now()` synchronization adds complexity for no measurable accuracy gain in this regime.

### Avoiding sync-correct loops

Three traps:

1. **Host's own `seekTo` re-fires `onStateChange`.** Set a `suppressNextEvent` flag inside the host's `seekTo` handler (it transitions PLAYING→BUFFERING→PLAYING). Only suppress for one transition. The pattern in §2 above shows the flag.

2. **Client receiving `sync_correct` calls `seekTo`, which transitions BUFFERING.** Non-hosts ignore `onStateChange` entirely (`if (!isHost) return`), so this is naturally suppressed.

3. **Heartbeat fires while a client is mid-correction.** Add a 1-second cooldown after a client receives `sync_correct`: skip the next heartbeat. Otherwise the client reports a still-stale `currentTime` (its seek hasn't completed), the host triggers another correction, repeat.

```typescript
const correctionCooldownUntil = useRef(0);

channel.on('broadcast', { event: 'sync_correct' }, ({ payload }) => {
  if (payload.target_user_id !== signupId) return;
  playerRef.current?.seekTo(payload.timestamp, true);
  correctionCooldownUntil.current = Date.now() + 1000;
});

// In the 5s heartbeat interval:
if (Date.now() < correctionCooldownUntil.current) return;
channel.send({ type: 'broadcast', event: 'heartbeat', payload: {...} });
```

### Late-joiner timestamp seek

A new joiner needs the current play position. Two options:

1. **Wait for first heartbeat from host** (≤5s wait): cache `lastHostHeartbeat = { currentTime, sentAt }`; on `onReady`, seek to `lastHostHeartbeat.currentTime + (Date.now() - lastHostHeartbeat.sentAt)/1000 + 0.3`.

2. **Host sends a `sync_play` to the new joiner on `presence join`:** more proactive; tighter UX. Host detects `presence` event = join, sees the new user's `user_id`, sends a targeted `sync_play { timestamp: hostCurrentTime, target_user_id: newId }`. Add `target_user_id` field to the type.

**Recommendation:** Option 1. Simpler. 5s of "loading…" UX is acceptable and the heartbeat naturally drives convergence. Option 2 is a v2 polish.

---

## §4 — Host election with presence

### Deterministic computation across all clients

`channel.presenceState()` returns an object keyed by presence-key (`signupId` per our config) → array of metas (one per active subscription from that key). Flatten and sort:

```typescript
type Participant = { user_id: string; name: string; city: string; joined_at: number };

const participants = useMemo(() => {
  const state = channel.presenceState<Participant>();
  return Object.values(state).flat();
}, [presenceVersion]); // presenceVersion bumps on every 'sync' event

const host = useMemo(() => {
  if (participants.length === 0) return null;
  return [...participants].sort(
    (a, b) => (a.joined_at - b.joined_at) || a.user_id.localeCompare(b.user_id)
  )[0];
}, [participants]);

const isHost = host?.user_id === signupId;
```

The sort is **deterministic across clients** because every client sees the same `joined_at` (it was written by the original tracker into shared presence state). Tie-break by `user_id` lex sort — also deterministic.

### When does a late joiner know the host?

After `subscribe()` completes with status `SUBSCRIBED`, the very next `presence` event will be `sync` with the **full** state including the new joiner themselves. So: subscribe → track → sync fires → host is computed. Total: <1 second on a stable network.

### Race conditions to be aware of

1. **The tracking client briefly thinks they're the only participant.** Between `SUBSCRIBED` and the first `sync` (which includes their own track + everyone else's), `presenceState()` may return only themselves. Don't gate UI on `participants.length > 0` — gate on having received at least one `sync` event after track. Use a `presenceReady` boolean:
   ```typescript
   const [presenceReady, setPresenceReady] = useState(false);
   channel.on('presence', { event: 'sync' }, () => {
     setParticipants(channel.presenceState());
     setPresenceReady(true);
   });
   ```

2. **Host changes mid-event-processing.** A user who was host at the time `sync_play` was sent could leave before the broadcast arrives. Clients should **not** validate broadcasts against the current host — just trust them. The locked protocol assumes "host == sender" and the rapid re-election handles the rest.

3. **Two clients simultaneously think they're host during transition.** Both sort to the same answer because joined_at is shared, so this is impossible *except* during the leave-timeout window (during which the old host is still in presence state). Acceptable per D-311.

---

## §5 — Next.js 15 server component patterns for `/room/[id]`

### Reading cookies and params (async)

```typescript
// app/room/[id]/page.tsx
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import RoomClient from './RoomClient';

type Params = Promise<{ id: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RoomPage({ params }: { params: Params }) {
  const { id: roomId } = await params;
  if (!UUID_RE.test(roomId)) notFound();

  const cookieStore = await cookies();
  const sessionId = cookieStore.get('yp_session')?.value;
  if (!sessionId || !UUID_RE.test(sessionId)) {
    redirect(`/signup?next=${encodeURIComponent(`/room/${roomId}`)}`);
  }

  const supabase = createAdminClient();

  const [{ data: signup }, { data: room }] = await Promise.all([
    supabase.from('signups').select('id, name, city').eq('id', sessionId).maybeSingle(),
    supabase.from('rooms').select('id, type, city, youtube_video_id, is_active').eq('id', roomId).maybeSingle(),
  ]);

  if (!signup) {
    // Stale cookie (signup row deleted) — bounce to signup
    redirect(`/signup?next=${encodeURIComponent(`/room/${roomId}`)}`);
  }
  if (!room || !room.is_active) notFound();

  return (
    <RoomClient
      signup={{ id: signup.id, name: signup.name, city: signup.city ?? '' }}
      room={{ id: room.id, type: room.type, city: room.city ?? '', youtubeVideoId: room.youtube_video_id }}
    />
  );
}
```

**Notes:**
- `Promise.all` is essential — sequential awaits double the TTFB.
- `notFound()` renders `app/not-found.tsx`; `redirect()` is a 307. Both throw control-flow signals — must be outside try/catch (same rule as signup action).
- The `next` param is whitelisted by the signup action against `^/room/[0-9a-f-]{36}$` per D-308.

### Server actions in Next.js 15: cookie + redirect

[VERIFIED: Next.js docs] In a server action, `cookies().set()` writes to the response that ships back. The subsequent `redirect()` includes those Set-Cookie headers. So:

```typescript
// In app/actions/signup.ts (after successful insert)
const c = await cookies();
c.set('yp_session', insertedRow.id, {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
});
const room = await findOrCreateCityRoom(city);
redirect(nextParam ?? `/room/${room.id}`);
```

The cookie WILL be present on the next request (the redirect target). This is the standard pattern; Phase 2's existing flow already exercises it implicitly (server actions can set cookies; only Server Components cannot — and the try/catch in `lib/supabase/server.ts` swallows the latter).

### Hydration of the client component

Pass plain JSON-serializable props. Don't try to forward the Supabase client — instantiate it fresh in the client (`createBrowserClient`) so it picks up the browser's session/anon-key state. Server data is just initial seed.

---

## §6 — `findOrCreateCityRoom(city)` pattern

### Race-safe upsert

The naive read-then-write has a race: two simultaneous first-signups for `Mumbai` could both insert. The locked schema doesn't have a UNIQUE constraint on `(type, city)` — the planner has two options:

**Option A: Add a partial UNIQUE constraint (no schema migration prohibition stated for THIS phase, but D-309 emphasizes schema preservation).**

```sql
-- supabase/migrations/0002_city_room_unique.sql
CREATE UNIQUE INDEX IF NOT EXISTS rooms_city_unique
  ON rooms(city) WHERE type = 'city' AND is_active = true;
```

Then upsert: `INSERT ... ON CONFLICT (city) WHERE type='city' AND is_active=true DO NOTHING RETURNING id`. If no row returned, follow up with a SELECT.

**Option B: Application-level "find then create" with a retry on conflict.**

```typescript
// lib/rooms.ts (server-only — uses admin client)
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export async function findOrCreateCityRoom(rawCity: string | null): Promise<{ id: string }> {
  const cityKey = (rawCity ?? 'GLOBAL').trim() || 'GLOBAL';
  const supabase = createAdminClient();

  // 1. Find existing
  const { data: existing } = await supabase
    .from('rooms')
    .select('id')
    .eq('type', 'city')
    .eq('city', cityKey)
    .eq('is_active', true)
    .maybeSingle();
  if (existing) return { id: existing.id };

  // 2. Create — youtube_video_id intentionally NULL (host picks)
  const { data: created, error } = await supabase
    .from('rooms')
    .insert({ type: 'city', city: cityKey, is_active: true })
    .select('id')
    .single();

  if (created) return { id: created.id };

  // 3. Race: another caller created concurrently. Re-read.
  if (error) {
    const { data: retry } = await supabase
      .from('rooms')
      .select('id')
      .eq('type', 'city')
      .eq('city', cityKey)
      .eq('is_active', true)
      .maybeSingle();
    if (retry) return { id: retry.id };
  }

  throw new Error(`findOrCreateCityRoom failed for city=${cityKey}`);
}
```

**Recommendation: Option B.** No schema migration; D-309's "preserve schema" principle wins; race is benign (it requires two near-simultaneous first-signups in a brand-new city, which has a measurable but tiny chance during a 48h hackathon). If the race ever fires, the retry SELECT will succeed because the other transaction has committed. **Document as known quirk:** in the unlikely event of an unhandled simultaneity, two rooms could exist for the same city — Phase 5 leaderboard groups by city not room, so this only affects which physical room the duplicate-signup user lands in.

### City normalization

Vercel Edge `geolocation()` returns city names like `"Mumbai"`, `"New Delhi"`, `"San Francisco"`. **Don't lowercase** — REQ-LANDING displays the city verbatim and `Mumbai` looks better than `mumbai` in the header. Trim whitespace only. If you need case-insensitive matching across signups, that's a Phase 5 leaderboard concern; this phase preserves casing.

**Edge case:** `null` or empty city → use a sentinel `'GLOBAL'`. All non-geolocated visitors share one room. Acceptable for hackathon; vanishingly rare on Vercel production.

### Where the helper lives

- File: `lib/rooms.ts`
- Top of file: `import 'server-only';` (errors at compile time if accidentally imported into a client component).
- Used by: (a) the signup action just before redirect, (b) anywhere a server component might need to look up the city's room (none in Phase 3, but Phase 4 share-link generator may use it).

---

## §7 — Bottom sheet / sidebar implementation

### Tailwind responsive switching, no library

The chat panel needs to be a sheet on mobile and a sidebar on desktop. Use the same DOM tree, switch CSS classes at the `md:` breakpoint:

```tsx
// components/room/Chat.tsx — sketch
<aside
  className={cn(
    // Mobile: fixed bottom sheet, transform-based open/close
    'fixed inset-x-0 bottom-0 z-40 max-h-[60vh] transform transition-transform duration-300',
    isOpen ? 'translate-y-0' : 'translate-y-full',
    'border-t border-[color:var(--line)] bg-[color:var(--bg-raised)]',
    // Desktop: anchored right sidebar, always visible
    'md:static md:inset-auto md:max-h-none md:h-full md:w-80 md:translate-y-0 md:border-l md:border-t-0',
  )}
>
  {/* Header (collapse handle on mobile only) */}
  <header className="md:hidden ...">
    <button onClick={() => setIsOpen(!isOpen)}>—</button>
  </header>
  {/* Chat list + composer */}
</aside>
```

**Why vanilla CSS over a library:**
- `framer-motion` adds ~25KB; sheet is 4 lines of CSS.
- `Headless UI Dialog` introduces focus traps — useful but overkill for an in-page panel that doesn't dim the rest of the UI.
- `Radix UI Dialog` is heavier and the install costs 2-3 minutes plus discovery time on which subcomponents you need.

**Body scroll lock when sheet is open on mobile:**

```typescript
useEffect(() => {
  if (isOpen && window.matchMedia('(max-width: 767px)').matches) {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }
}, [isOpen]);
```

Skip if the chat panel is already inside a viewport-sized layout (it's not in our case — the page has scroll).

**A11y:**
- `<aside aria-label="Room chat">`
- Composer input has `aria-label="Send a message"`.
- Escape to close on mobile: add a `keydown` listener at the panel level.
- Focus trap inside the sheet on mobile: nice-to-have, not required for hackathon. (Defer.)

### Bottom sheet for video picker

The video picker (`<VideoPickerSheet>`) reuses the same pattern but is open/dismissible (modal-like). Only renders for the host. Recommend the `<Dialog>` from `@radix-ui/react-dialog` ONLY if you're already pulling Radix in — otherwise a vanilla controlled sheet matching the chat sheet pattern is fine and saves ~15KB.

**Recommendation:** vanilla. Match the chat-sheet aesthetic (slide-up from bottom on mobile, centered modal on desktop ≥md). Backdrop is `bg-black/60` with click-to-close.

---

## §8 — Cookie set in server actions (verification)

Already verified above (§5). The pattern is:

```typescript
// In app/actions/signup.ts — to be added in this phase
const c = await cookies();
c.set('yp_session', insertedRow.id, { httpOnly: true, sameSite: 'lax', secure: production, path: '/', maxAge: 60*60*24*30 });
// Then either:
return { success: true, redirectTo: `/room/${room.id}` };  // pattern 1: client-side redirect
// Or:
redirect(`/room/${room.id}`);  // pattern 2: throw a redirect signal
```

Phase 2 used pattern 2 (`redirect()`). Stick with that. The Set-Cookie header rides on the redirect response. Verified working pattern; no caveats for our flow.

**Important:** `cookies().set()` MUST be called **before** `redirect()` because `redirect()` throws and stops execution. If you call them in the wrong order, the cookie is never written. (Already correct in the discuss-phase sketch — the planner just needs to enforce ordering.)

---

## §9 — Patterns from Phase 1 research (carried forward)

From `01-RESEARCH.md`:

- `@supabase/ssr` is the right package — already installed (`^0.10.2`). Use `createBrowserClient` in client components.
- `cookies()` and `headers()` are async in Next.js 15 — always `await`.
- Service-role admin client (`lib/supabase/admin.ts`) for server-side mutations because RLS is enabled. Already used by Phase 2 signup action.
- Realtime publication: `signups`, `rooms`, `squad_members` are already in `supabase_realtime` publication. Phase 3 doesn't need this for broadcast/presence (those are pure pub/sub) but needs it for any future `postgres_changes` subscription — none in this phase.
- Phase 1 also noted free-tier RLS gotcha: `postgres_changes` enforces RLS; broadcast/presence don't. Phase 3 uses only broadcast/presence — no RLS impact.

---

## §10 — Risks to flag for the planner

1. **Free-tier 500 concurrent realtime connections.** Documented in STATE.md. A single demo-day-viral city room exceeding this caps everyone. Mitigation: not addressed in v1; if a demo crash is feared, plan a "fail-soft" UI banner ("Reconnecting…") that shows on `subscribe` status `CHANNEL_ERROR` or `TIMED_OUT`. Add to a `usePresence` hook return type.

2. **YouTube embed availability for individual Habuild videos** (carried risk from STATE.md). The curated list seed task should validate `embed=true` per video. Detection: `onError` handler with error code 101/150 means embedding is disabled by the uploader. UI fallback: show "This video can't be played here" + "Pick another" (host) / wait for host (non-host).

3. **Backgrounded tab on mobile.** iOS Safari kills WebSockets within ~30s of backgrounding; auto-reconnect on focus. The user will appear to "leave" then "rejoin" within ~30s each way. Two implications:
   - **Re-track on every `SUBSCRIBED` callback** (not just first), or backgrounded users will appear gone forever.
   - Host-on-tab-switch causes the freeze window. Acceptable per D-311; consider a UI toast: "Host stepped away; reconnecting…"

4. **Clock drift / DST.** Heartbeat uses `Date.now()` for the `sentAt` field, but we never compare it across clients — only the host compares its own `getCurrentTime()` to the client's reported `currentTime`. Both are video-relative seconds, not wallclock. **Clock drift is a non-issue for our 2s threshold.** Document as resolved.

5. **YouTube IFrame autoplay restrictions.** Browsers block autoplay-with-sound on first interaction. The host's first `playVideo()` will fail silently if it precedes any user gesture. Mitigation: for non-hosts, the first `seekTo + playVideo` may need to start muted (`mute()` then `playVideo()`), with a "Tap to unmute" overlay. This is a real UX risk — flag it as a known gotcha; ship muted-by-default + tap-to-unmute on non-hosts.

6. **Late join with stale `lastHostHeartbeat`.** If a non-host joined while host was paused, then host plays before sending a heartbeat (within 5s), the late joiner sees stale paused state until the next sync_play arrives. Practically fine — just renders a paused player for ≤5s on join.

7. **Turbopack + react-youtube interop.** `next dev --turbopack` is enabled. react-youtube is plain JS and should be fine, but if the dev server crashes on import, fallback is `next dev` (Webpack). Likelihood: low — react-youtube has no exotic runtime hooks. Worst case, ~5min of debugging.

8. **First-mount channel subscribe in StrictMode.** As described in §1, dev-mode double-mount creates and tears down two channels rapidly. Idempotent cleanup makes this fine, but a `presence join/leave` event will briefly show "+1, -1" of the same user during dev. **Production builds don't double-mount.** No fix needed; document for the planner so they don't chase it.

9. **`broadcast.self: false` and chat optimistic update.** Because the sender doesn't receive their own broadcast, a chat composer must locally append the message to state immediately (optimistic). If you forget, the sender sees nothing happen. Codify in the `Chat` component spec.

---

## Standard Stack

### Core (already installed — verified in `package.json`)

| Library | Version | Purpose |
|---------|---------|---------|
| `next` | 15.5.15 | App Router, server components, server actions |
| `react` / `react-dom` | 19.1.0 | UI |
| `@supabase/ssr` | ^0.10.2 | Browser/server client wrappers |
| `@supabase/supabase-js` | ^2.104.1 | Realtime + REST client |
| `@vercel/functions` | ^3.4.4 | Geolocation (already used by middleware) |
| `tailwindcss` | ^4 | Styling |

### To add this phase

| Library | Version | Purpose | Verified? |
|---------|---------|---------|-----------|
| `react-youtube` | `^10.1.0` | YouTube IFrame wrapper | [VERIFIED: `npm view react-youtube version` → `10.1.0` on 2026-04-27]; peer deps: `react: >=0.14.1` (compatible with React 19) |

### Don't install

- `framer-motion` — not needed; vanilla CSS transforms suffice for the sheet/sidebar.
- `@radix-ui/react-dialog` — not needed; vanilla modal works for the video picker.
- `socket.io` / `ws` — Supabase Realtime is the locked WebSocket layer.
- `zustand` / `redux` — useState + two custom hooks suffice; the room is a single page with finite state.

**Installation command:**
```bash
npm install react-youtube
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-youtube` | Direct `<iframe src="youtube.com/embed/...">` + manual postMessage | Smaller bundle but requires writing the IFrame API wrapper ourselves. Locked decision D-007 = `react-youtube`. Don't revisit. |
| Vanilla CSS sheet | `framer-motion` `<motion.div>` | Spring physics nicer; +25KB; not worth it for hackathon. |
| Custom `useRoomSync` | Inlined logic in `<RoomClient>` | Inline = simpler; hooks = easier to reason about and test. **Recommend hooks.** |
| Server-action `pickVideo` | Client-side `supabase.from('rooms').update(...)` | Server-action keeps RLS-bypass in one place (admin client); client-side requires opening up RLS (security regression). **Use server-action.** |

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                         │
│                                                                  │
│  /room/[id] page (Server Component)                              │
│    │ reads yp_session cookie                                     │
│    │ fetches signups + rooms via admin client                    │
│    ▼                                                             │
│  <RoomClient>  (Client Component)                                │
│    │                                                             │
│    ├──► YouTube IFrame Player (react-youtube)                    │
│    │      ↑ ref.playVideo/pauseVideo/seekTo (host only)          │
│    │      ↑ onStateChange → broadcast (host)                     │
│    │      ↑ getCurrentTime → heartbeat (every client, 5s)        │
│    │                                                             │
│    ├──► usePresence(channel) hook                                │
│    │      ↑ channel.track({user_id, name, city, joined_at})      │
│    │      ↑ presenceState() → derives `host`, `participants`     │
│    │                                                             │
│    ├──► useRoomSync(channel, isHost, playerRef) hook             │
│    │      ↑ subscribe to sync_play/pause/seek/correct/heartbeat  │
│    │      ↑ host: drift detect → broadcast sync_correct          │
│    │                                                             │
│    └──► <Chat> bottom sheet (mobile) / sidebar (desktop)         │
│           ↑ subscribe to 'chat' broadcast → setMessages          │
│           ↑ composer → broadcast 'chat'                          │
│                                                                  │
└─────────────────┬────────────────────────────────────────────────┘
                  │ WebSocket
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase Realtime                                               │
│    Channel: room:{roomId}                                        │
│      • Presence: {user_id, name, city, joined_at}                │
│      • Broadcast: sync_play | sync_pause | sync_seek |           │
│                   heartbeat | sync_correct | chat                │
└──────────────────────────────────────────────────────────────────┘

                  ┌───────────────────────────────────┐
                  │  Supabase Postgres                 │
                  │    signups (read by server route)  │
                  │    rooms (read + update video_id)  │
                  └───────────────────────────────────┘
                      ↑
                      │ admin client (service role)
                      │
            findOrCreateCityRoom() in signup action
            pickVideo(roomId, videoId) server action
            /room/[id] server-component reads
```

### Recommended Project Structure (additions only)

```
app/
├── actions/
│   ├── signup.ts                  # Modified: import findOrCreateCityRoom; set yp_session cookie
│   └── pick-video.ts              # NEW: server action, host updates rooms.youtube_video_id
└── room/
    └── [id]/
        ├── page.tsx               # REPLACED: real server component
        └── RoomClient.tsx         # NEW: 'use client', orchestrator

components/
└── room/
    ├── Player.tsx                 # NEW: react-youtube wrapper
    ├── PresenceList.tsx           # NEW: chip row + expanded panel
    ├── Chat.tsx                   # NEW: sheet/sidebar
    ├── ChatComposer.tsx           # NEW: input + send button
    ├── VideoPickerSheet.tsx       # NEW: host-only modal
    ├── HostBadge.tsx              # NEW: ◆ HOST tag
    └── RoomHeader.tsx             # NEW: pulse + count + city + share-slot

lib/
├── videos.ts                      # NEW: CURATED_VIDEOS const
├── rooms.ts                       # NEW: findOrCreateCityRoom (server-only)
└── room-types.ts                  # NEW: SyncEvent union, ChatMsg, Participant types

hooks/
├── usePresence.ts                 # NEW
└── useRoomSync.ts                 # NEW
```

### Pattern 1: Single channel per mount, hooks isolate concerns

The room opens **one** channel. Two hooks subscribe to slices of it:
- `usePresence(channel)` returns `{ participants, host, isHost, presenceReady }`.
- `useRoomSync(channel, { isHost, playerRef })` handles broadcasts, drift, heartbeats; returns `{ lastHostHeartbeat }`.

The channel is created in `<RoomClient>` and passed down to both hooks. **Don't** create one channel per hook — that doubles WebSocket usage and breaks self-broadcast semantics.

### Pattern 2: Server-fetched seed + client-driven live state

Server component fetches `room.youtube_video_id` once. `<RoomClient>` keeps its own local `videoId` state initialized from props. When the host swaps videos, the local state updates immediately (optimistic), and a server-action `pickVideo` writes through to DB. Other clients hear the swap via a custom `room_video_change` broadcast (or via the existing `sync_play` with a new `videoId` field added to the payload).

**Recommendation: extend `sync_play` with optional `videoId`**:
```typescript
type SyncPlay = { type: 'sync_play'; timestamp: number; videoId?: string };
```
On receipt, if `videoId !== currentVideoId`, swap before seeking. Avoids inventing a new event type.

### Anti-Patterns to Avoid

- **Don't open the channel inside `useRoomSync` and `usePresence` separately.** One channel per room per client.
- **Don't `setState` inside the broadcast handler synchronously after `seekTo`.** The state change re-renders the player and can re-trigger `onStateChange`. Use the `suppressNextEvent` ref pattern.
- **Don't trust `participants.length` as proof of ready presence.** Wait for first `sync` event.
- **Don't write `rooms.youtube_video_id` from the client with the anon key.** RLS will block it (or worse, allow it with no auth). Use a server action.
- **Don't broadcast on every `onStateChange` from non-hosts.** Gate the handler with `if (!isHost) return` first thing.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket connection management | Custom `ws://` client + reconnect logic | `supabase.channel()` | Already locked; auto-reconnect, presence diffs, broadcast routing all built in. |
| YouTube IFrame postMessage protocol | Direct `<iframe>` + window.postMessage handlers | `react-youtube` | Locked; the wrapper handles ready/state/error events with React-friendly props. |
| Drift detection clock sync (NTP-style) | Round-trip latency averaging, server-time correction | Local heartbeat + lookahead | 2s drift budget makes precision unnecessary. Real NTP sync is a 100-line distraction. |
| Bottom sheet swipe gestures | Swipe-to-dismiss with touch events | Tap-to-toggle | Hackathon scope; touch gestures eat hours and don't move conversion. |
| Chat persistence with optimistic UI | TanStack Query mutations | `useState` + broadcast subscribe | D-319: ephemeral. No persistence = no cache invalidation = no library. |
| Host election consensus algorithm (Raft, etc.) | Distributed consensus | Pure derivation over presence state | Presence is the source of truth; no consensus protocol needed. |

**Key insight:** Everything in this phase that *feels* hard (sync, presence, host election) is solvable as a pure function over a shared event stream. The hard problem is "open the channel exactly once and clean it up." Get that right; the rest is wiring.

---

## Common Pitfalls

### Pitfall 1: Channel leaked across StrictMode double-mount or hot-reload
**What goes wrong:** Two channels subscribed; user appears twice in presence; broadcasts arrive duplicated.
**Why it happens:** `useEffect` cleanup not implemented or doesn't `removeChannel`.
**How to avoid:** Always pair `subscribe()` with `unsubscribe() + removeChannel()` in the cleanup function. Even in dev mode with StrictMode, this is correct.
**Warning signs:** Presence count flickers; "X joined" toasts duplicate; chat messages echo twice.

### Pitfall 2: Forgetting `await cookies()` / `await params`
**What goes wrong:** Server component throws "params should be awaited" or "cookies() should be awaited" at runtime.
**Why it happens:** Next.js 15's async dynamic APIs.
**How to avoid:** `const { id } = await params; const c = await cookies();` always.
**Warning signs:** Turbopack runtime error.

### Pitfall 3: Sync correction loop
**What goes wrong:** Host corrects client A; A seeks; A's next heartbeat reports stale time (seek not complete); host corrects again; loop.
**How to avoid:** 1-second cooldown on the client after receiving `sync_correct` (skip the next heartbeat). +0.3s lookahead on the host's `sync_correct` payload.
**Warning signs:** Client A's player seeks every 5 seconds; CPU spike on client; log shows repeated correction messages.

### Pitfall 4: Self-triggered broadcast on host's seek
**What goes wrong:** Host scrubs the player; player fires `onStateChange` → broadcasts `sync_seek`; host's own seek handler triggers another state change → another broadcast → ad infinitum.
**How to avoid:** With `broadcast.self: false`, the host doesn't receive their own broadcast — but the YouTube state-change event is still local. Use a `suppressNextEvent` ref: when the host programmatically seeks, set the ref true; the next `onStateChange` reads and resets it without broadcasting.
**Warning signs:** Network panel shows continuous `sync_seek` broadcasts during host scrub.

### Pitfall 5: Missing `aspect-video` wrapper on the player
**What goes wrong:** Player collapses to 0px height because `width/height: 100%` has no parent dimensions.
**How to avoid:** Wrap `<YouTube>` in `<div className="aspect-video w-full">`. Tailwind v4 supports `aspect-video` natively (16:9).
**Warning signs:** Iframe is in the DOM but invisible.

### Pitfall 6: Cookie not set on redirect from signup action
**What goes wrong:** User redirected to `/room/{id}` but `yp_session` cookie missing → bounced back to `/signup`.
**How to avoid:** Call `cookies().set(...)` BEFORE `redirect(...)`. `redirect` throws — anything after it is dead code.
**Warning signs:** Infinite redirect loop signup → room → signup.

### Pitfall 7: `presence.track()` not re-issued on reconnect
**What goes wrong:** User backgrounds tab → WS dies → reconnects → user no longer in presence list anywhere.
**How to avoid:** Inside the `subscribe` callback, re-issue `track()` whenever status === `'SUBSCRIBED'`, not only on first call.
**Warning signs:** Mobile users disappear from presence after locking phone.

### Pitfall 8: Late joiner has stale `null` videoId
**What goes wrong:** Server-fetched `room.youtube_video_id` was NULL at SSR; host has since picked. New joiner shows "waiting for host" forever.
**How to avoid:** Have host re-broadcast current video on every `presence join` event, OR use `sync_play` payload with `videoId` field (recommended in Pattern 2 above) so the next heartbeat-driven `sync_play` carries video state.
**Warning signs:** New joiner shows placeholder while existing joiners watch the video.

### Pitfall 9: YouTube error 101 / 150 (embedding disabled)
**What goes wrong:** Curated list contains a video the uploader has marked "no embed."
**How to avoid:** Audit the list before demo. Implement `onError` handler:
```typescript
const onError = (e: YouTubeEvent<number>) => {
  if (e.data === 101 || e.data === 150) {
    setError(`This video can't be played here. ${isHost ? 'Please pick another.' : 'Waiting for host...'}`);
  }
};
```
**Warning signs:** Black player with "Video unavailable" text.

---

## Code Examples

### `lib/videos.ts`

```typescript
// Source: hardcoded curated list per D-314. Seed with placeholder IDs;
// the active todo "Source curated Habuild YouTube video IDs" fills these in pre-demo.
export type CuratedVideo = {
  id: string;          // YouTube video ID (e.g., 'dQw4w9WgXcQ')
  title: string;
  durationSec: number;
  thumbnail?: string;  // optional: YouTube thumbnail URL or local override
};

export const CURATED_VIDEOS: readonly CuratedVideo[] = [
  // TODO(content): replace with real Habuild video IDs before demo
  { id: 'PLACEHOLDER_ID_1', title: 'Morning Energizer · 10 min', durationSec: 600 },
  { id: 'PLACEHOLDER_ID_2', title: 'Stress Reset · 15 min', durationSec: 900 },
  { id: 'PLACEHOLDER_ID_3', title: 'Wind Down · 12 min', durationSec: 720 },
] as const;
```

### `lib/room-types.ts`

```typescript
export type Participant = {
  user_id: string;
  name: string;
  city: string;
  joined_at: number;
};

export type SyncPlay     = { type: 'sync_play';    timestamp: number; videoId?: string };
export type SyncPause    = { type: 'sync_pause';   timestamp: number };
export type SyncSeek     = { type: 'sync_seek';    timestamp: number };
export type Heartbeat    = { type: 'heartbeat';    user_id: string; currentTime: number; sentAt: number };
export type SyncCorrect  = { type: 'sync_correct'; target_user_id: string; timestamp: number };
export type ChatMsg      = { type: 'chat';         user: string; text: string; timestamp: number };

export type SyncEvent = SyncPlay | SyncPause | SyncSeek | Heartbeat | SyncCorrect | ChatMsg;
```

### `hooks/usePresence.ts` (sketch)

```typescript
'use client';
import { useEffect, useState, useMemo } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Participant } from '@/lib/room-types';

export function usePresence(
  channel: RealtimeChannel | null,
  selfId: string,
) {
  const [state, setState] = useState<Record<string, Participant[]>>({});
  const [presenceReady, setPresenceReady] = useState(false);

  useEffect(() => {
    if (!channel) return;
    const sub = channel.on('presence', { event: 'sync' }, () => {
      setState(channel.presenceState<Participant>() as Record<string, Participant[]>);
      setPresenceReady(true);
    });
    return () => { /* channel cleanup happens in parent */ };
  }, [channel]);

  const participants = useMemo(() => Object.values(state).flat(), [state]);
  const host = useMemo(() => {
    if (participants.length === 0) return null;
    return [...participants].sort(
      (a, b) => (a.joined_at - b.joined_at) || a.user_id.localeCompare(b.user_id),
    )[0];
  }, [participants]);
  const isHost = host?.user_id === selfId;

  return { participants, host, isHost, presenceReady, count: participants.length };
}
```

### `hooks/useRoomSync.ts` (sketch — host-side drift loop)

```typescript
'use client';
import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { YouTubePlayer } from 'react-youtube';

export function useRoomSync(
  channel: RealtimeChannel | null,
  selfId: string,
  isHost: boolean,
  playerRef: React.RefObject<YouTubePlayer | null>,
) {
  const correctionCooldownUntil = useRef(0);
  const suppressNextEvent = useRef(false);

  // Subscribe to broadcasts
  useEffect(() => {
    if (!channel) return;
    channel
      .on('broadcast', { event: 'sync_play' }, ({ payload }) => {
        if (!playerRef.current) return;
        playerRef.current.seekTo(payload.timestamp, true);
        playerRef.current.playVideo();
      })
      .on('broadcast', { event: 'sync_pause' }, ({ payload }) => {
        if (!playerRef.current) return;
        playerRef.current.seekTo(payload.timestamp, true);
        playerRef.current.pauseVideo();
      })
      .on('broadcast', { event: 'sync_seek' }, ({ payload }) => {
        playerRef.current?.seekTo(payload.timestamp, true);
      })
      .on('broadcast', { event: 'sync_correct' }, ({ payload }) => {
        if (payload.target_user_id !== selfId) return;
        playerRef.current?.seekTo(payload.timestamp, true);
        correctionCooldownUntil.current = Date.now() + 1000;
      })
      .on('broadcast', { event: 'heartbeat' }, ({ payload }) => {
        if (!isHost) return;
        const hostTime = playerRef.current?.getCurrentTime() ?? 0;
        if (Math.abs(hostTime - payload.currentTime) > 2) {
          channel.send({
            type: 'broadcast',
            event: 'sync_correct',
            payload: { target_user_id: payload.user_id, timestamp: hostTime + 0.3 },
          });
        }
      });
  }, [channel, isHost, selfId, playerRef]);

  // 5s heartbeat from this client
  useEffect(() => {
    if (!channel) return;
    const id = setInterval(() => {
      if (Date.now() < correctionCooldownUntil.current) return;
      const ct = playerRef.current?.getCurrentTime() ?? 0;
      channel.send({
        type: 'broadcast',
        event: 'heartbeat',
        payload: { user_id: selfId, currentTime: ct, sentAt: Date.now() },
      });
    }, 5000);
    return () => clearInterval(id);
  }, [channel, selfId, playerRef]);

  return { suppressNextEvent };
}
```

### `app/actions/pick-video.ts`

```typescript
'use server';
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CURATED_VIDEOS } from '@/lib/videos';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pickVideo(roomId: string, videoId: string): Promise<{ ok: true } | { error: string }> {
  if (!UUID_RE.test(roomId)) return { error: 'invalid room' };
  if (!CURATED_VIDEOS.find(v => v.id === videoId)) return { error: 'invalid video' };

  const supabase = createAdminClient();
  const { error } = await supabase.from('rooms').update({ youtube_video_id: videoId }).eq('id', roomId);
  if (error) return { error: 'update failed' };
  return { ok: true };
}
```

(Host's `<VideoPickerSheet>` calls this server action, then broadcasts `sync_play { timestamp: 0, videoId }` after `onReady` fires for the new video.)

### `<RoomClient>` skeleton

```typescript
'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePresence } from '@/hooks/usePresence';
import { useRoomSync } from '@/hooks/useRoomSync';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Props = {
  signup: { id: string; name: string; city: string };
  room:   { id: string; type: string; city: string; youtubeVideoId: string | null };
};

export default function RoomClient({ signup, room }: Props) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [videoId, setVideoId] = useState(room.youtubeVideoId);
  const playerRef = useRef<any>(null);  // YouTubePlayer

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(`room:${room.id}`, {
      config: { presence: { key: signup.id }, broadcast: { self: false } },
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ user_id: signup.id, name: signup.name, city: signup.city, joined_at: Date.now() });
      }
    });
    setChannel(ch);
    return () => { ch.unsubscribe(); supabase.removeChannel(ch); };
  }, [room.id, signup.id, signup.name, signup.city]);

  const { participants, host, isHost, presenceReady, count } = usePresence(channel, signup.id);
  useRoomSync(channel, signup.id, isHost, playerRef);

  return (
    <main>
      {/* Header: pulse + count + city + share-slot */}
      {/* Player or "waiting for host" placeholder */}
      {/* PresenceList */}
      {/* Chat (sheet/sidebar) */}
      {/* VideoPickerSheet (host-only, auto-open if videoId === null) */}
    </main>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `socket.io` for room sync | Supabase Realtime channels | Locked at hackathon start | No separate WS server to operate. |
| Server-time clock sync (NTP-style) | Local drift compare with lookahead | Industry pattern (watch-mate, etc.) | Simpler; sufficient for 2s budget. |
| Stored chat with TanStack Query | Ephemeral broadcast via `useState` | D-319 hackathon decision | No DB writes; no cache invalidation. |
| Class components for player wrappers | Imperative ref via `onReady.event.target` | react-youtube v10 API | Modern hook-friendly. |

**Deprecated/outdated:**
- `react-youtube` versions <10 used class-based ref patterns; v10 is the current LTS line.
- Browser-side direct DB writes for `rooms.youtube_video_id` (would require permissive RLS) — use server action instead.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Supabase presence-leave fires within 15-30s after a missed heartbeat | §1, §10 | Medium — if it's longer (60s+), the host-frozen window during a host disconnect feels broken. Mitigation: ship; if QA finds it sluggish, switch to a v2 plan with explicit `untrack()` on `beforeunload` event. |
| A2 | YouTube IFrame autoplay-with-sound is blocked until user interaction on mobile | §10 risk 5 | Low — well-documented browser behavior. Mitigation already specified (mute + tap-to-unmute). |
| A3 | Free-tier Supabase Realtime supports `broadcast.self: false` config option | §1 | Very low — explicit in current docs (verified). |
| A4 | `react-youtube@10.1.0` is React 19 compatible | Standard Stack | Very low — peer dep is `react: >=0.14.1`. `npm install` will surface any warning. |
| A5 | `+0.3s` lookahead is the right correction-payload offset | §3 | Low — tunable at runtime; if drift loops appear, raise to 0.5s. |
| A6 | Schema does NOT need a UNIQUE constraint on `(rooms.type, rooms.city)` | §6 | Low — race window is tiny; benign duplicate is acceptable per Phase 5 leaderboard's group-by-city approach. Document; don't migrate schema. |

---

## Open Questions

1. **Should the curated list be seeded with real video IDs in this phase, or stubbed?**
   - What we know: the seed is content work, not infra. CONTEXT D-315 explicitly says planner can stub.
   - Recommendation: stub with placeholder IDs in Phase 3; real IDs land via a content task before demo. Mark in plan TODO.

2. **Should host explicitly `untrack()` on `beforeunload`?**
   - What we know: Supabase auto-untracks on WS close, but `beforeunload` happens before WS close in some browsers, giving an explicit untrack a small head start.
   - Recommendation: add a `beforeunload` listener that calls `channel.untrack()`. Cheap; tightens the host-disconnect window from ~25s to ~5s on graceful tab close. Defer to Claude's discretion.

3. **Should the chat sheet auto-collapse when the player goes fullscreen?**
   - Not in CONTEXT. UX nice-to-have. Defer to discretion; don't block planner.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/dev | ✓ | ≥20 (already used in Phase 1/2) | — |
| Supabase project | Realtime + DB | ✓ | provisioned in Phase 1 | — |
| Vercel deployment | Hosting | ✓ | wired in Phase 1 | — |
| `react-youtube` package | Player | Pending install | 10.1.0 (npm registry, verified 2026-04-27) | None — locked decision D-007 |
| YouTube IFrame API | Runtime player | ✓ (loaded by react-youtube) | n/a | — |
| Curated YouTube video IDs | `lib/videos.ts` | ✗ — content todo | — | Stub with placeholders; demo task fills before showtime |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Real curated video IDs (placeholder stub is acceptable for development; planner should treat as a content task separate from infra tasks).

---

## Validation Architecture

> Nyquist validation defaults to enabled (no `.planning/config.json` present). This phase's testing strategy is the trickiest of any in the project because Realtime + IFrame are both notoriously hard to unit-test. The plan: lean on **typed pure functions** for the algorithmic parts and **manual two-window smoke** for the integration parts.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None currently installed. Recommend `vitest` (lightweight; works with Next.js + Tailwind v4 out of the box; fewer setup steps than Jest). |
| Config file | `vitest.config.ts` (Wave 0 task) |
| Quick run command | `npx vitest run --no-coverage` |
| Full suite command | `npx vitest run` |
| Manual smoke | Two browser windows / mobile + desktop on the deployed Vercel preview URL |

**Justification for vitest over jest:** Phase 2 shipped with no test framework; the existing repo has zero test infra (`package.json` has no `test` script). Adding vitest is a 90-second install (`npm i -D vitest`) and matches Vite/Tailwind v4 ergonomics. Jest would require `babel-jest` + Next.js transform configuration (~10min). For hackathon scope, vitest wins. Alternatively, **defer all automated tests** and ship pure manual-smoke validation. Either is acceptable; the recommendation below assumes vitest because the most fragile parts (drift logic, host election sort) are pure functions that benefit from deterministic regression coverage.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REQ-CITY-ROOM | `findOrCreateCityRoom('Mumbai')` returns same room id on second call | unit (with mocked admin client) | `npx vitest run lib/rooms.test.ts -t findOrCreate` | ❌ Wave 0 |
| REQ-CITY-ROOM | Server route redirects to /signup when cookie missing | unit (mock cookies + admin) | `npx vitest run app/room/page.test.ts` | ❌ Wave 0 (optional; Next.js route testing is fiddly — manual smoke recommended instead) |
| REQ-CITY-ROOM | Header copy renders "{N} people from {city} watching" | manual smoke | open two windows on Vercel preview; verify count increments | n/a |
| REQ-ROOM-SYNC | Host election: pure-function sort over participants returns deterministic host | unit | `npx vitest run hooks/usePresence.test.ts -t electHost` | ❌ Wave 0 |
| REQ-ROOM-SYNC | Drift detection: pure-function `shouldCorrect(hostTime, clientTime)` returns true iff `|diff| > 2` | unit | `npx vitest run hooks/useRoomSync.test.ts -t shouldCorrect` | ❌ Wave 0 |
| REQ-ROOM-SYNC | sync_play received → seekTo+playVideo called on player ref | unit (mock player) | `npx vitest run hooks/useRoomSync.test.ts -t syncPlay` | ❌ Wave 0 |
| REQ-ROOM-SYNC | Cooldown after sync_correct prevents next heartbeat for 1s | unit | `npx vitest run hooks/useRoomSync.test.ts -t cooldown` | ❌ Wave 0 |
| REQ-ROOM-SYNC | End-to-end: window A plays → window B's player seeks within 1s | manual smoke | two-window manual; observe video position via DevTools console | n/a |
| REQ-CHAT | Chat broadcast `chat` event renders in receipt order | unit (mock channel) | `npx vitest run components/room/Chat.test.tsx -t order` | ❌ Wave 0 |
| REQ-CHAT | Mobile bottom-sheet toggles open/closed | manual smoke | resize to 360px; tap chat button | n/a |
| REQ-PRESENCE | `track({user_id, name, city, joined_at})` payload format matches spec | unit | `npx vitest run app/room/RoomClient.test.tsx -t track` | ❌ Wave 0 |
| REQ-PRESENCE | Live count = `participants.length` | unit (derived from electHost test) | (same as above) | ❌ Wave 0 |
| REQ-CONTENT-LIST | `pickVideo(roomId, videoId)` rejects non-curated id | unit | `npx vitest run app/actions/pick-video.test.ts -t rejects` | ❌ Wave 0 |
| REQ-CONTENT-LIST | Host swap broadcasts sync_play with `videoId` field | manual smoke (or integration with mocked channel) | two-window manual | n/a |

### Sampling Rate

- **Per task commit:** `npx vitest run --no-coverage` (~3s on a small suite).
- **Per wave merge:** `npx vitest run` + manual two-window smoke on Vercel preview (~5min).
- **Phase gate:** All vitest tests green; manual smoke checklist verified once on mobile + once on desktop, both against the Vercel preview URL.

### Wave 0 Gaps

- [ ] `vitest.config.ts` — minimal config; jsdom environment for DOM-touching tests
- [ ] `package.json` — add `"test": "vitest run"`, `"test:watch": "vitest"`; install `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- [ ] `lib/rooms.test.ts` — covers REQ-CITY-ROOM find-or-create
- [ ] `lib/sync-utils.ts` (NEW) — extract `electHost(participants)` and `shouldCorrect(hostTime, clientTime, threshold=2)` as pure functions for testability
- [ ] `lib/sync-utils.test.ts` — covers REQ-ROOM-SYNC drift logic and host election
- [ ] `hooks/useRoomSync.test.ts` — covers cooldown, sync_play handler with mocked channel + player
- [ ] `app/actions/pick-video.test.ts` — covers REQ-CONTENT-LIST validation
- [ ] `tests/manual-smoke-phase3.md` — checklist for two-window manual verification

**Manual smoke checklist (one file, one wave-0 task):**

1. Sign up on window A (mobile profile, 360px) and window B (desktop, ≥1024px). Both arrive at `/room/{same-id}` with same city.
2. Window A is host (first joiner). Verify HOST badge on A; not on B.
3. A picks a video → B sees player swap and start playing within 2s.
4. A pauses → B pauses within 1s.
5. A scrubs to 2:00 → B seeks within 2s.
6. B introduces drift (close DevTools throttling to "Slow 3G"); within ~5s of next heartbeat, B's player corrects to A's position.
7. A closes tab; within ~30s, B becomes host (HOST badge moves to B).
8. Send chat from A; appears on B in <1s. Send chat from B; appears on A.
9. New tab C: open `/room/{id}` directly (no signup). Should redirect to `/signup?next=/room/{id}`. Sign up; arrives back at the same room.

**Why this hybrid is pragmatic:** Realtime end-to-end testing requires a live Supabase connection and two browsers — feasible only in an integration environment. Mocking the entire Realtime client to test E2E behavior wastes more time than running the manual smoke. Pure-function extracts (`electHost`, `shouldCorrect`) cover the algorithmic risk where bugs are most likely to silently regress.

---

## Security Domain

> Default-enabled. Phase 3 has narrow security surface — most surface was settled in Phase 2 (signup pipeline). New surface here is room-membership and host-only mutations.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | Cookie-based identity (`yp_session`); not a real auth scheme but matches D-005 (no accounts). UUID is unguessable enough for hackathon. |
| V3 Session Management | yes | HTTP-only, SameSite=Lax, Secure (prod), 30-day TTL. Standard pattern. |
| V4 Access Control | yes | Server-side `next` whitelist (`^/room/[0-9a-f-]{36}$`); host-only `pickVideo` server action validates `videoId` against the curated list. |
| V5 Input Validation | yes | UUID regex on `roomId`, `signupId`, `next` param; `pickVideo` rejects non-curated `videoId`. |
| V6 Cryptography | n/a | No new crypto. Cookie does not encode anything sensitive (just a row id). |

### Known Threat Patterns for Next.js + Supabase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Open redirect via `?next=` param | Tampering | Whitelist regex on `next` param (D-308). Implement in signup action: only paths matching `^/room/[0-9a-f-]{36}$` are allowed. |
| Cookie theft via XSS | Information Disclosure | `httpOnly: true` (already specified). React's default escaping handles user-supplied strings (chat messages, names). |
| Direct write to `rooms.youtube_video_id` from client | Tampering | Use server action `pickVideo` with curated-list whitelist. Don't expose service-role key to browser (already enforced by lib structure). |
| Chat broadcast spoofing (impersonate another user) | Spoofing | The `user` field in `chat` payload is set by the client; a bad actor can spoof. Acceptable for v1 (no moderation per D-014). Document. |
| RLS bypass | Authorization | All server-side mutations use admin client (RLS-bypass intended); anon client never writes. |
| Realtime DoS via flood broadcasts | Denial of Service | Free-tier Supabase has rate limits per channel; not addressed in v1. Document in carried risks. |

**Note on chat-impersonation:** Since identity is just a cookie, a malicious user can edit `localStorage` or craft a request to send a `chat` broadcast with `user: "Mahatma Gandhi"`. Mitigation requires server-side identity attestation (out of scope per D-005). Document in `<security_known_issues>` as accepted risk for hackathon scope.

---

## Sources

### Primary (HIGH confidence)
- [Supabase Realtime: Broadcast](https://supabase.com/docs/guides/realtime/broadcast) — `broadcast.self`, channel.send shape, ack option
- [Supabase Realtime: Presence](https://supabase.com/docs/guides/realtime/presence) — sync/join/leave events, `channel.track()`, `presenceState()`
- [Supabase Realtime: Protocol](https://supabase.com/docs/guides/realtime/protocol) — heartbeat protocol, default 25s interval
- [Supabase Troubleshooting: Heartbeat Messages](https://supabase.com/docs/guides/troubleshooting/realtime-heartbeat-messages) — `heartbeatIntervalMs`, web-worker option, exponential backoff
- [react-youtube on GitHub](https://github.com/tjallingt/react-youtube) — props, `event.target` ref pattern, player methods
- [YouTube IFrame Player API Reference](https://developers.google.com/youtube/iframe_api_reference) — `YT.PlayerState` codes, error codes 101/150
- [Phase 1 RESEARCH.md](.planning/phases/01-scaffold-deploy/01-RESEARCH.md) — `@supabase/ssr`, async cookies/headers, admin client pattern
- npm registry — `react-youtube@10.1.0` verified 2026-04-27 (`npm view react-youtube version`)

### Secondary (MEDIUM confidence)
- [Supabase Discussion #41239: Heartbeat Monitoring](https://github.com/orgs/supabase/discussions/41239) — `onHeartbeat` callback, exponential backoff, web-worker
- [Supabase realtime-js issue #133](https://github.com/supabase/realtime-js/issues/133) — heartbeat-loss patterns under multi-event windows
- Phase 2 CONTEXT.md and 02-04-SUMMARY.md — service-role admin client pattern, signup redirect history

### Tertiary (LOW confidence — noted but not relied upon)
- Various Stack Overflow / Stack Diagnosis posts about Supabase presence timeout values — used only to corroborate the 15-30s observed leave window. Treated as community-anecdotal; not a basis for tight timing claims.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `react-youtube@10.1.0` verified against npm; all other deps already shipped in Phase 1/2.
- Architecture: HIGH — patterns map directly to Supabase official docs and react-youtube reference.
- Sync algorithm: HIGH — locked in PROJECT.md C-006/C-008; lookahead and cooldown are standard techniques.
- Pitfalls: HIGH for code-level pitfalls (channel leaks, cookies, state-loop); MEDIUM for the precise host-disconnect window number (15-30s observed, not officially published).
- Validation Architecture: MEDIUM — vitest install is straightforward but the recommendation hinges on the assumption that the planner is willing to add a test framework mid-project. If that's a no-go, fall back to manual smoke only and skip Wave 0 vitest tasks.

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (Supabase Realtime API and react-youtube v10 line are stable; revisit if Supabase ships a major Realtime version bump)
