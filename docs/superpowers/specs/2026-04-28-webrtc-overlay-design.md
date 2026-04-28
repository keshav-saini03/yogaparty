# WebRTC Overlay — Design

**Status:** Draft, awaiting user review.
**Phase:** 6 (Sharded Rooms + WebRTC).
**Requirement:** REQ-WEBRTC-CALL.
**Decision anchors:** D-017 (mesh + STUN-only), D-016 (room cap = 7).
**Authored:** 2026-04-28.

## 1. Goal

Let participants in a watch room opt into a peer-mesh audio + video call layered on top of the synced YouTube broadcast. The video keeps playing; the call is a strip of tiles below the player. Mic and camera are off by default and only request browser permission on the first user gesture. The YouTube audio must remain free of the artifact introduced by the browser's "communications" audio profile when a microphone is active.

## 2. Locked decisions (in priority order)

1. **Lazy combined permission prompt.** First click of either Mic or Camera triggers a single `getUserMedia({audio:true, video:true})` call. Two browser dialogs are not used. Subsequent toggles only flip `track.enabled`.
2. **No YouTube audio artifact.** Mic constraints lock `echoCancellation`, `autoGainControl`, `noiseSuppression`, and the Chrome `goog*` equivalents to `false`. The OS audio profile flip is the root cause; this is the documented mitigation. A one-time inline "headphones recommended" tip is shown on first mic-on.
3. **Implicit-with-pill activation.** No separate "Join call" button. Toggling Mic or Camera silently puts the user on the mesh; an "● ON CALL · LEAVE" pill in the controls row is the explicit escape hatch. Turning both Mic and Camera off keeps the user on the mesh until they click Leave (the pill is the canonical way out).
4. **Equal peers.** No host moderation on the call. Per-tile "Mute peer for me" is local-only and does not broadcast.
5. **Stacked dock layout.** Tiles render directly below the YouTube player, above the existing "Now broadcasting" caption. The dock does not overlap the video and does not displace chat.
6. **Auto-duck on speech.** When any peer's audio level passes the RMS threshold, YouTube volume locally ramps to 30% of the user's slider value over 200 ms; ramps back over 400 ms when speech ends. The slider value is preserved as the ceiling and is never written to.

## 3. Non-goals

- TURN servers, relay fallback, or coturn deployment.
- SFU / selective forwarding for groups larger than 7.
- Recording, persistence, or transcription of call media.
- Screen sharing.
- Hand-raise, reactions, or any call-layer affordance beyond Mic / Cam / Leave / per-peer local mute.
- Server-side moderation, rate-limiting, or call-level bans.
- Cross-room calls. A call is bound to one room.
- Pre-flight self-test ("how do I look / sound" check) before joining.

## 4. Architecture

### 4.1 Topology

Peer mesh. Each `on-call` participant holds one `RTCPeerConnection` per other `on-call` participant. With the room cap at 7, that is at most 6 active connections per client.

Estimated ceiling per client: ~6 × 150 kbps audio + 6 × 500 kbps video = ~3.9 Mbps up/down. Acceptable on Indian broadband and within the constraints D-017 was sized for.

### 4.2 Signaling

Reuses the existing Supabase Realtime channel `room:{roomId}`. Four new broadcast events:

```ts
'webrtc_offer'    { from: string; to: string; sdp: string;                              sentAt: number }
'webrtc_answer'   { from: string; to: string; sdp: string;                              sentAt: number }
'webrtc_ice'      { from: string; to: string; candidate: RTCIceCandidateInit;           sentAt: number }
'webrtc_call_end' { from: string;                                                        sentAt: number }
```

`to`-scoped events are filtered client-side: receivers ignore any payload where `to !== selfId`. This matches the existing `sync_correct` pattern. `webrtc_call_end` is broadcast (no `to`).

`sentAt` is included on every event for parity with the `sync_*` family and lets debug tooling reuse the existing transit-time visualizations.

### 4.3 ICE configuration

