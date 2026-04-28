# Watch room UX redesign — theatre + ribbon

## Problem

Two failures show up the moment a new visitor lands in a room:

1. **You can't tell the room supports video calls.** The `Start talking` button sits below the player and below the fold on most viewports. Visitors assume the room is YouTube-only and never join the call.
2. **Once you do join, you can't see the video and the other faces at the same time.** The current `CallDock` is a tile grid that mounts below the player; viewers have to scroll between watching content and seeing peers. The two halves of the feature are physically separated.

This redesign fixes both, plus five smaller adjacent UX wins picked during brainstorming.

## Goal

A single integrated layout where the YouTube video is always the hero and every peer is visible alongside it. Joining the call is a one-tap action available without scrolling. The pre-call and on-call states share the same shell — only the ribbon morphs.

## In scope

1. **Theatre + ribbon layout** — video stays full 16:9; peer tiles compress into a thin ribbon directly underneath.
2. **Integrated `+ Join call` tile** — leftmost ribbon seat in the idle state replaces the standalone `StartTalkingButton`.
3. **Header eyebrow line** — replaces the ambiguous "now broadcasting" copy with `"04 listening · 03 on call · Riya is talking"`.
4. **① Speaker indicator on presence list** — the presence list below the player gets a yellow ring around whoever is currently speaking on the call.
5. **② Pre-join camera/mic preview** — clicking `+ Join call` opens an inline preview card with the user's own camera, mic level meter, and Mic/Cam toggles before they commit to the call.
6. **⑤ Unread chat badge on mobile** — the chat-toggle in the room header gets a small numeric badge while the chat sheet is closed.
7. **⑥ Player-overlay change-video control** — the host's "Change video" button moves from a row below the player into a small overlay button on the player's top-right corner.
8. **⑦ Welcome share banner → corner toast** — the post-signup share row demotes to a small bottom-left toast that auto-dismisses in 8 seconds.

## Out of scope

- Keyboard shortcuts for the call (mute, push-to-talk, cam toggle).
- Tab-title flash on speaker change.
- Headphones tip → inline conversion (stays as the existing modal).
- Any change to the WebRTC mesh, sync engine, presence dedup, or chat transport.
- Visual rework of `PeerTile` itself (sizes adapt; chrome is unchanged).

## Constraints

- **Aesthetic:** stay strictly in the existing late-night-broadcast palette and typography. No new fonts, no new colors. Reuse `--ink`, `--ink-soft`, `--ink-mute`, `--accent`, `--live`, `--line`, `--bg-raised`, the `eyebrow`/`pulse-dot`/`tally-row` classes, and the existing `font-display` / `font-mono` pairing.
- **No new dependencies.**
- **Mobile parity at 375 px:** each change must render correctly. Ribbon must allow horizontal scroll if peer count exceeds the seat count.
- **No regressions to the sync work that just shipped** (`fix(sync): seek-only drift correction with NTP-style clock sync`). All changes are presentational — they don't touch `useRoomSync`, `useCall`, `usePeerConnections`, `useAudioDuck`, or `lib/sync-utils.ts`.
- **Backwards-compatible** with the existing realtime channel contract: no new broadcast events for these UX changes.

## Visual contract

### Idle state (you have not joined the call)

```
┌──────────────────────────────────────────────────┐
│  [eyebrow]  Now broadcasting · Chai pe Charcha   │  ← stays
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │                                          │   │
│   │           YouTube — 16:9                 │   │  ← unchanged
│   │                                          │   │     except for
│   │            (host overlay button          │   │     overlay btn
│   │             top-right when host)         │   │
│   └──────────────────────────────────────────┘   │
│                                                  │
│  ● In the room · 04 listening · nobody on call   │  ← new eyebrow
│                                          04/07   │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐    │
│  │  +  │ RM  │ JP  │ VN  │ AN  │  ·  │  ·  │    │  ← ribbon
│  │ JOIN│Riya │Jaya │Varun│Anika│ empty empty│    │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┘    │
│                                                  │
│  Tuned in · 12  (presence list, no speaker glow) │
└──────────────────────────────────────────────────┘
```

### On-call state (you have joined)

```
┌──────────────────────────────────────────────────┐
│   [unchanged player]                             │
│                                                  │
│  ● On call · Riya is talking · audio ducked      │  ← speaker name
│                                          03/07   │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐    │
│  │ KS  │ RM  │ JP  │  ·  │  ·  │  ·  │  ·  │    │  ← your tile
│  │ You │GLOW │Jaya │ empty empty empty empty │   │     left-most
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┘    │
│                                                  │
│   ◉ Mic on   ○ Cam off   ▣ Leave call            │  ← controls now
│                                                  │     visible
│  Tuned in · 12 (Riya · BLR has yellow ring)      │
└──────────────────────────────────────────────────┘
```

### Pre-join preview (between idle and on-call)

