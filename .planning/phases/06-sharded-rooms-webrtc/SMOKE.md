# Phase 6 — WebRTC Overlay Manual Smoke Matrix

Run before declaring the phase shippable. WebRTC handshakes require real browsers and media devices; CI cannot cover them.

## 1. Two-tab smoke (single browser)

- [ ] Open the same room in two Chrome tabs as different signups.
- [ ] In tab A, click "Start talking" or the **mic** button. The combined permission prompt appears (one dialog with mic + camera). Allow both.
- [ ] Tab A's "Start talking" ghost button vanishes; the dock appears below the player with the self tile + the ON CALL pill.
- [ ] In tab B, click **mic**. Allow both.
- [ ] Both tabs see two tiles in the dock within ~3 seconds.
- [ ] Both tabs hear each other's mic.
- [ ] Toggle **cam** in tab A. Tab B sees video appear in tab A's tile within ~1 second. No re-prompt.
- [ ] Toggle **cam** off in tab A. Tab B's tile drops back to the monogram fallback (no frozen frame).
- [ ] Click **leave** in tab A. Tab B's tile for A vanishes within ~2 seconds.

## 2. Cross-browser

- [ ] Chrome ↔ Safari (macOS): full mic + cam round-trip works.
- [ ] Chrome ↔ Firefox: full mic + cam round-trip works.
- [ ] Chrome (Android) ↔ Chrome (desktop): mic round-trip works.

## 3. YouTube audio artifact (the original bug — most important check)

- [ ] In a room with the YouTube broadcast playing at ~60% volume, listen to the audio quality.
- [ ] Click **mic**. Allow.
- [ ] Audio quality must be **unchanged** — no loss of bass, no muddiness, no high-pass filter.
- [ ] Toggle **mic** off. Audio quality still unchanged.
- [ ] Toggle **mic** on again. Still no degradation. (No re-prompt.)

## 4. Auto-duck

- [ ] On a multi-peer call, while YouTube plays, have a peer speak.
- [ ] YouTube volume locally drops to ~30% within 200 ms.
- [ ] Tile speaking indicator: 5-bar VU meter on the right edge climbs, ON tally appears top-left.
- [ ] When the peer stops speaking, YouTube volume ramps back up after a brief pause (~600 ms quiet hold + 400 ms ramp).
- [ ] Move the volume slider mid-duck. The slider value is honored immediately; no fight, no stuck-low-volume bug.

## 5. Network drop recovery

- [ ] On an active two-peer call, disable WiFi for 6 seconds.
- [ ] The affected tile gets a "reconnecting…" overlay.
- [ ] Re-enable WiFi. Connection self-heals within ~10 seconds (the mesh-reconciliation tick).
- [ ] After a second forced drop, the connection drops the tile cleanly.

## 6. Symmetric NAT graceful degradation

- [ ] One client on a mobile hotspot, another on home WiFi.
- [ ] If ICE fails, the affected tile shows a "could not connect" state (or simply disappears after the second failure).
- [ ] Watch room continues to function: chat, sync, presence all unaffected.

## 7. Permission denied

- [ ] Block camera + mic permissions in browser settings.
- [ ] Click "Start talking". The browser prompt shows then denies (or is auto-denied).
- [ ] The dock surfaces "Re-enable in browser settings" caption (left-bordered, mono).
- [ ] No re-prompt on subsequent clicks.

## 8. Headphones tip

- [ ] Clear `localStorage.yp_hp_tip_seen`.
- [ ] Click **mic** for the first time. The slim banner appears with horizontal scanline borders for 8 seconds.
- [ ] Subsequent mic toggles do not re-show the toast.
- [ ] Clicking the **ⓘ headphones** button in the controls row re-opens the same tip.

## 9. Sync coexistence

- [ ] While on a call, the host clicks play/pause on the YouTube broadcast.
- [ ] All viewers' video state stays synced (existing `sync_*` events still flow correctly alongside the new `webrtc_*` events).
- [ ] Drift correction (rate nudges or seek) keeps working — verify via the Player's heartbeat behavior.

## 10. Mobile

- [ ] Tile grid wraps to 2 rows of 3 max on a narrow viewport (375 px width).
- [ ] Controls row collapses gracefully (cam/mic icons stay readable, headphones button hides its label, leave moves to the right).
- [ ] "Start talking" ghost button is reachable below the player on mobile.

## Known limitations (not blocking the phase)

- **Volume slider is hard-coded to 80** as the auto-duck ceiling. The slider state lives inside `<Player />` and is not currently lifted to `RoomClient`. Lifting it is a follow-up; auto-duck still works, the ceiling just doesn't track the user's slider in real time. Documented at `app/room/[id]/RoomClient.tsx` near the `useAudioDuck({ userVolume: 80 })` call.
- **Per-peer mic/cam state is not broadcast.** Peer tiles assume both on; visual indicators may show "mic on" while the remote has actually muted at the track level. Cosmetic only — audio is correctly silenced via the disabled track.
- **No TURN fallback.** Symmetric-NAT users gracefully degrade to "watcher only" without affecting other peers' meshes (per locked decision D-017).