```ts
{
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 0,
}
```

STUN-only. No TURN. Users behind symmetric NAT will fail to connect; their tile renders a "could not connect" state (see §7) and they remain in the room as watchers without call.

### 4.4 State boundaries

The mesh is entirely client-state. No DB rows, no server-side mesh registry, no Postgres schema changes. Mesh membership is an emergent property of who has a `getUserMedia` stream and a presence payload with `on_call_intent: true`.

## 5. Activation flow

### 5.1 State machine (per client)

```
idle ──click mic|cam──▶ requesting-permission
                            │
                  granted ──┴── denied ──▶ idle (toast)
                            ▼
                       on-call (mesh handshake)
                            │
            ┌───────────────┼─────────────────┐
            ▼               ▼                 ▼
       mic on/off      cam on/off         click Leave
       enabled flip    replaceTrack             │
                                                ▼
                                            leaving
                                       (broadcast call_end,
                                        close PCs, stop tracks)
                                                │
                                                ▼
                                              idle
```

### 5.2 Permission semantics

- **Both granted.** Tracks created, `enabled` flags set per which icon was clicked: clicking Mic first means `audioTrack.enabled = true`, `videoTrack.enabled = false`.
- **Audio only granted.** Camera button shows a "blocked" badge. Clicking it surfaces a help tooltip. No re-prompt this session.
- **Both denied.** Both buttons show a blocked badge. A "Re-enable in browser settings" link appears. No re-prompt this session.

### 5.3 Mesh formation rule

On entering `on-call`:

1. Read presence list, filter to `user_id !== self`.
2. For each other participant who is also `on_call_intent: true`, deterministically pick the initiator: the participant with the lower `user_id` (lex order) creates the offer.
3. Late joiners arrive in `on-call`, read presence, and initiate offers to anyone with a higher `user_id` who is already on the mesh.

This is the simplified "polite peer" pattern — symmetric clients converge on a stable mesh without needing a coordinator.

### 5.4 Mesh reconciliation tick

Every 10 seconds the `useCall` hook diffs:

```
expected = presence.filter(p => p.on_call_intent && p.user_id !== self)
actual   = peerConnections.keys()
```

For each `expected − actual` where `self.user_id < their.user_id`, send an offer. For each `actual − expected`, close the PC and drop the tile.

This catches the rare case where a `webrtc_call_end` is missed or a transient WiFi drop tore down a connection without a clean state-change event.

## 6. UI: the call dock

### 6.1 Where it lives

Below `<Player />`, above the "Now broadcasting" caption block in `RoomClient.tsx`. The dock renders only when:
- ≥1 participant has `on_call_intent: true`, **or**
- the user is hovering / keyboard-focused on the "Start talking" ghost button (see §6.4).

Otherwise it is invisible — the watch-room layout for non-callers is unchanged.

### 6.2 Tile anatomy

Approximate 4:3 ratio, ~120 px wide on desktop, ~88 px on mobile. Visual implementation will be done with the `frontend-design` skill at build time; this section is a contract, not a pixel spec.

```
┌─────────────────────────┐
│  [video] or [monogram]  │
│                         │
│ ▌ name · city        🎤 │
└─────────────────────────┘
```

- **Self-tile** is mirrored (`transform: scaleX(-1)`) and labeled "you". Always rendered while on call, regardless of camera state.
- **Mic icon** mirrors the broadcast volume bar's speaker glyph for visual continuity. Yellow accent when mic is on, ink-mute crossed-out when off.
- **Speaking indicator.** While `isSpeaking[user_id]` is true, the tile gets a 1 px accent-yellow border that pulses at 1 Hz. Driven by the same RMS analyser used for auto-duck.
- **Click peer tile → "Mute peer for me"** dropdown (single item). Local-only: sets `audioElement.muted = true` for that peer's incoming track.

### 6.3 Controls row

Below the tile strip, mono-uppercase typography matching the existing `cta` family.