When the user clicks `+ Join call`, the ribbon's leftmost tile expands inline into a wider preview card while the rest of the ribbon stays put:

```
┌─────────────────────┬─────┬─────┬─────┬─────┐
│                     │ RM  │ JP  │ VN  │ AN  │
│   [your cam feed]   │Riya │Jaya │Varun│Anika│
│   ▮▮▮▯▯  mic level  └─────┴─────┴─────┴─────┘
│                                              
│   ◉ Mic   ○ Cam   [ Cancel ]   [ Go live → ] 
└──────────────────────────────────────────────
```

The preview spans the width of 4 tiles. Going live collapses it back into a 1-tile width with the existing `PeerTile`. Cancelling collapses it back into the `+ Join call` tile.

## Component changes

| Change | New / Modified | Files | Notes |
|---|---|---|---|
| Theatre + ribbon | Modified | `components/room/CallDock.tsx`, `app/room/[id]/RoomClient.tsx` | Replace `aspect-[4/3]` grid with a 7-column horizontal ribbon. Tiles drop from `aspect-[4/3]` to a tighter ratio appropriate for ribbon height (~96 px tall on desktop). Empty seats render as dashed-border placeholders. |
| Integrated `+ Join` tile | Modified | `components/room/CallDock.tsx`, deletion of `components/room/StartTalkingButton.tsx` | The `+ Join` tile reuses ribbon dimensions and slots into seat 0 when `state === 'idle'`. `StartTalkingButton` and the empty-state branch in `RoomClient.tsx` are deleted. |
| Header eyebrow | Modified | `components/room/CallDock.tsx`, new `lib/room-format.ts` | We extend the existing eyebrow row to compose the listening/on-call/speaker tally. New pure helper `formatRoomEyebrow({ listening, onCall, speakerName, ducked })` lives in a new `lib/room-format.ts` (kept out of `sync-utils.ts` because it is presentational, not transport-related) so the formatting is unit-testable in isolation. |
| ① Speaker on presence | Modified | `components/room/PresenceList.tsx`, `app/room/[id]/RoomClient.tsx` | `PresenceList` accepts a new `speakingPeerIds: string[]` prop. Each list row whose `user_id` matches gets a yellow outline. `RoomClient` derives this from `audioDuck.isSpeaking(peerId)` for every peer. **Caveat:** `useAudioDuck` only tracks *remote* peers (the analyser graph is fed by inbound MediaStreams). The local user's own speaking state isn't tracked today and isn't part of this scope — the speaker indicator highlights other people, which is the discovery signal that matters. |
| ② Pre-join preview | New | `components/room/PreJoinPreview.tsx` (~120 LOC), `app/room/[id]/RoomClient.tsx`, additions to `hooks/useCall.ts` | New preview component owns its own `getUserMedia` lifecycle. Uses an internal mic-level animation frame loop fed by an `AnalyserNode`. On confirm, it hands the live `MediaStream` to a new `useCall.adoptStream(stream, { mic, cam })` method that mirrors today's `toggleMic` join path but skips the internal `getUserMedia` call (so we don't re-prompt the OS). On cancel, it stops all tracks. Sits as a transient state between `'idle'` and `'on-call'` driven by a local `RoomClient` flag (no new `CallState` enum value needed — keeps `useCall`'s state machine unchanged). |
| ⑤ Unread chat badge | Modified | `components/room/Chat.tsx`, `components/room/RoomHeader.tsx`, `app/room/[id]/RoomClient.tsx` | `RoomClient` tracks `unreadChat: number` — increments on `chat` broadcast when `chatOpen === false` AND viewport is mobile, resets to 0 when chat opens. Badge renders only at `< md` breakpoint; on desktop the chat sidebar is always visible so badge would be noise. |
| ⑥ Player-overlay change-video | Modified | `components/room/Player.tsx`, `app/room/[id]/RoomClient.tsx` | New optional prop `Player.hostControl?: ReactNode`. When `isHost && hostControl`, the player renders it as an absolutely-positioned overlay at `top-2 right-2` above the click-shield (z-index between shield and volume bar). The current row-below-the-player containing "Now broadcasting" + change-video button gets the change-video button removed; the broadcasting copy stays. |
| ⑦ Welcome corner toast | Modified | `app/room/[id]/RoomClient.tsx` | The existing `welcomeOpen` block changes from a full-width banner to a `position: fixed; bottom: 1rem; left: 1rem` toast at `z-30`. Auto-dismiss after 8 s via `setTimeout` (cleared on unmount). The localStorage flag still records dismissal. WhatsApp share button stays inside, but the layout collapses to a single row. |

## Data flow

No new realtime events. All state changes are derived from already-published values:

- **Speaker name** (header) and **speaking peer ids** (presence list outline) come from `audioDuck.isSpeaking(peerId)` evaluated for every participant. Currently this is consumed by `PeerTile` only; we lift it one level so `RoomClient` computes a `speakingPeerIds: string[]` once per render and passes it to both the new eyebrow header and `PresenceList`.
- **Listening count** is `participants.length`; **on-call count** is `participants.filter(p => p.on_call_intent).length`. Both already exist in scope.
- **Pre-join preview** owns its own local stream lifecycle; on confirm it transfers ownership into `useCall` via a new `useCall.adoptStream(stream, { mic, cam })` method that mirrors the current `toggleMic` join path but skips the `getUserMedia` call. The existing `toggleMic` / `toggleCam` paths stay intact so any code path that invokes them directly (no preview) continues to work.

## Error handling

- **Pre-join preview, permission denied:** preview shows the existing `permissionError` text inline (where the cam feed would be) and a `Try again` button that re-calls `getUserMedia`. No regression in error UX vs. today.
- **Pre-join preview, getUserMedia hangs:** add a 10 s timeout that surfaces "Camera didn't respond — try again" text. Today's behavior is to spin forever.
- **Ribbon overflow (>7 peers):** ribbon becomes a horizontally-scrollable row at any breakpoint when `selfTile + peerTiles > seatCount`. The grid template switches from `grid-cols-7` to `flex overflow-x-auto` with each tile pinned to a min-width. Seat count is configurable per breakpoint (5 mobile / 6 sm / 7 md+) — empties pad to that width when peers < seats.
- **Speaker indicator stale:** `audioDuck.isSpeaking` already debounces; no new code needed. If the WebRTC mesh drops a peer mid-speech, `audioDuck.detachPeer` clears their speaking state.

## Testing strategy

| Surface | Test type | What it verifies |
|---|---|---|
| `formatRoomEyebrow(...)` | Unit (Vitest) | Exact text for each combination: idle, on-call-no-speaker, on-call-with-speaker, ducked-but-no-speaker. |
| `CallDock` ribbon | Component (Testing Library) | Renders 7 seats, leftmost is `+ Join` when idle, leftmost is self tile when on-call, empty seats render as dashed placeholders. |
| `PresenceList` speaker outline | Component | Rows in `speakingPeerIds` get the speaker class; rows not in it don't. |
| `PreJoinPreview` | Component | Permission flow, cancel cleanup (tracks stopped), confirm hands stream to callback. Mock `getUserMedia`. |
| `Player` overlay slot | Component | When `hostControl` is provided AND `isHost` is true, the overlay renders. When `isHost` is false, it does not. |
| Unread chat badge | Component | Increments on incoming `chat` while closed, resets to 0 on open, renders only at mobile breakpoint. |
| Welcome toast | Manual | Appears bottom-left, auto-dismisses, localStorage flag prevents re-show. |
| End-to-end smoke | Manual two-tab | Open two tabs in different cities, confirm: both see the ribbon, joining call from tab 1 surfaces tab 1 in tab 2's ribbon, speaker glow tracks the talking tab, joining call doesn't push the player below the fold. |

## Risk inventory

| Risk | Likelihood | Mitigation |
|---|---|---|
| Ribbon tile size too small to recognize a face on desktop | Medium | Lock min-width: 96 px and min-height: 72 px on the tile. At 7 seats wide the player container needs to be at least 720 px; below that the ribbon scrolls horizontally. |
| Pre-join preview races the `useCall` permission flow | Medium | Preview owns the stream until confirm. `useCall.joinWithStream(stream)` is a new pure-handoff method that does NOT call `getUserMedia`. The existing `useCall.toggleMic()` path is left intact for back-compat. |
| Speaker outline flickers on the presence list as `isSpeaking` toggles | Low | The existing `useAudioDuck` already smooths this for tile borders; reusing the same predicate inherits the smoothing. |
| Welcome toast obscures something on mobile | Low | Toast respects safe-area inset; renders behind any open mobile chat sheet (lower z-index). |
| Chat-badge resets unexpectedly on a re-render | Low | Counter lives in `useState` in `RoomClient`. Reset on `chatOpen → true` only. The chat broadcast handler already exists and is the only writer. |

## Decision log

- **One ribbon row vs. two rows.** Considered a 2-row ribbon (more peers visible) but rejected — peer count rarely exceeds 5–6 in this app, and a second row makes the layout taller than the player on tall phones, which inverts the hierarchy.
- **Pre-join preview as inline expansion vs. modal.** Inline keeps the user in the room context (they can still see the video playing in the background while approving cam/mic). Modal would be one less layout edge case but feels heavy-handed for a hangout app.
- **Speaker name in header vs. on tile only.** Showing "Riya is talking" in the header is the discovery cue for non-call viewers — they can see it without parsing tile chrome. Tile glow alone wasn't enough; users have reported missing it.
- **Welcome toast vs. dismiss-once banner.** Toast wins because the banner currently competes with the join CTA for visual weight. Once we move join into the ribbon, we don't need a competing banner anymore.