```
[● ON CALL]   [🎤 mic]   [📷 cam]   [ⓘ headphones]   [LEAVE]
```

- `ON CALL` reuses the existing `pulse-dot` style on accent yellow.
- `mic` and `cam` are toggle buttons. Yellow accent when on; ink-mute outline when off. A blocked-permission state shows a small lock badge.
- `headphones` opens the persistent tooltip described in §7.4.
- `LEAVE` triggers the `leaving` transition.

### 6.4 Empty states

- **Nobody on call yet.** Dock is hidden. A ghost button "🎤 START TALKING →" overlays the bottom-left of the player (visual style mirrors the volume pill on the bottom-right). Click → first toggle → combined permission prompt.
- **You are on call but alone.** Dock shows just your self-tile and a soft caption "Waiting for others to join the call."

### 6.5 Mobile

Tiles wrap to 2 rows of up to 3 tiles each (covers up to 6 peers without horizontal scroll). The controls row collapses to icon-only with a "···" overflow that holds Leave and the headphones tip. The "Start talking" ghost button moves to a compact pill below the player rather than overlaying it.

## 7. Audio engineering

### 7.1 Mic constraints (music mode)

```ts
{
  audio: {
    echoCancellation: false,
    autoGainControl: false,
    noiseSuppression: false,
    googEchoCancellation: false,
    googAutoGainControl: false,
    googNoiseSuppression: false,
    googHighpassFilter: false,
  },
  video: { width: 320, height: 240, frameRate: 24 },
}
```

The `goog*` flags are Chrome-specific and prevent the OS audio profile flip on macOS/Windows that re-routes all output through the "communications" device class.

### 7.2 Auto-duck

For each incoming peer track:

```
RTCRtpReceiver(track) → MediaStreamSource → AnalyserNode (fftSize=256)
                                           ↓
                                  poll RMS at 30 Hz on rAF
                                           ↓
                                 isSpeaking[peerId] = (RMS > 0.06)
```

A reduce across all peers yields `anyPeerSpeaking: boolean`. State changes drive a smooth volume ramp on the YouTube iframe:

| Edge | Action |
|---|---|
| `false → true` | Ramp YT volume from `userVolume` to `userVolume * 0.3` over 200 ms |
| `true → false`, sustained 600 ms | Ramp YT volume back to `userVolume` over 400 ms |

`userVolume` is the value from the existing `<Player />` slider. The ramp is applied via `player.setVolume()` directly and never writes back to slider state, so the slider's displayed value never moves.

### 7.3 Anti-fight clause

If the user moves the volume slider while a duck ramp is active, the ramp is cancelled and the new slider value becomes the new `userVolume` ceiling. No stuck-low-volume bug.

### 7.4 Self-mute discipline

When the user toggles mic off, set `audioTrack.enabled = false`. **Do not** call `track.stop()`. Stopping releases the OS device, which on macOS causes an audible click as the audio profile flips back to high-quality playback, and a second click when mic is re-enabled. `enabled = false` keeps the device acquired but transmits silence, which is profile-stable.

The same rule applies to the camera track for symmetry, even though the artifact is audio-only.

### 7.5 Headphones tip

The first time `getUserMedia({audio:true})` succeeds in a given browser, render an inline toast in the dock for 8 seconds:

> 🎧 Heads-up: echo cancellation is off so the music stays clean. **Headphones recommended** so others don't hear the session bleed through your mic.

Persisted via `localStorage.yp_hp_tip_seen = '1'`. The dock keeps a tiny "ⓘ" link that re-opens the same tip on demand.

## 8. Renegotiation, recovery, teardown

### 8.1 Track changes mid-call

The initial offer creates both audio and video transceivers in `direction: 'sendrecv'` with placeholder no-op tracks. Therefore:

- `mic on/off` → `audioTrack.enabled` flip. No SDP renegotiation.
- `cam on` (mid-call) → `RTCRtpSender.replaceTrack(videoTrack)` on every peer. Silent at the SDP layer.
- `cam off` → `videoTrack.enabled = false` and `replaceTrack(null)`. Peer's tile shows the monogram fallback. Transceiver is preserved for instant re-enable.

### 8.2 ICE failure recovery

`iceconnectionstatechange` listener per peer connection:

| State | Action |
|---|---|
| `connected` / `completed` | Tile renders normally. |
| `disconnected` | Tile gets ghosted "reconnecting…" overlay. Start 5 s grace timer. |
| `failed` | Cancel grace timer. Call `pc.restartIce()` once and re-offer with `iceRestart: true`. Tile keeps overlay. |
| `failed` after restart | Close PC, drop tile. The mesh-reconciliation tick (§5.4) may retry from scratch ~10 s later. |
| `closed` | Clean up listeners and drop tile. |

### 8.3 Teardown order

When the user clicks Leave or the tab unmounts:

1. Broadcast `webrtc_call_end { from: selfId, sentAt: Date.now() }` (fire-and-forget).
2. For each PC: `pc.getSenders().forEach(s => s.track?.stop())`, then `pc.close()`.
3. Stop the local mic and camera tracks, releasing the OS hardware indicator.
4. Update presence: `channel.track({ ...payload, on_call_intent: false })`.

Step 1 fires before steps 2–4 so peers remove the leaving tile immediately rather than waiting for `iceconnectionstatechange = closed`.

On the receiving side of `webrtc_call_end { from }`: close the matching PC and drop the tile. If the message is dropped, §8.2's state ladder catches the cleanup within ~5 s.

## 9. Channel events recap

Post-Phase-6 vocabulary on `room:{roomId}`:

```
sync_play, sync_pause, sync_seek, sync_correct, heartbeat,
chat, video_change,
webrtc_offer, webrtc_answer, webrtc_ice, webrtc_call_end
```

Eleven events on one channel. Worst-case ICE storm (≈ 30 candidates × 6 peers × 7 clients ≈ 1260 events) finishes in < 2 s under Supabase Realtime's documented capacity envelope.

### 9.1 Presence payload extension

```ts
{
  user_id: string,
  name: string,
  city: string | null,
  joined_at: number,
  on_call_intent: boolean,   // NEW
}
```

`on_call_intent` is updated via `channel.track({...})` whenever the local state machine enters or leaves `on-call`. It is the canonical signal everyone else uses to decide whether to mesh with this participant.

## 10. File layout

### 10.1 New files

```
hooks/
  useCall.ts                    # state machine + permissions + presence-payload extension
  usePeerConnections.ts         # PC lifecycle (offer, answer, ICE, restart, teardown)
  useAudioDuck.ts               # Web Audio analyser → YouTube volume ramp

lib/
  webrtc-config.ts              # STUN servers, media constraints, RMS threshold, timing constants
  webrtc-events.ts              # event-name + payload type definitions, parallel to sync-utils.ts
  webrtc-utils.ts               # pure helpers: pickInitiator(), diffMesh(), isMicCleanCompatible()

components/room/
  CallDock.tsx                  # tile strip + controls row, the §6 contract
  PeerTile.tsx                  # one tile (self or remote) — speaking border, mic glyph, monogram fallback
  CallControls.tsx              # mic / cam / leave / headphones-tip pill row
  HeadphonesTip.tsx             # one-time toast with localStorage gate
  StartTalkingButton.tsx        # ghost CTA on the player when dock is empty
```

### 10.2 Edited files

```
app/room/[id]/RoomClient.tsx    # register webrtc_* listeners, wire useCall + useAudioDuck,
                                # render <CallDock />, pass duckedVolume to <Player />
components/room/Player.tsx      # accept optional `duckedVolume` prop; merge with the slider's
                                # `userVolume` (slider state is unaffected)
```

No schema migrations. No edits to `lib/sync-utils.ts` or `useRoomSync.ts` — the WebRTC signaling lives alongside the existing sync events without touching them.

## 11. Tests

Same conventions as the existing project: vitest for logic, RTL for components, no E2E.

### 11.1 Pure logic

- `lib/webrtc-utils.test.ts`
  - `pickInitiator(selfId, peerId)` returns the lex-lower id.
  - `diffMesh(presence, pcs)` returns correct `{ toAdd, toRemove }` sets across permutations.
  - `isMicCleanCompatible(constraints)` rejects any AEC/AGC/NS leakage.
- `lib/webrtc-events.test.ts`
  - Payload validators round-trip every event shape.

### 11.2 Hook tests (mocked `RTCPeerConnection`)

- `hooks/useCall.test.ts`
  - `idle → requesting → on-call → leaving → idle` transition path.
  - Permission denial path: state returns to `idle` and surfaces a toast.
  - Toggling mic/cam mid-call calls `replaceTrack` exactly once per affected peer.
- `hooks/usePeerConnections.test.ts`
  - Offer/answer/ICE round-trip with a mocked channel.
  - `restartIce()` fires exactly once on first `failed`, never twice.
  - PC closed and tile dropped on second `failed`.

### 11.3 Audio-duck (mocked `AudioContext`)

- `hooks/useAudioDuck.test.ts`
  - Rising RMS edge schedules a 200 ms ramp from `userVolume` to `userVolume * 0.3`.
  - Slider movement during a ramp cancels the ramp and updates `userVolume`.
  - `false → false` edge produces no ramp.

### 11.4 Component smoke

- `components/room/CallDock.test.tsx`
  - Empty mesh: `StartTalkingButton` is rendered and `CallDock` is not.
  - Populated mesh: `StartTalkingButton` is not rendered.
- `components/room/PeerTile.test.tsx`
  - `isSpeaking={true}` toggles the speaking-border class.
  - `isLocal={true}` applies `transform: scaleX(-1)`.

### 11.5 Manual smoke matrix

WebRTC handshake itself is not unit-testable without real media devices. We add a section to `.planning/phases/06-.../SMOKE.md` covering:

- Two-tab smoke: same browser, both join call, mic + cam round-trip both directions.
- Cross-browser: Chrome ↔ Safari, Chrome ↔ Firefox.
- Network drop: turn off WiFi for 8 s, watch reconnect overlay clear without manual action.
- Symmetric NAT: one client on a mobile hotspot, expect "could not connect" tile (graceful failure, watch room intact).
- macOS audio profile: confirm YouTube audio is unchanged before / during / after mic toggle.

## 12. Implementation order

To be promoted into `writing-plans` next.

1. `webrtc-config.ts` + `webrtc-events.ts` + `webrtc-utils.ts` with full unit tests.
2. `usePeerConnections.ts` with mocked-PC tests.
3. `useCall.ts` — state machine + presence-payload extension + reconciliation tick.
4. `useAudioDuck.ts` — analyser + ramp + anti-fight.
5. **Hand off to `frontend-design` skill** for `CallDock`, `PeerTile`, `CallControls`, `HeadphonesTip`, `StartTalkingButton`.
6. Wire-up in `RoomClient.tsx` and `Player.tsx`. Run the manual smoke matrix.
7. Update `.planning/phases/06-.../SMOKE.md` and Phase-6 artifacts.

## 13. Open assumptions

- `localStorage.yp_hp_tip_seen` is the right gate for the headphones tip; users on private/incognito browsing will see it on every session, which is acceptable.
- `userVolume * 0.3` is a reasonable duck depth; tunable in `webrtc-config.ts` if user testing says otherwise.
- 6-peer × 500 kbps video is sustainable on the targeted Indian-broadband cohort. If field testing shows otherwise, the constraint to lower is the video resolution (320×240 → 240×180), which is a single-line change.
- Symmetric-NAT users gracefully degrade to "watcher only" without affecting other peers' meshes. We will not add a fallback channel (e.g. server-relayed audio) in v1.
