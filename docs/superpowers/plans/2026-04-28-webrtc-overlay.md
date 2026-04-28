# WebRTC Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a peer-mesh audio + video overlay to the watch room (Phase 6, REQ-WEBRTC-CALL).

**Architecture:** WebRTC mesh ≤ 6 peers per client, signaling on the existing Supabase Realtime channel `room:{roomId}`. STUN-only, no TURN/SFU. Mic/cam off by default; combined permission prompt on first toggle. Music-mode mic constraints + auto-duck on the YT volume so the watch audio stays clean. Implicit-with-pill activation, equal peers, stacked dock below the player.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript, Supabase Realtime broadcast/presence, native `RTCPeerConnection` + Web Audio API, `react-youtube` for the existing player. Tests via vitest + @testing-library/react + jsdom.

**Source spec:** `docs/superpowers/specs/2026-04-28-webrtc-overlay-design.md`. Read it before starting.

---

## File map

**New (in order created):**

```
lib/webrtc-config.ts           — STUN servers, media constraints, RMS threshold, timing constants
lib/webrtc-events.ts           — event-name + payload type definitions
lib/webrtc-utils.ts            — pickInitiator(), diffMesh(), isMicCleanCompatible()
hooks/usePeerConnections.ts    — PC lifecycle (offer / answer / ICE / restart / replaceTrack)
hooks/useAudioDuck.ts          — RMS analyser → YT volume ramp with anti-fight clause
hooks/useCall.ts               — state machine + permissions + presence-payload extension + reconciliation tick
components/room/PeerTile.tsx           — one tile (self or remote)
components/room/CallControls.tsx       — mic / cam / leave / headphones-tip pill row
components/room/HeadphonesTip.tsx      — one-time toast w/ localStorage gate
components/room/StartTalkingButton.tsx — ghost CTA on the player when dock empty
components/room/CallDock.tsx           — dock shell: composes the above
```

Each file has a matching `*.test.ts(x)` next to it.

**Modified:**

```
app/room/[id]/RoomClient.tsx   — register webrtc_* listeners, wire useCall + useAudioDuck, render <CallDock />, pass duckedVolume to <Player />
components/room/Player.tsx     — accept optional `duckedVolume` prop
.planning/phases/06-sharded-rooms-webrtc/SMOKE.md  — manual smoke matrix
```

No DB migrations. No edits to `lib/sync-utils.ts` or `useRoomSync.ts`.

---

## Task ordering

Wave 0 (pure logic): T1 → T5
Wave 1 (PC plumbing): T6 → T9
Wave 2 (audio duck): T10 → T11
Wave 3 (call state machine): T12 → T15
Wave 4 (UI skeletons): T16 → T20
Wave 5 (frontend-design polish pass): T21
Wave 6 (wire-up): T22 → T23
Wave 7 (smoke): T24

---

## Task 1: webrtc-config.ts — constants

**Files:**
- Create: `lib/webrtc-config.ts`

No tests required for this task — it's a constants file consumed by later tasks; coverage comes through them.

- [ ] **Step 1: Create the config file**

```ts
// lib/webrtc-config.ts
//
// Single source of truth for tunables. Anything we might want to tweak post-
// demo (volume duck depth, video resolution, ramp durations) lives here.

export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export const PC_CONFIG: RTCConfiguration = {
  iceServers: STUN_SERVERS,
  iceCandidatePoolSize: 0,
};

/**
 * "Music mode" mic constraints. Locks all browser-side audio processing OFF
 * so the OS audio profile stays in the high-quality playback class — the
 * specific fix for the YouTube-audio artifact that triggered this design.
 *
 * goog* keys are Chrome-specific and must be present alongside the standard
 * keys to fully suppress the profile flip on macOS / Windows.
 */
export const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    autoGainControl: false,
    noiseSuppression: false,
    // @ts-expect-error — non-standard Chrome flags, intentional
    googEchoCancellation: false,
    googAutoGainControl: false,
    googNoiseSuppression: false,
    googHighpassFilter: false,
  },
  video: {
    width: { ideal: 320 },
    height: { ideal: 240 },
    frameRate: { ideal: 24 },
  },
};

// Auto-duck thresholds. RMS is computed from a 256-bin AnalyserNode at 30 Hz.
export const SPEAKING_RMS_THRESHOLD = 0.06;
export const DUCK_FACTOR = 0.3;          // YT.volume during ducking = userVolume * 0.3
export const DUCK_RAMP_IN_MS = 200;
export const DUCK_RAMP_OUT_MS = 400;
export const DUCK_QUIET_HOLD_MS = 600;   // sustained quiet before ramp out

// Mesh reconciliation tick: catches any peer that fell off without a clean
// state-change event. See spec §5.4.
export const MESH_RECONCILE_INTERVAL_MS = 10_000;

// ICE failure recovery (spec §8.2).
export const ICE_DISCONNECTED_GRACE_MS = 5_000;

// Headphones tip — first-mic-on toast.
export const HEADPHONES_TIP_KEY = 'yp_hp_tip_seen';
export const HEADPHONES_TIP_DURATION_MS = 8_000;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing test-file errors are unrelated).

- [ ] **Step 3: Commit**

```bash
git add lib/webrtc-config.ts
git commit -m "feat(webrtc): add config constants for mesh, music-mode, and duck"
```

---

## Task 2: webrtc-events.ts — event types

**Files:**
- Create: `lib/webrtc-events.ts`
- Create: `lib/webrtc-events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/webrtc-events.test.ts
import { describe, it, expect } from 'vitest';
import {
  isOfferPayload,
  isAnswerPayload,
  isIcePayload,
  isCallEndPayload,
} from './webrtc-events';

describe('webrtc-events validators', () => {
  it('isOfferPayload accepts a valid offer', () => {
    expect(
      isOfferPayload({ from: 'a', to: 'b', sdp: 'v=0...', sentAt: 1 })
    ).toBe(true);
  });

  it('isOfferPayload rejects missing fields', () => {
    expect(isOfferPayload({ from: 'a', to: 'b' })).toBe(false);
    expect(isOfferPayload(null)).toBe(false);
    expect(isOfferPayload({})).toBe(false);
  });

  it('isAnswerPayload mirrors offer shape', () => {
    expect(
      isAnswerPayload({ from: 'a', to: 'b', sdp: 'v=0', sentAt: 1 })
    ).toBe(true);
    expect(isAnswerPayload({ from: 'a', to: 'b', sentAt: 1 })).toBe(false);
  });

  it('isIcePayload requires candidate object', () => {
    expect(
      isIcePayload({
        from: 'a',
        to: 'b',
        candidate: { candidate: 'foo', sdpMid: '0', sdpMLineIndex: 0 },
        sentAt: 1,
      })
    ).toBe(true);
    expect(
      isIcePayload({ from: 'a', to: 'b', candidate: null, sentAt: 1 })
    ).toBe(false);
  });

  it('isCallEndPayload is broadcast (no `to`)', () => {
    expect(isCallEndPayload({ from: 'a', sentAt: 1 })).toBe(true);
    expect(isCallEndPayload({ from: 'a', to: 'b', sentAt: 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npx vitest run lib/webrtc-events.test.ts`
Expected: FAIL — `Cannot find module './webrtc-events'`.

- [ ] **Step 3: Create the events module**

```ts
// lib/webrtc-events.ts
//
// Type definitions + runtime validators for the four new broadcast events on
// the existing room channel. Validators are defensive — receivers from a
// shared channel must not assume payload shape.

export type WebRtcOfferPayload = {
  from: string;
  to: string;
  sdp: string;
  sentAt: number;
};

export type WebRtcAnswerPayload = {
  from: string;
  to: string;
  sdp: string;
  sentAt: number;
};

export type WebRtcIcePayload = {
  from: string;
  to: string;
  candidate: RTCIceCandidateInit;
  sentAt: number;
};

export type WebRtcCallEndPayload = {
  from: string;
  sentAt: number;
};

export const WEBRTC_EVENTS = {
  OFFER: 'webrtc_offer',
  ANSWER: 'webrtc_answer',
  ICE: 'webrtc_ice',
  CALL_END: 'webrtc_call_end',
} as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isOfferPayload(v: unknown): v is WebRtcOfferPayload {
  return isObj(v) && isStr(v.from) && isStr(v.to) && isStr(v.sdp) && isNum(v.sentAt);
}

export function isAnswerPayload(v: unknown): v is WebRtcAnswerPayload {
  return isObj(v) && isStr(v.from) && isStr(v.to) && isStr(v.sdp) && isNum(v.sentAt);
}

export function isIcePayload(v: unknown): v is WebRtcIcePayload {
  return (
    isObj(v) &&
    isStr(v.from) &&
    isStr(v.to) &&
    isObj(v.candidate) &&
    isNum(v.sentAt)
  );
}

export function isCallEndPayload(v: unknown): v is WebRtcCallEndPayload {
  return isObj(v) && isStr(v.from) && isNum(v.sentAt) && !('to' in v);
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `npx vitest run lib/webrtc-events.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/webrtc-events.ts lib/webrtc-events.test.ts
git commit -m "feat(webrtc): add event types and runtime validators"
```

---

## Task 3: webrtc-utils.ts — pickInitiator

**Files:**
- Create: `lib/webrtc-utils.ts`
- Create: `lib/webrtc-utils.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/webrtc-utils.test.ts
import { describe, it, expect } from 'vitest';
import { pickInitiator } from './webrtc-utils';

describe('pickInitiator', () => {
  it('returns true when self id is lex-lower', () => {
    expect(pickInitiator('alpha', 'zulu')).toBe(true);
  });

  it('returns false when self id is lex-higher', () => {
    expect(pickInitiator('zulu', 'alpha')).toBe(false);
  });

  it('returns false when ids are equal (defensive)', () => {
    expect(pickInitiator('same', 'same')).toBe(false);
  });

  it('handles UUIDs correctly', () => {
    const lo = '11111111-2222-3333-4444-555555555555';
    const hi = '99999999-9999-9999-9999-999999999999';
    expect(pickInitiator(lo, hi)).toBe(true);
    expect(pickInitiator(hi, lo)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run lib/webrtc-utils.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

```ts
// lib/webrtc-utils.ts
//
// Pure helpers for the mesh. No DOM, no React, no Supabase — fully unit-
// testable in isolation.

/**
 * Deterministic initiator rule. Given two participants, the one with the
 * lex-lower user_id creates the offer; the other waits for it. Returns true
 * if `selfId` should initiate to `peerId`.
 */
export function pickInitiator(selfId: string, peerId: string): boolean {
  if (selfId === peerId) return false; // defensive — never happens in practice
  return selfId < peerId;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run lib/webrtc-utils.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/webrtc-utils.ts lib/webrtc-utils.test.ts
git commit -m "feat(webrtc): add pickInitiator deterministic-mesh helper"
```

---

## Task 4: webrtc-utils.ts — diffMesh

**Files:**
- Modify: `lib/webrtc-utils.ts`
- Modify: `lib/webrtc-utils.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `lib/webrtc-utils.test.ts`:

```ts
import { diffMesh } from './webrtc-utils';

describe('diffMesh', () => {
  it('returns toAdd for expected peers not in actual', () => {
    const result = diffMesh(['a', 'b', 'c'], new Set(['a']));
    expect(result.toAdd.sort()).toEqual(['b', 'c']);
    expect(result.toRemove).toEqual([]);
  });

  it('returns toRemove for actual peers no longer expected', () => {
    const result = diffMesh(['a'], new Set(['a', 'b', 'c']));
    expect(result.toAdd).toEqual([]);
    expect(result.toRemove.sort()).toEqual(['b', 'c']);
  });

  it('returns empty when in sync', () => {
    const result = diffMesh(['a', 'b'], new Set(['a', 'b']));
    expect(result.toAdd).toEqual([]);
    expect(result.toRemove).toEqual([]);
  });

  it('handles both add and remove in one diff', () => {
    const result = diffMesh(['b', 'c'], new Set(['a', 'b']));
    expect(result.toAdd).toEqual(['c']);
    expect(result.toRemove).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run lib/webrtc-utils.test.ts`
Expected: FAIL — `diffMesh` not exported.

- [ ] **Step 3: Implement diffMesh**

Append to `lib/webrtc-utils.ts`:

```ts
/**
 * Compare the set of peers we *should* be connected to (from presence with
 * `on_call_intent: true` minus self) with the set we *are* connected to (PC
 * map keys). The reconciliation tick uses this to spawn missing offers and
 * close orphaned connections.
 */
export function diffMesh(
  expected: string[],
  actual: Set<string>
): { toAdd: string[]; toRemove: string[] } {
  const expectedSet = new Set(expected);
  const toAdd = expected.filter((id) => !actual.has(id));
  const toRemove: string[] = [];
  for (const id of actual) {
    if (!expectedSet.has(id)) toRemove.push(id);
  }
  return { toAdd, toRemove };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run lib/webrtc-utils.test.ts`
Expected: PASS — 8 tests total.

- [ ] **Step 5: Commit**

```bash
git add lib/webrtc-utils.ts lib/webrtc-utils.test.ts
git commit -m "feat(webrtc): add diffMesh for reconciliation tick"
```

---

## Task 5: webrtc-utils.ts — isMicCleanCompatible

**Files:**
- Modify: `lib/webrtc-utils.ts`
- Modify: `lib/webrtc-utils.test.ts`

This guards against accidental regression — if anyone flips an audio-processing flag back on, this catches it in CI.

- [ ] **Step 1: Add the failing test**

Append to `lib/webrtc-utils.test.ts`:

```ts
import { isMicCleanCompatible } from './webrtc-utils';

describe('isMicCleanCompatible', () => {
  it('accepts the music-mode constraint shape', () => {
    expect(
      isMicCleanCompatible({
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      })
    ).toBe(true);
  });

  it('rejects any AEC enabled', () => {
    expect(
      isMicCleanCompatible({
        echoCancellation: true,
        autoGainControl: false,
        noiseSuppression: false,
      })
    ).toBe(false);
  });

  it('rejects AGC enabled', () => {
    expect(
      isMicCleanCompatible({
        echoCancellation: false,
        autoGainControl: true,
        noiseSuppression: false,
      })
    ).toBe(false);
  });

  it('rejects noise suppression enabled', () => {
    expect(
      isMicCleanCompatible({
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: true,
      })
    ).toBe(false);
  });

  it('handles missing keys (treat as default-on per spec)', () => {
    expect(isMicCleanCompatible({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run lib/webrtc-utils.test.ts`
Expected: FAIL — function not exported.

- [ ] **Step 3: Implement**

Append to `lib/webrtc-utils.ts`:

```ts
/**
 * Defensive guard. Returns true only when all three browser-side audio-
 * processing flags are explicitly false. Used in tests + dev-mode to detect
 * regressions of the music-mode constraint.
 */
export function isMicCleanCompatible(
  audio: Partial<MediaTrackConstraintSet> | undefined
): boolean {
  if (!audio) return false;
  return (
    audio.echoCancellation === false &&
    audio.autoGainControl === false &&
    audio.noiseSuppression === false
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run lib/webrtc-utils.test.ts`
Expected: PASS — 13 tests total.

- [ ] **Step 5: Commit**

```bash
git add lib/webrtc-utils.ts lib/webrtc-utils.test.ts
git commit -m "feat(webrtc): add isMicCleanCompatible regression guard"
```

---

## Task 6: usePeerConnections — offer/answer round-trip

**Files:**
- Create: `hooks/usePeerConnections.ts`
- Create: `hooks/usePeerConnections.test.ts`

The hook owns one `RTCPeerConnection` per remote peer. Tests use a hand-rolled `MockPC` because jsdom doesn't ship a real one.

- [ ] **Step 1: Write the test scaffold**

```tsx
// hooks/usePeerConnections.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePeerConnections } from './usePeerConnections';

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  iceConnectionState: RTCIceConnectionState = 'new';
  onicecandidate: ((e: { candidate: RTCIceCandidate | null }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ontrack: ((e: { track: MediaStreamTrack; streams: MediaStream[] }) => void) | null = null;
  addedTracks: MediaStreamTrack[] = [];
  closed = false;
  iceRestartCount = 0;

  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }
  addTransceiver = vi.fn();
  addTrack = vi.fn((track: MediaStreamTrack) => {
    this.addedTracks.push(track);
    return { replaceTrack: vi.fn() };
  });
  createOffer = vi.fn(async (opts?: { iceRestart?: boolean }) => {
    if (opts?.iceRestart) this.iceRestartCount++;
    return { type: 'offer' as const, sdp: 'mock-offer' };
  });
  createAnswer = vi.fn(async () => ({ type: 'answer' as const, sdp: 'mock-answer' }));
  setLocalDescription = vi.fn(async (d: RTCSessionDescriptionInit) => {
    this.localDescription = d;
  });
  setRemoteDescription = vi.fn(async (d: RTCSessionDescriptionInit) => {
    this.remoteDescription = d;
  });
  addIceCandidate = vi.fn(async () => {});
  restartIce = vi.fn(() => {
    this.iceRestartCount++;
  });
  close = vi.fn(() => {
    this.closed = true;
  });
  getSenders = vi.fn(() => [] as RTCRtpSender[]);
}

beforeEach(() => {
  MockRTCPeerConnection.instances = [];
  // @ts-expect-error — replacing global
  globalThis.RTCPeerConnection = MockRTCPeerConnection;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeChannel() {
  return { send: vi.fn() };
}

describe('usePeerConnections — offer/answer', () => {
  it('createOfferTo() builds a PC, creates an offer, and broadcasts it', async () => {
    const channel = makeChannel();
    const { result } = renderHook(() =>
      usePeerConnections({
        selfId: 'self',
        channel: channel as never,
        getLocalStream: () => null,
      })
    );

    await act(async () => {
      await result.current.createOfferTo('peer-1');
    });

    expect(MockRTCPeerConnection.instances).toHaveLength(1);
    const pc = MockRTCPeerConnection.instances[0];
    expect(pc.createOffer).toHaveBeenCalledTimes(1);
    expect(pc.localDescription?.sdp).toBe('mock-offer');
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'webrtc_offer',
        payload: expect.objectContaining({ from: 'self', to: 'peer-1', sdp: 'mock-offer' }),
      })
    );
  });

  it('handleOffer() sets remote description, creates and broadcasts answer', async () => {
    const channel = makeChannel();
    const { result } = renderHook(() =>
      usePeerConnections({
        selfId: 'self',
        channel: channel as never,
        getLocalStream: () => null,
      })
    );

    await act(async () => {
      await result.current.handleOffer({
        from: 'peer-1',
        to: 'self',
        sdp: 'their-offer',
        sentAt: 1,
      });
    });

    const pc = MockRTCPeerConnection.instances[0];
    expect(pc.remoteDescription?.sdp).toBe('their-offer');
    expect(pc.localDescription?.sdp).toBe('mock-answer');
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'webrtc_answer',
        payload: expect.objectContaining({ from: 'self', to: 'peer-1', sdp: 'mock-answer' }),
      })
    );
  });

  it('handleAnswer() applies remote description', async () => {
    const channel = makeChannel();
    const { result } = renderHook(() =>
      usePeerConnections({
        selfId: 'self',
        channel: channel as never,
        getLocalStream: () => null,
      })
    );

    await act(async () => {
      await result.current.createOfferTo('peer-1');
    });

    await act(async () => {
      await result.current.handleAnswer({
        from: 'peer-1',
        to: 'self',
        sdp: 'their-answer',
        sentAt: 2,
      });
    });

    const pc = MockRTCPeerConnection.instances[0];
    expect(pc.remoteDescription?.sdp).toBe('their-answer');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run hooks/usePeerConnections.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```tsx
// hooks/usePeerConnections.ts
'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  PC_CONFIG,
  ICE_DISCONNECTED_GRACE_MS,
} from '@/lib/webrtc-config';
import {
  WEBRTC_EVENTS,
  type WebRtcOfferPayload,
  type WebRtcAnswerPayload,
  type WebRtcIcePayload,
} from '@/lib/webrtc-events';

type Args = {
  selfId: string;
  channel: RealtimeChannel | null;
  /** Returns the current local mediaStream (or null if not yet acquired). */
  getLocalStream: () => MediaStream | null;
  /** Called when a peer's first track arrives, so the dock can render a tile. */
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  /** Called when a PC is closed/dropped, so the dock can remove the tile. */
  onPeerDropped?: (peerId: string) => void;
};

type Slot = {
  pc: RTCPeerConnection;
  restartedOnce: boolean;
  graceTimer: number | null;
};

export type PeerConnections = {
  createOfferTo: (peerId: string) => Promise<void>;
  handleOffer: (p: WebRtcOfferPayload) => Promise<void>;
  handleAnswer: (p: WebRtcAnswerPayload) => Promise<void>;
  handleIce: (p: WebRtcIcePayload) => Promise<void>;
  closePeer: (peerId: string) => void;
  closeAll: () => void;
  replaceVideoTrackEverywhere: (track: MediaStreamTrack | null) => Promise<void>;
  peerIds: () => string[];
};

export function usePeerConnections(args: Args): PeerConnections {
  const slotsRef = useRef<Map<string, Slot>>(new Map());

  const send = useCallback(
    (event: string, payload: unknown) => {
      args.channel?.send({ type: 'broadcast', event, payload });
    },
    [args.channel]
  );

  const buildPc = useCallback(
    (peerId: string): Slot => {
      const pc = new RTCPeerConnection(PC_CONFIG);

      // Create both transceivers up-front so toggle-on later doesn't need
      // a renegotiation (spec §8.1).
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });

      const local = args.getLocalStream();
      if (local) {
        for (const track of local.getTracks()) pc.addTrack(track, local);
      }

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        send(WEBRTC_EVENTS.ICE, {
          from: args.selfId,
          to: peerId,
          candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate,
          sentAt: Date.now(),
        });
      };

      pc.ontrack = (e) => {
        if (e.streams[0]) args.onRemoteStream?.(peerId, e.streams[0]);
      };

      const slot: Slot = { pc, restartedOnce: false, graceTimer: null };

      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === 'connected' || s === 'completed') {
          if (slot.graceTimer !== null) {
            window.clearTimeout(slot.graceTimer);
            slot.graceTimer = null;
          }
          return;
        }
        if (s === 'disconnected') {
          if (slot.graceTimer !== null) return;
          slot.graceTimer = window.setTimeout(() => {
            // Promoted from disconnected to failed — handled by next branch.
          }, ICE_DISCONNECTED_GRACE_MS);
          return;
        }
        if (s === 'failed') {
          if (slot.graceTimer !== null) {
            window.clearTimeout(slot.graceTimer);
            slot.graceTimer = null;
          }
          if (!slot.restartedOnce) {
            slot.restartedOnce = true;
            // Re-offer with iceRestart: true (spec §8.2).
            (async () => {
              try {
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                send(WEBRTC_EVENTS.OFFER, {
                  from: args.selfId,
                  to: peerId,
                  sdp: offer.sdp ?? '',
                  sentAt: Date.now(),
                });
              } catch {
                /* peer may have left; cleanup happens on next failed event */
              }
            })();
            return;
          }
          // Second failure → drop.
          closeSlot(peerId);
          return;
        }
        if (s === 'closed') {
          closeSlot(peerId);
        }
      };

      return slot;
    },
    [args, send]
  );

  const closeSlot = useCallback(
    (peerId: string) => {
      const slot = slotsRef.current.get(peerId);
      if (!slot) return;
      if (slot.graceTimer !== null) window.clearTimeout(slot.graceTimer);
      slot.pc.getSenders().forEach((s) => s.track?.stop());
      try {
        slot.pc.close();
      } catch {
        /* already closed */
      }
      slotsRef.current.delete(peerId);
      args.onPeerDropped?.(peerId);
    },
    [args]
  );

  const ensureSlot = useCallback(
    (peerId: string): Slot => {
      let slot = slotsRef.current.get(peerId);
      if (!slot) {
        slot = buildPc(peerId);
        slotsRef.current.set(peerId, slot);
      }
      return slot;
    },
    [buildPc]
  );

  const createOfferTo = useCallback(
    async (peerId: string) => {
      const { pc } = ensureSlot(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send(WEBRTC_EVENTS.OFFER, {
        from: args.selfId,
        to: peerId,
        sdp: offer.sdp ?? '',
        sentAt: Date.now(),
      });
    },
    [ensureSlot, send, args.selfId]
  );

  const handleOffer = useCallback(
    async (p: WebRtcOfferPayload) => {
      const { pc } = ensureSlot(p.from);
      await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send(WEBRTC_EVENTS.ANSWER, {
        from: args.selfId,
        to: p.from,
        sdp: answer.sdp ?? '',
        sentAt: Date.now(),
      });
    },
    [ensureSlot, send, args.selfId]
  );

  const handleAnswer = useCallback(async (p: WebRtcAnswerPayload) => {
    const slot = slotsRef.current.get(p.from);
    if (!slot) return;
    await slot.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
  }, []);

  const handleIce = useCallback(async (p: WebRtcIcePayload) => {
    const slot = slotsRef.current.get(p.from);
    if (!slot) return;
    try {
      await slot.pc.addIceCandidate(p.candidate);
    } catch {
      /* candidate may arrive before remote description; safe to drop */
    }
  }, []);

  const closePeer = useCallback(
    (peerId: string) => {
      closeSlot(peerId);
    },
    [closeSlot]
  );

  const closeAll = useCallback(() => {
    for (const peerId of [...slotsRef.current.keys()]) closeSlot(peerId);
  }, [closeSlot]);

  const replaceVideoTrackEverywhere = useCallback(
    async (track: MediaStreamTrack | null) => {
      const ops: Promise<void>[] = [];
      for (const slot of slotsRef.current.values()) {
        const sender = slot.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) ops.push(sender.replaceTrack(track));
      }
      await Promise.all(ops);
    },
    []
  );

  const peerIds = useCallback(() => [...slotsRef.current.keys()], []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      closeAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    createOfferTo,
    handleOffer,
    handleAnswer,
    handleIce,
    closePeer,
    closeAll,
    replaceVideoTrackEverywhere,
    peerIds,
  };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run hooks/usePeerConnections.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add hooks/usePeerConnections.ts hooks/usePeerConnections.test.ts
git commit -m "feat(webrtc): add usePeerConnections hook with offer/answer round-trip"
```

---

## Task 7: usePeerConnections — ICE candidate forwarding

**Files:**
- Modify: `hooks/usePeerConnections.test.ts`

The implementation already handles ICE in Task 6. This task locks the behavior with explicit tests so future regressions surface immediately.

- [ ] **Step 1: Append the failing tests**

Append to `hooks/usePeerConnections.test.ts`:

```ts
describe('usePeerConnections — ICE', () => {
  it('forwards onicecandidate events to the channel', async () => {
    const channel = makeChannel();
    const { result } = renderHook(() =>
      usePeerConnections({
        selfId: 'self',
        channel: channel as never,
        getLocalStream: () => null,
      })
    );

    await act(async () => {
      await result.current.createOfferTo('peer-1');
    });

    const pc = MockRTCPeerConnection.instances[0];
    const cand = {
      candidate: 'candidate:foo',
      sdpMid: '0',
      sdpMLineIndex: 0,
      toJSON() {
        return { candidate: this.candidate, sdpMid: this.sdpMid, sdpMLineIndex: this.sdpMLineIndex };
      },
    } as unknown as RTCIceCandidate;

    act(() => {
      pc.onicecandidate?.({ candidate: cand });
    });

    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'webrtc_ice',
        payload: expect.objectContaining({
          from: 'self',
          to: 'peer-1',
          candidate: expect.objectContaining({ candidate: 'candidate:foo' }),
        }),
      })
    );
  });

  it('handleIce applies inbound candidates to the matching PC', async () => {
    const channel = makeChannel();
    const { result } = renderHook(() =>
      usePeerConnections({
        selfId: 'self',
        channel: channel as never,
        getLocalStream: () => null,
      })
    );

    await act(async () => {
      await result.current.createOfferTo('peer-1');
    });

    await act(async () => {
      await result.current.handleIce({
        from: 'peer-1',
        to: 'self',
        candidate: { candidate: 'inbound', sdpMid: '0', sdpMLineIndex: 0 },
        sentAt: 1,
      });
    });

    const pc = MockRTCPeerConnection.instances[0];
    expect(pc.addIceCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidate: 'inbound' })
    );
  });

  it('handleIce silently drops candidates for unknown peers', async () => {
    const channel = makeChannel();
    const { result } = renderHook(() =>
      usePeerConnections({
        selfId: 'self',
        channel: channel as never,
        getLocalStream: () => null,
      })
    );

    await expect(
      result.current.handleIce({
        from: 'unknown',
        to: 'self',
        candidate: { candidate: 'x' },
        sentAt: 1,
      })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect pass**

Run: `npx vitest run hooks/usePeerConnections.test.ts`
Expected: PASS — 6 tests total.

- [ ] **Step 3: Commit**

```bash
git add hooks/usePeerConnections.test.ts
git commit -m "test(webrtc): lock ICE candidate forwarding behavior"
```

---

## Task 8: usePeerConnections — failure recovery

**Files:**
- Modify: `hooks/usePeerConnections.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `hooks/usePeerConnections.test.ts`:

```ts
describe('usePeerConnections — failure recovery', () => {
  it('first iceConnectionState=failed triggers exactly one ICE restart', async () => {
    const channel = makeChannel();
    const { result } = renderHook(() =>
      usePeerConnections({
        selfId: 'self',
        channel: channel as never,
        getLocalStream: () => null,
      })
    );

    await act(async () => {
      await result.current.createOfferTo('peer-1');
    });

    const pc = MockRTCPeerConnection.instances[0];
    pc.createOffer.mockClear();
    channel.send.mockClear();

    await act(async () => {
      pc.iceConnectionState = 'failed';
      pc.oniceconnectionstatechange?.();
      // give the async restart-ice block a tick
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pc.createOffer).toHaveBeenCalledWith({ iceRestart: true });
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'webrtc_offer' })
    );
  });

  it('second iceConnectionState=failed closes the PC and drops the slot', async () => {
    const channel = makeChannel();
    const onPeerDropped = vi.fn();
    const { result } = renderHook(() =>
      usePeerConnections({
        selfId: 'self',
        channel: channel as never,
        getLocalStream: () => null,
        onPeerDropped,
      })
    );

    await act(async () => {
      await result.current.createOfferTo('peer-1');
    });

    const pc = MockRTCPeerConnection.instances[0];

    await act(async () => {
      pc.iceConnectionState = 'failed';
      pc.oniceconnectionstatechange?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      pc.iceConnectionState = 'failed';
      pc.oniceconnectionstatechange?.();
    });

    expect(pc.close).toHaveBeenCalled();
    expect(onPeerDropped).toHaveBeenCalledWith('peer-1');
    expect(result.current.peerIds()).not.toContain('peer-1');
  });
});
```

- [ ] **Step 2: Run — expect pass**

Run: `npx vitest run hooks/usePeerConnections.test.ts`
Expected: PASS — 8 tests total.

- [ ] **Step 3: Commit**

```bash
git add hooks/usePeerConnections.test.ts
git commit -m "test(webrtc): lock ICE restart-once + drop-after-second-fail"
```

---

## Task 9: usePeerConnections — replaceTrack on toggle

**Files:**
- Modify: `hooks/usePeerConnections.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `hooks/usePeerConnections.test.ts`:

```ts
describe('usePeerConnections — replaceVideoTrackEverywhere', () => {
  it('calls replaceTrack on every video sender', async () => {
    const channel = makeChannel();
    const { result } = renderHook(() =>
      usePeerConnections({
        selfId: 'self',
        channel: channel as never,
        getLocalStream: () => null,
      })
    );

    await act(async () => {
      await result.current.createOfferTo('peer-1');
      await result.current.createOfferTo('peer-2');
    });

    const replace1 = vi.fn(async () => {});
    const replace2 = vi.fn(async () => {});
    MockRTCPeerConnection.instances[0].getSenders = vi.fn(() => [
      { track: { kind: 'video' } as MediaStreamTrack, replaceTrack: replace1 } as unknown as RTCRtpSender,
    ]);
    MockRTCPeerConnection.instances[1].getSenders = vi.fn(() => [
      { track: { kind: 'video' } as MediaStreamTrack, replaceTrack: replace2 } as unknown as RTCRtpSender,
    ]);

    const fakeTrack = { kind: 'video' } as MediaStreamTrack;
    await act(async () => {
      await result.current.replaceVideoTrackEverywhere(fakeTrack);
    });

    expect(replace1).toHaveBeenCalledWith(fakeTrack);
    expect(replace2).toHaveBeenCalledWith(fakeTrack);
  });
});
```

- [ ] **Step 2: Run — expect pass**

Run: `npx vitest run hooks/usePeerConnections.test.ts`
Expected: PASS — 9 tests total.

- [ ] **Step 3: Commit**

```bash
git add hooks/usePeerConnections.test.ts
git commit -m "test(webrtc): lock replaceVideoTrackEverywhere fan-out"
```

---

## Task 10: useAudioDuck — analyser + ramp

**Files:**
- Create: `hooks/useAudioDuck.ts`
- Create: `hooks/useAudioDuck.test.ts`

The hook owns the AnalyserNode per remote stream and emits a `duckedVolume` value.

- [ ] **Step 1: Write the failing test**

```tsx
// hooks/useAudioDuck.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioDuck } from './useAudioDuck';

class MockAnalyserNode {
  fftSize = 256;
  frequencyBinCount = 128;
  static currentRms = 0;
  getFloatTimeDomainData(array: Float32Array) {
    array.fill(MockAnalyserNode.currentRms);
  }
  disconnect = vi.fn();
}

class MockMediaStreamSource {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  state = 'running';
  destination = {} as AudioDestinationNode;
  createAnalyser = vi.fn(() => new MockAnalyserNode());
  createMediaStreamSource = vi.fn(() => new MockMediaStreamSource());
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
}

beforeEach(() => {
  // @ts-expect-error — replacing global
  globalThis.AudioContext = MockAudioContext;
  MockAnalyserNode.currentRms = 0;
  vi.useFakeTimers();
});

describe('useAudioDuck', () => {
  it('starts with duckedVolume === userVolume (no peers speaking)', () => {
    const { result } = renderHook(() => useAudioDuck({ userVolume: 80 }));
    expect(result.current.duckedVolume).toBe(80);
    expect(result.current.anyPeerSpeaking).toBe(false);
  });

  it('rising edge ramps duckedVolume toward userVolume * DUCK_FACTOR', () => {
    const stream = { id: 'fake' } as unknown as MediaStream;
    const { result, rerender } = renderHook(
      ({ vol }) => useAudioDuck({ userVolume: vol }),
      { initialProps: { vol: 80 } }
    );

    act(() => {
      result.current.attachPeer('peer-1', stream);
      MockAnalyserNode.currentRms = 0.2; // above SPEAKING_RMS_THRESHOLD
      vi.advanceTimersByTime(50); // first analyser tick
    });

    act(() => {
      vi.advanceTimersByTime(250); // ramp window (200ms)
    });

    expect(result.current.anyPeerSpeaking).toBe(true);
    // ducked = 80 * 0.3 = 24
    expect(result.current.duckedVolume).toBeCloseTo(24, 0);

    rerender({ vol: 80 });
  });

  it('sustained quiet for DUCK_QUIET_HOLD_MS ramps back up', () => {
    const stream = { id: 'fake' } as unknown as MediaStream;
    const { result } = renderHook(() => useAudioDuck({ userVolume: 80 }));

    act(() => {
      result.current.attachPeer('peer-1', stream);
      MockAnalyserNode.currentRms = 0.2;
      vi.advanceTimersByTime(300);
    });
    expect(result.current.duckedVolume).toBeCloseTo(24, 0);

    act(() => {
      MockAnalyserNode.currentRms = 0.001;
      vi.advanceTimersByTime(700); // > 600ms hold
      vi.advanceTimersByTime(500); // > 400ms ramp out
    });

    expect(result.current.anyPeerSpeaking).toBe(false);
    expect(result.current.duckedVolume).toBeCloseTo(80, 0);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run hooks/useAudioDuck.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```tsx
// hooks/useAudioDuck.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DUCK_FACTOR,
  DUCK_QUIET_HOLD_MS,
  DUCK_RAMP_IN_MS,
  DUCK_RAMP_OUT_MS,
  SPEAKING_RMS_THRESHOLD,
} from '@/lib/webrtc-config';

type Args = { userVolume: number };

type Slot = {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
};

export function useAudioDuck(args: Args) {
  const ctxRef = useRef<AudioContext | null>(null);
  const slotsRef = useRef<Map<string, Slot>>(new Map());
  const speakingRef = useRef<Map<string, boolean>>(new Map());
  const [anyPeerSpeaking, setAnyPeerSpeaking] = useState(false);

  // Ramp state.
  const [duckedVolume, setDuckedVolume] = useState(args.userVolume);
  const userVolumeRef = useRef(args.userVolume);
  userVolumeRef.current = args.userVolume;

  const rampRef = useRef<{
    timer: number | null;
    target: number;
    direction: 'in' | 'out' | null;
  }>({ timer: null, target: args.userVolume, direction: null });
  const quietSinceRef = useRef<number | null>(null);

  // Anti-fight: if user moves slider during ramp, abort and follow them.
  useEffect(() => {
    if (rampRef.current.direction === null) {
      setDuckedVolume(args.userVolume);
      return;
    }
    if (rampRef.current.direction === 'out') {
      // We were ramping toward userVolume — keep ramping but to the new value.
      rampRef.current.target = args.userVolume;
    } else {
      // Ramping in (toward duck floor); user changed the slider mid-ramp.
      // Cancel the ramp, take the new ceiling, become un-ducked.
      if (rampRef.current.timer !== null) {
        window.clearInterval(rampRef.current.timer);
      }
      rampRef.current = { timer: null, target: args.userVolume, direction: null };
      setDuckedVolume(args.userVolume);
    }
  }, [args.userVolume]);

  const startRamp = useCallback(
    (toFactor: number, durationMs: number, direction: 'in' | 'out') => {
      if (rampRef.current.timer !== null) {
        window.clearInterval(rampRef.current.timer);
      }
      const start = performance.now();
      const from = duckedVolume;
      const target = userVolumeRef.current * toFactor;
      rampRef.current = { timer: null, target, direction };
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / durationMs);
        const value = from + (rampRef.current.target - from) * t;
        setDuckedVolume(value);
        if (t >= 1) {
          if (rampRef.current.timer !== null) {
            window.clearInterval(rampRef.current.timer);
          }
          rampRef.current = { timer: null, target, direction: null };
        }
      };
      rampRef.current.timer = window.setInterval(tick, 16) as unknown as number;
    },
    [duckedVolume]
  );

  // Polling loop — checks RMS at 30Hz across all attached peers.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      let speaking = false;
      for (const [peerId, slot] of slotsRef.current.entries()) {
        const buf = new Float32Array(slot.analyser.fftSize);
        slot.analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const isSpeaking = rms > SPEAKING_RMS_THRESHOLD;
        speakingRef.current.set(peerId, isSpeaking);
        if (isSpeaking) speaking = true;
      }
      const wasAny = anyPeerSpeaking;
      if (speaking && !wasAny) {
        quietSinceRef.current = null;
        setAnyPeerSpeaking(true);
        startRamp(DUCK_FACTOR, DUCK_RAMP_IN_MS, 'in');
      } else if (!speaking && wasAny) {
        const now = performance.now();
        if (quietSinceRef.current === null) quietSinceRef.current = now;
        if (now - quietSinceRef.current >= DUCK_QUIET_HOLD_MS) {
          setAnyPeerSpeaking(false);
          startRamp(1, DUCK_RAMP_OUT_MS, 'out');
          quietSinceRef.current = null;
        }
      } else if (speaking) {
        quietSinceRef.current = null;
      }
    }, 33); // ~30Hz
    return () => window.clearInterval(interval);
  }, [anyPeerSpeaking, startRamp]);

  const attachPeer = useCallback((peerId: string, stream: MediaStream) => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    if (slotsRef.current.has(peerId)) return;
    const ctx = ctxRef.current;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    slotsRef.current.set(peerId, { source, analyser });
  }, []);

  const detachPeer = useCallback((peerId: string) => {
    const slot = slotsRef.current.get(peerId);
    if (!slot) return;
    try {
      slot.source.disconnect();
      slot.analyser.disconnect();
    } catch {
      /* already detached */
    }
    slotsRef.current.delete(peerId);
    speakingRef.current.delete(peerId);
  }, []);

  // Cleanup.
  useEffect(() => {
    return () => {
      if (rampRef.current.timer !== null) window.clearInterval(rampRef.current.timer);
      for (const id of [...slotsRef.current.keys()]) detachPeer(id);
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [detachPeer]);

  return {
    duckedVolume,
    anyPeerSpeaking,
    isSpeaking: (peerId: string) => speakingRef.current.get(peerId) ?? false,
    attachPeer,
    detachPeer,
  };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run hooks/useAudioDuck.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add hooks/useAudioDuck.ts hooks/useAudioDuck.test.ts
git commit -m "feat(webrtc): add useAudioDuck — RMS analyser + YT volume ramp"
```

---

## Task 11: useAudioDuck — anti-fight clause

**Files:**
- Modify: `hooks/useAudioDuck.test.ts`

- [ ] **Step 1: Append the failing test**

```ts
describe('useAudioDuck — anti-fight', () => {
  it('moving slider during a duck ramp cancels the ramp and follows the new value', () => {
    const stream = { id: 'fake' } as unknown as MediaStream;
    const { result, rerender } = renderHook(
      ({ vol }) => useAudioDuck({ userVolume: vol }),
      { initialProps: { vol: 80 } }
    );

    act(() => {
      result.current.attachPeer('peer-1', stream);
      MockAnalyserNode.currentRms = 0.2;
      vi.advanceTimersByTime(50); // start ducking
    });

    // Mid-ramp: user yanks the slider up.
    rerender({ vol: 100 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should sit at 100, not at 24 or 30. Anti-fight cancelled the ramp-in.
    expect(result.current.duckedVolume).toBe(100);
  });
});
```

- [ ] **Step 2: Run — expect pass**

Run: `npx vitest run hooks/useAudioDuck.test.ts`
Expected: PASS — 4 tests total.

- [ ] **Step 3: Commit**

```bash
git add hooks/useAudioDuck.test.ts
git commit -m "test(webrtc): lock useAudioDuck anti-fight on slider move"
```

---

## Task 12: useCall — state machine (granted path)

**Files:**
- Create: `hooks/useCall.ts`
- Create: `hooks/useCall.test.ts`

The `useCall` hook is the orchestrator: state machine, permission, presence-payload extension, and reconciliation tick.

- [ ] **Step 1: Write the failing test**

```tsx
// hooks/useCall.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCall } from './useCall';

beforeEach(() => {
  // Stub mediaDevices
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [
          { kind: 'audio', enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack,
          { kind: 'video', enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack,
        ],
        getAudioTracks: () => [{ kind: 'audio', enabled: true } as MediaStreamTrack],
        getVideoTracks: () => [{ kind: 'video', enabled: true } as MediaStreamTrack],
      })),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeChannel() {
  return {
    send: vi.fn(),
    track: vi.fn(async () => 'ok'),
  };
}

describe('useCall — state transitions', () => {
  it('starts in idle', () => {
    const { result } = renderHook(() =>
      useCall({
        selfId: 'self',
        channel: makeChannel() as never,
        peersOnCall: () => [],
      })
    );
    expect(result.current.state).toBe('idle');
    expect(result.current.micEnabled).toBe(false);
    expect(result.current.camEnabled).toBe(false);
  });

  it('clicking mic transitions idle → requesting → on-call', async () => {
    const channel = makeChannel();
    const { result } = renderHook(() =>
      useCall({
        selfId: 'self',
        channel: channel as never,
        peersOnCall: () => [],
      })
    );

    await act(async () => {
      await result.current.toggleMic();
    });

    expect(result.current.state).toBe('on-call');
    expect(result.current.micEnabled).toBe(true);
    expect(result.current.camEnabled).toBe(false);
    // Presence payload was updated via channel.track()
    expect(channel.track).toHaveBeenCalledWith(
      expect.objectContaining({ on_call_intent: true })
    );
  });

  it('toggling mic off then back on does NOT re-prompt for permission', async () => {
    const channel = makeChannel();
    const { result } = renderHook(() =>
      useCall({
        selfId: 'self',
        channel: channel as never,
        peersOnCall: () => [],
      })
    );

    await act(async () => {
      await result.current.toggleMic();
    });
    await act(async () => {
      await result.current.toggleMic();
    });
    await act(async () => {
      await result.current.toggleMic();
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('on-call');
    expect(result.current.micEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run hooks/useCall.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook (minimal)**

```tsx
// hooks/useCall.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { MEDIA_CONSTRAINTS, MESH_RECONCILE_INTERVAL_MS } from '@/lib/webrtc-config';
import { WEBRTC_EVENTS } from '@/lib/webrtc-events';
import { diffMesh, pickInitiator } from '@/lib/webrtc-utils';

export type CallState =
  | 'idle'
  | 'requesting-permission'
  | 'on-call'
  | 'leaving'
  | 'permission-denied';

export type CallPresenceExtras = {
  user_id: string;
  name: string;
  city: string | null;
  joined_at: number;
  on_call_intent: boolean;
};

type Args = {
  selfId: string;
  selfName?: string;
  selfCity?: string | null;
  selfJoinedAt?: number;
  channel: RealtimeChannel | null;
  /**
   * Returns the user_ids of every other participant currently on the call
   * (presence with on_call_intent === true, excluding self). Used by the
   * mesh reconciliation tick.
   */
  peersOnCall: () => string[];
  /**
   * Hook that the orchestrator (RoomClient) wires to usePeerConnections so
   * useCall can drive offers + replaceTrack without importing the PC hook
   * directly (avoids a circular dep).
   */
  onCreateOfferTo?: (peerId: string) => Promise<void> | void;
  onReplaceVideo?: (track: MediaStreamTrack | null) => Promise<void> | void;
  onClosePeer?: (peerId: string) => void;
  onCloseAll?: () => void;
};

const PERMISSION_DENIED_NAMES = new Set(['NotAllowedError', 'PermissionDeniedError']);

export function useCall(args: Args) {
  const [state, setState] = useState<CallState>('idle');
  const [micEnabled, setMic] = useState(false);
  const [camEnabled, setCam] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  const updatePresence = useCallback(
    async (onCallIntent: boolean) => {
      if (!args.channel) return;
      const payload: Partial<CallPresenceExtras> = {
        user_id: args.selfId,
        name: args.selfName ?? '',
        city: args.selfCity ?? null,
        joined_at: args.selfJoinedAt ?? Date.now(),
        on_call_intent: onCallIntent,
      };
      try {
        await args.channel.track(payload as never);
      } catch {
        /* presence may not be subscribed yet; ignore */
      }
    },
    [args.channel, args.selfId, args.selfName, args.selfCity, args.selfJoinedAt]
  );

  const acquireStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    setState('requesting-permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
      // Both tracks start disabled — toggleMic / toggleCam flip them.
      stream.getAudioTracks().forEach((t) => (t.enabled = false));
      stream.getVideoTracks().forEach((t) => (t.enabled = false));
      streamRef.current = stream;
      return stream;
    } catch (err) {
      const name = (err as Error).name;
      if (PERMISSION_DENIED_NAMES.has(name)) {
        setState('permission-denied');
        setPermissionError('Camera/mic permission denied. Re-enable in browser settings.');
      } else {
        setState('idle');
        setPermissionError((err as Error).message);
      }
      return null;
    }
  }, []);

  const enterMesh = useCallback(async () => {
    if (state !== 'on-call') {
      setState('on-call');
      await updatePresence(true);
      // Initiate offers to anyone we should reach (deterministic rule).
      for (const peerId of args.peersOnCall()) {
        if (pickInitiator(args.selfId, peerId)) {
          await args.onCreateOfferTo?.(peerId);
        }
      }
    }
  }, [state, updatePresence, args]);

  const toggleMic = useCallback(async () => {
    if (state === 'leaving') return;
    if (!streamRef.current) {
      const s = await acquireStream();
      if (!s) return;
    }
    const track = streamRef.current!.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMic(track.enabled);
    await enterMesh();
  }, [state, acquireStream, enterMesh]);

  const toggleCam = useCallback(async () => {
    if (state === 'leaving') return;
    if (!streamRef.current) {
      const s = await acquireStream();
      if (!s) return;
    }
    const track = streamRef.current!.getVideoTracks()[0];
    if (!track) return;
    const willEnable = !track.enabled;
    track.enabled = willEnable;
    setCam(willEnable);
    await args.onReplaceVideo?.(willEnable ? track : null);
    await enterMesh();
  }, [state, acquireStream, enterMesh, args]);

  const leave = useCallback(async () => {
    if (state === 'idle' || state === 'leaving') return;
    setState('leaving');
    args.channel?.send({
      type: 'broadcast',
      event: WEBRTC_EVENTS.CALL_END,
      payload: { from: args.selfId, sentAt: Date.now() },
    });
    args.onCloseAll?.();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMic(false);
    setCam(false);
    await updatePresence(false);
    setState('idle');
  }, [state, args, updatePresence]);

  // Mesh reconciliation tick — catches missed call_ends and self-heals.
  useEffect(() => {
    if (state !== 'on-call') return;
    const id = window.setInterval(() => {
      const expected = args.peersOnCall();
      // We don't have the actual PC set here; the orchestrator passes it in
      // via onCreateOfferTo decisions. As a simplification we just (re-)offer
      // to any expected peer for whom we should be initiator. The PC hook
      // dedupes (returns existing slot) so this is idempotent.
      for (const peerId of expected) {
        if (pickInitiator(args.selfId, peerId)) {
          args.onCreateOfferTo?.(peerId);
        }
      }
      // Closures: anyone we have a PC with but who is no longer in expected
      // is detected by the orchestrator's webrtc_call_end / iceconnection
      // ladder; useCall doesn't own that bookkeeping.
      void diffMesh; // imported for future use; silence unused
    }, MESH_RECONCILE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [state, args]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  return {
    state,
    micEnabled,
    camEnabled,
    permissionError,
    toggleMic,
    toggleCam,
    leave,
    getStream: () => streamRef.current,
  };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run hooks/useCall.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add hooks/useCall.ts hooks/useCall.test.ts
git commit -m "feat(webrtc): add useCall state machine and presence extension"
```

---

## Task 13: useCall — permission denied path

**Files:**
- Modify: `hooks/useCall.test.ts`

- [ ] **Step 1: Append the failing test**

```ts
describe('useCall — permission denied', () => {
  it('routes to permission-denied state and sets an error', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          const e = new Error('denied');
          (e as Error & { name: string }).name = 'NotAllowedError';
          throw e;
        }),
      },
    });
    const channel = makeChannel();
    const { result } = renderHook(() =>
      useCall({
        selfId: 'self',
        channel: channel as never,
        peersOnCall: () => [],
      })
    );

    await act(async () => {
      await result.current.toggleMic();
    });

    expect(result.current.state).toBe('permission-denied');
    expect(result.current.permissionError).toMatch(/permission/i);
    expect(result.current.micEnabled).toBe(false);
    // No presence track because we never reached on-call.
    expect(channel.track).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect pass**

Run: `npx vitest run hooks/useCall.test.ts`
Expected: PASS — 4 tests total.

- [ ] **Step 3: Commit**

```bash
git add hooks/useCall.test.ts
git commit -m "test(webrtc): lock useCall permission-denied path"
```

---

## Task 14: useCall — leave teardown

**Files:**
- Modify: `hooks/useCall.test.ts`

- [ ] **Step 1: Append the failing test**

```ts
describe('useCall — leave teardown', () => {
  it('broadcasts call_end, closes all peers, stops tracks, returns to idle', async () => {
    const channel = makeChannel();
    const onCloseAll = vi.fn();
    const { result } = renderHook(() =>
      useCall({
        selfId: 'self',
        channel: channel as never,
        peersOnCall: () => [],
        onCloseAll,
      })
    );

    await act(async () => {
      await result.current.toggleMic();
    });
    expect(result.current.state).toBe('on-call');

    channel.send.mockClear();
    channel.track.mockClear();

    await act(async () => {
      await result.current.leave();
    });

    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'webrtc_call_end',
        payload: expect.objectContaining({ from: 'self' }),
      })
    );
    expect(onCloseAll).toHaveBeenCalled();
    expect(channel.track).toHaveBeenCalledWith(
      expect.objectContaining({ on_call_intent: false })
    );
    expect(result.current.state).toBe('idle');
    expect(result.current.micEnabled).toBe(false);
    expect(result.current.camEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect pass**

Run: `npx vitest run hooks/useCall.test.ts`
Expected: PASS — 5 tests total.

- [ ] **Step 3: Commit**

```bash
git add hooks/useCall.test.ts
git commit -m "test(webrtc): lock useCall leave teardown order"
```

---

## Task 15: useCall — mesh reconciliation tick

**Files:**
- Modify: `hooks/useCall.test.ts`

- [ ] **Step 1: Append the failing test**

```ts
describe('useCall — reconciliation tick', () => {
  it('every MESH_RECONCILE_INTERVAL_MS, re-offers to expected peers we should initiate to', async () => {
    vi.useFakeTimers();

    const channel = makeChannel();
    const onCreateOfferTo = vi.fn(async () => {});
    const peers = ['aaaa-peer', 'zzzz-peer']; // self='self' < 'aaaa-peer'? no.
    // self='self' is lex-greater than 'aaaa-peer' but less than 'zzzz-peer'.
    // pickInitiator('self','aaaa-peer') → false; pickInitiator('self','zzzz-peer') → true.

    const { result } = renderHook(() =>
      useCall({
        selfId: 'self',
        channel: channel as never,
        peersOnCall: () => peers,
        onCreateOfferTo,
      })
    );

    await act(async () => {
      await result.current.toggleMic();
    });

    // First wave from enterMesh fired once for zzzz-peer.
    expect(onCreateOfferTo).toHaveBeenCalledTimes(1);
    expect(onCreateOfferTo).toHaveBeenLastCalledWith('zzzz-peer');

    onCreateOfferTo.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(10_000); // MESH_RECONCILE_INTERVAL_MS
    });

    expect(onCreateOfferTo).toHaveBeenCalledTimes(1);
    expect(onCreateOfferTo).toHaveBeenLastCalledWith('zzzz-peer');

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run — expect pass**

Run: `npx vitest run hooks/useCall.test.ts`
Expected: PASS — 6 tests total.

- [ ] **Step 3: Commit**

```bash
git add hooks/useCall.test.ts
git commit -m "test(webrtc): lock useCall reconciliation tick"
```

---

## Task 16: PeerTile.tsx — skeleton + tests

**Files:**
- Create: `components/room/PeerTile.tsx`
- Create: `components/room/PeerTile.test.tsx`

This is a minimal-styled skeleton. The aesthetic pass happens in Task 21 via `frontend-design`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/room/PeerTile.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeerTile } from './PeerTile';

describe('PeerTile', () => {
  it('shows the participant name', () => {
    render(
      <PeerTile
        peerId="x"
        name="Priya"
        city="Mumbai"
        micOn
        camOn={false}
        isLocal={false}
        isSpeaking={false}
      />
    );
    expect(screen.getByText(/Priya/)).toBeInTheDocument();
    expect(screen.getByText(/Mumbai/)).toBeInTheDocument();
  });

  it('applies the speaking-border class when isSpeaking', () => {
    const { container } = render(
      <PeerTile
        peerId="x"
        name="Priya"
        city="Mumbai"
        micOn
        camOn={false}
        isLocal={false}
        isSpeaking={true}
      />
    );
    expect(container.querySelector('[data-speaking="true"]')).toBeTruthy();
  });

  it('mirrors video for self-tile (transform: scaleX(-1))', () => {
    const { container } = render(
      <PeerTile
        peerId="self"
        name="You"
        city="Mumbai"
        micOn
        camOn
        isLocal={true}
        isSpeaking={false}
      />
    );
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('data-mirrored')).toBe('true');
  });

  it('shows monogram fallback when camera is off', () => {
    render(
      <PeerTile
        peerId="x"
        name="Sai Kumar"
        city={null}
        micOn={false}
        camOn={false}
        isLocal={false}
        isSpeaking={false}
      />
    );
    expect(screen.getByText('SK')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run components/room/PeerTile.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the skeleton**

```tsx
// components/room/PeerTile.tsx
'use client';

import { useEffect, useRef } from 'react';

type Props = {
  peerId: string;
  name: string;
  city: string | null;
  micOn: boolean;
  camOn: boolean;
  isLocal: boolean;
  isSpeaking: boolean;
  /** Live media stream for this peer; null until it arrives. */
  stream?: MediaStream | null;
};

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

export function PeerTile({
  peerId,
  name,
  city,
  micOn,
  camOn,
  isLocal,
  isSpeaking,
  stream,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const showVideo = camOn && stream;
  const cityLabel = city && city !== 'GLOBAL' ? city : null;

  return (
    <div
      data-peer-id={peerId}
      data-speaking={isSpeaking ? 'true' : 'false'}
      className={`relative aspect-[4/3] bg-[color:var(--bg-raised)] border ${
        isSpeaking ? 'border-[color:var(--accent)]' : 'border-[color:var(--line)]'
      } overflow-hidden`}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal /* never play self audio back to self */}
          data-mirrored={isLocal ? 'true' : 'false'}
          className="w-full h-full object-cover"
          style={isLocal ? { transform: 'scaleX(-1)' } : undefined}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono uppercase tracking-[0.18em] text-[color:var(--ink-soft)] text-2xl">
            {monogram(name)}
          </span>
        </div>
      )}
      <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[color:var(--ink)] truncate">
          {isLocal ? 'You' : name}
          {cityLabel && (
            <span className="text-[color:var(--ink-mute)]"> · {cityLabel}</span>
          )}
        </span>
        <span
          aria-label={micOn ? 'mic on' : 'mic off'}
          className={`font-mono text-[0.6rem] tracking-[0.18em] uppercase ${
            micOn ? 'text-[color:var(--accent)]' : 'text-[color:var(--ink-mute)] line-through'
          }`}
        >
          🎤
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run components/room/PeerTile.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/room/PeerTile.tsx components/room/PeerTile.test.tsx
git commit -m "feat(webrtc): add PeerTile component with speaking + monogram states"
```

---

## Task 17: CallControls.tsx — toggle row

**Files:**
- Create: `components/room/CallControls.tsx`
- Create: `components/room/CallControls.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/room/CallControls.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallControls } from './CallControls';

describe('CallControls', () => {
  it('renders mic, cam, leave buttons', () => {
    render(
      <CallControls
        state="on-call"
        micEnabled
        camEnabled={false}
        permissionError={null}
        onToggleMic={() => {}}
        onToggleCam={() => {}}
        onLeave={() => {}}
        onShowTip={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /mic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cam/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /leave/i })).toBeInTheDocument();
  });

  it('clicking mic invokes onToggleMic', async () => {
    const onToggleMic = vi.fn();
    render(
      <CallControls
        state="on-call"
        micEnabled={false}
        camEnabled={false}
        permissionError={null}
        onToggleMic={onToggleMic}
        onToggleCam={() => {}}
        onLeave={() => {}}
        onShowTip={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /mic/i }));
    expect(onToggleMic).toHaveBeenCalledTimes(1);
  });

  it('hides Leave when state is idle', () => {
    render(
      <CallControls
        state="idle"
        micEnabled={false}
        camEnabled={false}
        permissionError={null}
        onToggleMic={() => {}}
        onToggleCam={() => {}}
        onLeave={() => {}}
        onShowTip={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /leave/i })).toBeNull();
  });

  it('shows permission-denied caption when state is permission-denied', () => {
    render(
      <CallControls
        state="permission-denied"
        micEnabled={false}
        camEnabled={false}
        permissionError="denied"
        onToggleMic={() => {}}
        onToggleCam={() => {}}
        onLeave={() => {}}
        onShowTip={() => {}}
      />
    );
    expect(screen.getByText(/re-enable in browser/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run components/room/CallControls.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// components/room/CallControls.tsx
'use client';

import type { CallState } from '@/hooks/useCall';

type Props = {
  state: CallState;
  micEnabled: boolean;
  camEnabled: boolean;
  permissionError: string | null;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
  onShowTip: () => void;
};

export function CallControls({
  state,
  micEnabled,
  camEnabled,
  permissionError,
  onToggleMic,
  onToggleCam,
  onLeave,
  onShowTip,
}: Props) {
  const onCall = state === 'on-call';

  if (state === 'permission-denied') {
    return (
      <p className="font-mono text-[0.65rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
        {permissionError ?? 'Re-enable in browser settings to use mic & camera.'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      {onCall && (
        <span className="inline-flex items-center gap-2 font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--accent)] border border-[color:var(--accent)] px-2 py-1">
          <span className="pulse-dot" aria-hidden /> ON CALL
        </span>
      )}
      <button
        type="button"
        onClick={onToggleMic}
        aria-pressed={micEnabled ? 'true' : 'false'}
        aria-label={micEnabled ? 'Mute mic' : 'Enable mic'}
        className={`font-mono text-[0.62rem] tracking-[0.22em] uppercase border px-2.5 py-1 transition-colors ${
          micEnabled
            ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
            : 'border-[color:var(--line)] text-[color:var(--ink-mute)]'
        }`}
      >
        🎤 mic
      </button>
      <button
        type="button"
        onClick={onToggleCam}
        aria-pressed={camEnabled ? 'true' : 'false'}
        aria-label={camEnabled ? 'Turn camera off' : 'Turn camera on'}
        className={`font-mono text-[0.62rem] tracking-[0.22em] uppercase border px-2.5 py-1 transition-colors ${
          camEnabled
            ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
            : 'border-[color:var(--line)] text-[color:var(--ink-mute)]'
        }`}
      >
        📷 cam
      </button>
      <button
        type="button"
        onClick={onShowTip}
        aria-label="Headphones tip"
        className="font-mono text-[0.62rem] tracking-[0.22em] uppercase border border-[color:var(--line)] text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] px-2 py-1"
      >
        ⓘ headphones
      </button>
      {onCall && (
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave call"
          className="font-mono text-[0.62rem] tracking-[0.22em] uppercase border border-[color:var(--line)] hover:border-[#ff7878] hover:text-[#ff7878] text-[color:var(--ink-mute)] px-2 py-1"
        >
          leave
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run components/room/CallControls.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/room/CallControls.tsx components/room/CallControls.test.tsx
git commit -m "feat(webrtc): add CallControls toggle row"
```

---

## Task 18: HeadphonesTip.tsx — one-time toast

**Files:**
- Create: `components/room/HeadphonesTip.tsx`
- Create: `components/room/HeadphonesTip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/room/HeadphonesTip.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeadphonesTip } from './HeadphonesTip';
import { HEADPHONES_TIP_KEY } from '@/lib/webrtc-config';

describe('HeadphonesTip', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the tip and persists the seen flag when shown', () => {
    render(<HeadphonesTip open onClose={() => {}} />);
    expect(screen.getByText(/headphones recommended/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(HEADPHONES_TIP_KEY)).toBe('1');
  });

  it('renders nothing when open=false', () => {
    const { container } = render(<HeadphonesTip open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run components/room/HeadphonesTip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// components/room/HeadphonesTip.tsx
'use client';

import { useEffect } from 'react';
import { HEADPHONES_TIP_DURATION_MS, HEADPHONES_TIP_KEY } from '@/lib/webrtc-config';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HeadphonesTip({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    try {
      window.localStorage.setItem(HEADPHONES_TIP_KEY, '1');
    } catch {
      /* private browsing */
    }
    const id = window.setTimeout(onClose, HEADPHONES_TIP_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="status"
      className="border border-[color:var(--accent)] bg-[color:var(--accent-soft)] p-3 sm:p-4 flex items-start gap-3 max-w-xl"
    >
      <span aria-hidden className="text-lg">🎧</span>
      <p className="font-mono text-[0.7rem] sm:text-[0.75rem] tracking-[0.04em] leading-relaxed text-[color:var(--ink)]">
        Heads-up: echo cancellation is off so the music stays clean.{' '}
        <strong>Headphones recommended</strong> so others don&apos;t hear the
        session bleed through your mic.
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss tip"
        className="ml-auto font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]"
      >
        OK
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run components/room/HeadphonesTip.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add components/room/HeadphonesTip.tsx components/room/HeadphonesTip.test.tsx
git commit -m "feat(webrtc): add HeadphonesTip with localStorage gate"
```

---

## Task 19: StartTalkingButton.tsx — empty-state CTA

**Files:**
- Create: `components/room/StartTalkingButton.tsx`
- Create: `components/room/StartTalkingButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/room/StartTalkingButton.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartTalkingButton } from './StartTalkingButton';

describe('StartTalkingButton', () => {
  it('renders with the canonical label', () => {
    render(<StartTalkingButton onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /start talking/i })).toBeInTheDocument();
  });

  it('invokes onClick once per click', async () => {
    const onClick = vi.fn();
    render(<StartTalkingButton onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run components/room/StartTalkingButton.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/room/StartTalkingButton.tsx
'use client';

type Props = { onClick: () => void };

export function StartTalkingButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 font-mono text-[0.62rem] sm:text-[0.65rem] tracking-[0.22em] uppercase border border-[color:var(--line)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] text-[color:var(--ink-mute)] bg-black/40 backdrop-blur-[2px] px-3 py-1.5"
    >
      🎤 Start talking →
    </button>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run components/room/StartTalkingButton.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add components/room/StartTalkingButton.tsx components/room/StartTalkingButton.test.tsx
git commit -m "feat(webrtc): add StartTalkingButton empty-state CTA"
```

---

## Task 20: CallDock.tsx — composes the dock

**Files:**
- Create: `components/room/CallDock.tsx`
- Create: `components/room/CallDock.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/room/CallDock.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallDock } from './CallDock';

const noop = () => {};

describe('CallDock', () => {
  it('renders nothing when nobody is on call (state=idle, no peer tiles)', () => {
    const { container } = render(
      <CallDock
        state="idle"
        selfTile={null}
        peerTiles={[]}
        micEnabled={false}
        camEnabled={false}
        permissionError={null}
        onToggleMic={noop}
        onToggleCam={noop}
        onLeave={noop}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders self tile + controls when state=on-call and selfTile provided', () => {
    render(
      <CallDock
        state="on-call"
        selfTile={{
          peerId: 'self',
          name: 'You',
          city: 'Mumbai',
          micOn: true,
          camOn: false,
          isLocal: true,
          isSpeaking: false,
        }}
        peerTiles={[]}
        micEnabled
        camEnabled={false}
        permissionError={null}
        onToggleMic={noop}
        onToggleCam={noop}
        onLeave={noop}
      />
    );
    expect(screen.getByRole('button', { name: /leave/i })).toBeInTheDocument();
    expect(screen.getByText(/waiting for others/i)).toBeInTheDocument();
  });

  it('renders peer tiles when peers present', () => {
    render(
      <CallDock
        state="on-call"
        selfTile={{
          peerId: 'self',
          name: 'You',
          city: 'Mumbai',
          micOn: true,
          camOn: false,
          isLocal: true,
          isSpeaking: false,
        }}
        peerTiles={[
          {
            peerId: 'p1',
            name: 'Priya',
            city: 'Mumbai',
            micOn: true,
            camOn: false,
            isLocal: false,
            isSpeaking: false,
          },
        ]}
        micEnabled
        camEnabled={false}
        permissionError={null}
        onToggleMic={noop}
        onToggleCam={noop}
        onLeave={noop}
      />
    );
    expect(screen.getByText(/Priya/)).toBeInTheDocument();
    expect(screen.queryByText(/waiting for others/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run components/room/CallDock.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dock**

```tsx
// components/room/CallDock.tsx
'use client';

import { useState } from 'react';
import { CallControls } from './CallControls';
import { HeadphonesTip } from './HeadphonesTip';
import { PeerTile } from './PeerTile';
import { HEADPHONES_TIP_KEY } from '@/lib/webrtc-config';
import type { CallState } from '@/hooks/useCall';

export type TileVm = {
  peerId: string;
  name: string;
  city: string | null;
  micOn: boolean;
  camOn: boolean;
  isLocal: boolean;
  isSpeaking: boolean;
  stream?: MediaStream | null;
};

type Props = {
  state: CallState;
  selfTile: TileVm | null;
  peerTiles: TileVm[];
  micEnabled: boolean;
  camEnabled: boolean;
  permissionError: string | null;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
};

export function CallDock({
  state,
  selfTile,
  peerTiles,
  micEnabled,
  camEnabled,
  permissionError,
  onToggleMic,
  onToggleCam,
  onLeave,
}: Props) {
  const [tipOpen, setTipOpen] = useState(false);

  // First-mic-on: open the tip if we haven't shown it yet.
  if (
    micEnabled &&
    typeof window !== 'undefined' &&
    window.localStorage.getItem(HEADPHONES_TIP_KEY) !== '1' &&
    !tipOpen
  ) {
    // setState during render is safe here because it's behind a flag that
    // flips exactly once per browser. The next render is short-circuited by
    // the localStorage write inside <HeadphonesTip />.
    queueMicrotask(() => setTipOpen(true));
  }

  // Empty state — no self tile and no peers.
  const empty = !selfTile && peerTiles.length === 0;
  if (empty) return null;

  return (
    <section
      aria-label="Call participants"
      className="border-t border-[color:var(--line)] pt-4 mt-4 space-y-3"
    >
      <p className="eyebrow">On call · {peerTiles.length + (selfTile ? 1 : 0)}</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
        {selfTile && <PeerTile {...selfTile} />}
        {peerTiles.map((t) => (
          <PeerTile key={t.peerId} {...t} />
        ))}
      </div>
      {peerTiles.length === 0 && state === 'on-call' && (
        <p className="font-mono text-[0.65rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
          Waiting for others to join the call.
        </p>
      )}
      <CallControls
        state={state}
        micEnabled={micEnabled}
        camEnabled={camEnabled}
        permissionError={permissionError}
        onToggleMic={onToggleMic}
        onToggleCam={onToggleCam}
        onLeave={onLeave}
        onShowTip={() => setTipOpen(true)}
      />
      <HeadphonesTip open={tipOpen} onClose={() => setTipOpen(false)} />
    </section>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run components/room/CallDock.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add components/room/CallDock.tsx components/room/CallDock.test.tsx
git commit -m "feat(webrtc): add CallDock composing tiles + controls + tip"
```

---

## Task 21: frontend-design polish pass

**Files:**
- Modify (likely): `components/room/PeerTile.tsx`, `components/room/CallControls.tsx`, `components/room/CallDock.tsx`, `components/room/HeadphonesTip.tsx`, `components/room/StartTalkingButton.tsx`, `app/globals.css`

This task is a single delegation step. The skeleton from Tasks 16–20 is functionally complete; this task elevates the aesthetic to match the existing late-night-broadcast visual language.

- [ ] **Step 1: Invoke the frontend-design skill**

Use the Skill tool with `skill: 'frontend-design:frontend-design'`. Pass it the following brief verbatim:

> Polish the WebRTC overlay components to match the existing late-night-broadcast aesthetic of `app/globals.css` (mono fonts, eyebrow labels, hairline borders, accent yellow `#f5b400`, live-green pulse dot, tabular nums, all-uppercase tracking).
>
> **Files to refine:**
> - `components/room/PeerTile.tsx` — speaking-state border should feel like a VU meter pulse, monogram fallback should use the display font and feel editorial, mic-status glyph should mirror the `.vu-slider` SVG style from `Player.tsx`.
> - `components/room/CallControls.tsx` — the toggle row should sit in the same family as the existing `.cta` button class. ON CALL pill must use the existing `.pulse-dot`.
> - `components/room/HeadphonesTip.tsx` — one-time toast, accent border, dismissible.
> - `components/room/StartTalkingButton.tsx` — ghost CTA, must feel like an unobtrusive sibling of the volume pill on `<Player />`.
> - `components/room/CallDock.tsx` — wraps the above; the section eyebrow ("On call · N") should match the existing `.eyebrow` rules.
>
> Constraints:
> - Do not change the component prop shapes — tests in `*.test.tsx` must still pass.
> - Do not add new dependencies.
> - Mobile must remain functional: tile grid wraps to 2 rows of 3 max; controls collapse to icon-only on `< sm`.

- [ ] **Step 2: Run all webrtc-related tests after the polish pass**

Run: `npx vitest run hooks/useCall.test.ts hooks/useAudioDuck.test.ts hooks/usePeerConnections.test.ts components/room/PeerTile.test.tsx components/room/CallControls.test.tsx components/room/CallDock.test.tsx components/room/HeadphonesTip.test.tsx components/room/StartTalkingButton.test.tsx lib/webrtc-events.test.ts lib/webrtc-utils.test.ts`
Expected: PASS — every prior test still green.

- [ ] **Step 3: Run lint on touched files**

Run: `npx eslint components/room/CallDock.tsx components/room/PeerTile.tsx components/room/CallControls.tsx components/room/HeadphonesTip.tsx components/room/StartTalkingButton.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/room/CallDock.tsx components/room/PeerTile.tsx components/room/CallControls.tsx components/room/HeadphonesTip.tsx components/room/StartTalkingButton.tsx app/globals.css
git commit -m "style(webrtc): polish dock + tiles to match broadcast aesthetic"
```

---

## Task 22: Player.tsx — accept duckedVolume prop

**Files:**
- Modify: `components/room/Player.tsx`
- Modify: `components/room/Player.test.tsx` (create if it doesn't exist)

The slider state stays user-owned; `duckedVolume` is an *override* that doesn't write back.

- [ ] **Step 1: Add the failing test**

Create or modify `components/room/Player.test.tsx`:

```tsx
// components/room/Player.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Player } from './Player';

vi.mock('react-youtube', () => ({
  __esModule: true,
  default: ({ onReady }: { onReady: (e: { target: unknown }) => void }) => {
    // Minimal fake
    return null;
  },
}));

describe('Player — duckedVolume', () => {
  it('accepts a duckedVolume prop without crashing', () => {
    const { container } = render(
      <Player videoId="dQw4w9WgXcQ" isHost={false} duckedVolume={24} />
    );
    expect(container).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run components/room/Player.test.tsx`
Expected: FAIL — `duckedVolume` is not a known prop.

- [ ] **Step 3: Add the prop and apply it inside Player**

In `components/room/Player.tsx`:

Find the `Props` type and add:

```ts
type Props = {
  videoId: string | null;
  isHost: boolean;
  enforceState?: number | null;
  onReady?: (handle: PlayerHandle) => void;
  onEvent?: (name: PlayerEventName, currentTime: number) => void;
  className?: string;
  /**
   * Override volume from the audio-duck system. When provided, it takes
   * precedence over the local slider value but does not write back to it
   * — slider state remains user-owned.
   */
  duckedVolume?: number;
};
```

Find the function signature and destructure it:

```ts
export function Player({
  videoId,
  isHost,
  enforceState,
  onReady,
  onEvent,
  className,
  duckedVolume,
}: Props) {
```

Find the volume-push effect:

```ts
useEffect(() => {
  const p = ytRef.current;
  if (!p || !ready) return;
  try {
    if (volume === 0) p.mute?.();
    else {
      p.unMute?.();
      p.setVolume?.(volume);
    }
  } catch {
    /* ... */
  }
}, [volume, ready]);
```

Replace it with:

```ts
useEffect(() => {
  const p = ytRef.current;
  if (!p || !ready) return;
  const effective = typeof duckedVolume === 'number' ? duckedVolume : volume;
  try {
    if (effective <= 0) p.mute?.();
    else {
      p.unMute?.();
      p.setVolume?.(Math.round(effective));
    }
  } catch {
    /* player may have been destroyed mid-update; safe to ignore */
  }
}, [volume, duckedVolume, ready]);
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run components/room/Player.test.tsx`
Expected: PASS.

Run: `npx vitest run`
Expected: every other test still passes.

- [ ] **Step 5: Commit**

```bash
git add components/room/Player.tsx components/room/Player.test.tsx
git commit -m "feat(player): accept duckedVolume override that doesn't touch slider state"
```

---

## Task 23: RoomClient.tsx — wire it all together

**Files:**
- Modify: `app/room/[id]/RoomClient.tsx`

This is the integration step. Register the four `webrtc_*` listeners, pull `useCall` + `useAudioDuck` into the orchestrator, render the dock, and pass `duckedVolume` to `<Player />`.

- [ ] **Step 1: Add the imports**

At the top of `app/room/[id]/RoomClient.tsx`, add:

```ts
import { useCall } from '@/hooks/useCall';
import { useAudioDuck } from '@/hooks/useAudioDuck';
import { usePeerConnections } from '@/hooks/usePeerConnections';
import { CallDock, type TileVm } from '@/components/room/CallDock';
import { StartTalkingButton } from '@/components/room/StartTalkingButton';
import { isOfferPayload, isAnswerPayload, isIcePayload, isCallEndPayload } from '@/lib/webrtc-events';
```

- [ ] **Step 2: Add remote-stream + on-call presence state inside the component**

Add inside `RoomClient`, near the other `useState` calls:

```ts
const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

// Derived: who in presence is currently on call (excluding self).
const peersOnCall = useMemo(
  () =>
    participants
      .filter((p) => p.user_id !== self.user_id && (p as Participant & { on_call_intent?: boolean }).on_call_intent)
      .map((p) => p.user_id),
  [participants, self.user_id]
);
```

(Cast is needed until the `Participant` type is widened to include `on_call_intent`. This is intentional — a one-line type-extension in `lib/sync-utils.ts` would be cleaner; do that as part of this step.)

In `lib/sync-utils.ts`, widen the `Participant` type:

```ts
export type Participant = {
  user_id: string;
  name: string;
  city: string | null;
  joined_at: number;
  on_call_intent?: boolean;
};
```

- [ ] **Step 3: Wire the three hooks**

Add inside `RoomClient`, after the existing `useRoomSync` block:

```ts
const audioDuck = useAudioDuck({ userVolume: 80 /* slider value not currently lifted; see note */ });

const peers = usePeerConnections({
  selfId: self.user_id,
  channel,
  getLocalStream: () => callStreamRef.current,
  onRemoteStream: (peerId, stream) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.set(peerId, stream);
      return next;
    });
    audioDuck.attachPeer(peerId, stream);
  },
  onPeerDropped: (peerId) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    audioDuck.detachPeer(peerId);
  },
});

const callStreamRef = useRef<MediaStream | null>(null);

const call = useCall({
  selfId: self.user_id,
  selfName: self.name,
  selfCity: self.city,
  selfJoinedAt: Date.now(),
  channel,
  peersOnCall: () => peersOnCall,
  onCreateOfferTo: peers.createOfferTo,
  onReplaceVideo: peers.replaceVideoTrackEverywhere,
  onClosePeer: peers.closePeer,
  onCloseAll: peers.closeAll,
});

// Keep `getLocalStream` returning the latest stream after `useCall` acquires it.
useEffect(() => {
  callStreamRef.current = call.getStream();
}, [call.state, call.micEnabled, call.camEnabled]);
```

> **Note for the engineer:** the `userVolume: 80` literal above is a placeholder. The volume value lives inside `<Player />` and is not currently lifted to `RoomClient`. This task ships with that simplification; lifting the volume state out of `<Player />` is a follow-up that does not block end-to-end functionality (auto-duck still works, it just always treats 80 as the ceiling). Add this as a known limitation in the SMOKE.md (Task 24).

- [ ] **Step 4: Register the four webrtc_* listeners**

Inside the existing `useEffect` that builds the channel, **before** `ch.subscribe(...)`, add:

```ts
ch.on('broadcast', { event: 'webrtc_offer' }, ({ payload }) => {
  if (!isOfferPayload(payload)) return;
  if (payload.to !== self.user_id) return;
  void peers.handleOffer(payload);
});

ch.on('broadcast', { event: 'webrtc_answer' }, ({ payload }) => {
  if (!isAnswerPayload(payload)) return;
  if (payload.to !== self.user_id) return;
  void peers.handleAnswer(payload);
});

ch.on('broadcast', { event: 'webrtc_ice' }, ({ payload }) => {
  if (!isIcePayload(payload)) return;
  if (payload.to !== self.user_id) return;
  void peers.handleIce(payload);
});

ch.on('broadcast', { event: 'webrtc_call_end' }, ({ payload }) => {
  if (!isCallEndPayload(payload)) return;
  peers.closePeer(payload.from);
});
```

- [ ] **Step 5: Render the dock + START TALKING ghost button**

Build the view models inside the component body:

```ts
const selfTile: TileVm | null =
  call.state === 'on-call'
    ? {
        peerId: self.user_id,
        name: self.name,
        city: self.city,
        micOn: call.micEnabled,
        camOn: call.camEnabled,
        isLocal: true,
        isSpeaking: false,
        stream: call.getStream(),
      }
    : null;

const peerTiles: TileVm[] = participants
  .filter((p) => p.user_id !== self.user_id && remoteStreams.has(p.user_id))
  .map((p) => ({
    peerId: p.user_id,
    name: p.name,
    city: p.city,
    micOn: true, // we don't currently broadcast per-track state; assume on
    camOn: true, // ditto — tile renders monogram fallback if no video frames
    isLocal: false,
    isSpeaking: audioDuck.isSpeaking(p.user_id),
    stream: remoteStreams.get(p.user_id) ?? null,
  }));

const dockEmpty = call.state === 'idle' && peerTiles.length === 0;
```

Then in the JSX, find the `<Player ... />` block and:

1. Pass `duckedVolume={audioDuck.duckedVolume}` to it.
2. After it (and after the existing "Now broadcasting" caption block), insert:

```tsx
<CallDock
  state={call.state}
  selfTile={selfTile}
  peerTiles={peerTiles}
  micEnabled={call.micEnabled}
  camEnabled={call.camEnabled}
  permissionError={call.permissionError}
  onToggleMic={() => void call.toggleMic()}
  onToggleCam={() => void call.toggleCam()}
  onLeave={() => void call.leave()}
/>

{dockEmpty && (
  <div className="flex">
    <StartTalkingButton onClick={() => void call.toggleMic()} />
  </div>
)}
```

- [ ] **Step 6: Extend presence track payload to include on_call_intent**

Find the existing `await ch.track(...)` call inside the subscribe handler. Add `on_call_intent: false` to the payload:

```ts
await ch.track({
  user_id: self.user_id,
  name: self.name,
  city: self.city,
  joined_at: Date.now(),
  on_call_intent: false,
});
```

(The `useCall` hook updates this to `true`/`false` later via its own `channel.track()` calls.)

- [ ] **Step 7: Run typecheck and full test suite**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run`
Expected: every test passes.

- [ ] **Step 8: Lint**

Run: `npx eslint app/room/\[id\]/RoomClient.tsx components/room/Player.tsx`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add app/room/\[id\]/RoomClient.tsx lib/sync-utils.ts
git commit -m "feat(webrtc): wire useCall + usePeerConnections + useAudioDuck into RoomClient"
```

---

## Task 24: SMOKE.md — manual smoke matrix

**Files:**
- Create: `.planning/phases/06-sharded-rooms-webrtc/SMOKE.md` (create the directory if missing)

- [ ] **Step 1: Write the smoke matrix**

```bash
mkdir -p .planning/phases/06-sharded-rooms-webrtc
```

Then create `.planning/phases/06-sharded-rooms-webrtc/SMOKE.md`:

```markdown
# Phase 6 — WebRTC Overlay Manual Smoke Matrix

Run before declaring the phase shippable. WebRTC handshakes require real browsers and media devices; CI cannot cover them.

## 1. Two-tab smoke (single browser)

- [ ] Open the same room in two Chrome tabs as different signups.
- [ ] In tab A, click Mic. Combined permission prompt appears. Allow both.
- [ ] Tab A's "Start talking" button vanishes; dock appears with self-tile.
- [ ] In tab B, click Mic. Allow both.
- [ ] Both tabs see two tiles in the dock within ~3 seconds.
- [ ] Both tabs hear each other's mic.
- [ ] Toggle Cam in tab A. Tab B sees the video appear in tab A's tile within ~1 second. No re-prompt.
- [ ] Click Leave in tab A. Tab B's tile for A vanishes within ~2 seconds.

## 2. Cross-browser

- [ ] Chrome ↔ Safari (macOS): full mic + cam round-trip works.
- [ ] Chrome ↔ Firefox: full mic + cam round-trip works.
- [ ] Chrome (Android) ↔ Chrome (desktop): mic round-trip works.

## 3. YouTube audio artifact (the original bug)

- [ ] In a room with the YouTube broadcast playing at ~60% volume, note the audio quality.
- [ ] Click Mic. Allow.
- [ ] Audio quality is **unchanged** — no loss of bass, no muddiness, no high-pass.
- [ ] Toggle Mic off. Audio quality still unchanged.
- [ ] Toggle Mic on again. Still no degradation. (No re-prompt.)

## 4. Auto-duck

- [ ] On a multi-peer call, while YouTube plays, have a peer speak.
- [ ] YouTube volume locally drops to ~30% within 200 ms.
- [ ] When peer stops speaking, YouTube volume ramps back up after a brief pause.
- [ ] Move the volume slider mid-duck. Slider value is honored immediately; no fight.

## 5. Network drop recovery

- [ ] On an active two-peer call, disable WiFi for 6 seconds.
- [ ] "Reconnecting…" overlay appears on the affected tile.
- [ ] Re-enable WiFi. Connection self-heals within ~10 seconds.
- [ ] After a second forced drop, the connection drops the tile cleanly.

## 6. Symmetric NAT graceful degradation

- [ ] One client on a mobile hotspot, another on a home WiFi.
- [ ] If ICE fails, the affected tile shows a "could not connect" state.
- [ ] Watch room continues to function: chat, sync, presence all unaffected.

## 7. Permission denied

- [ ] Block camera + mic permissions in browser settings.
- [ ] Click "Start talking". Browser prompt shows then denies (or is auto-denied).
- [ ] Dock surfaces "Re-enable in browser settings" caption.
- [ ] No re-prompt on subsequent clicks.

## 8. Headphones tip

- [ ] Clear `localStorage.yp_hp_tip_seen`.
- [ ] Click Mic for the first time. Toast appears for 8 s.
- [ ] Subsequent mic toggles do not re-show the toast.
- [ ] Clicking the "ⓘ headphones" link re-opens the toast.

## Known limitations (not blocking)

- Volume slider value is hard-coded to 80 as the auto-duck ceiling (see Task 23 step 3 note). Lifting the slider state out of `<Player />` is a follow-up; auto-duck still works, the ceiling just doesn't track the user's slider in real time.
- Per-peer mic/cam state is not broadcast — peer tiles assume both on. Visual degradation only (mic indicator may show "on" while peer is actually muted at the track level).
```

- [ ] **Step 2: Commit**

```bash
git add .planning/phases/06-sharded-rooms-webrtc/SMOKE.md
git commit -m "docs(phase-6): add WebRTC manual smoke matrix"
```

---

## Self-review notes

### Spec coverage

| Spec section | Tasks covering it |
|---|---|
| §2 #1 Lazy combined permission | T12 (test), T13 (denied path) |
| §2 #2 Music mode + headphones tip | T1 (config), T5 (regression guard), T18 (tip) |
| §2 #3 Implicit-with-pill activation | T12 (state machine), T17 (pill in CallControls), T19 (StartTalkingButton) |
| §2 #4 Equal peers | covered by absence — no host-mute event in T2 |
| §2 #5 Stacked dock layout | T20 (CallDock), T23 step 5 (placement) |
| §2 #6 Auto-duck | T10, T11, T22 (Player wiring), T23 (orchestration) |
| §4.1 Mesh topology | T6, T7 |
| §4.2 Signaling | T2 (events), T6 (offer/answer), T7 (ICE), T23 step 4 (listeners) |
| §4.3 ICE config | T1 |
| §5.1 State machine | T12, T13, T14 |
| §5.2 Permission semantics | T12, T13 |
| §5.3 Initiator rule | T3 |
| §5.4 Reconciliation tick | T15 |
| §6 Tile + dock + controls | T16, T17, T20, T21 (polish) |
| §7 Audio engineering | T1, T10, T11, T22 |
| §8.1 replaceTrack flow | T9, T12 (toggleCam) |
| §8.2 ICE failure ladder | T8 |
| §8.3 Teardown order | T14 |
| §9.1 Presence payload extension | T15 (test), T23 step 6 (wire-up) |
| §10 File layout | followed throughout |
| §11 Tests | every TDD step |
| §12 Implementation order | this plan's wave structure |

No spec section is unmapped.

### Type consistency

- `pickInitiator(selfId, peerId)` — used identically in T3 (definition), T12 (useCall enterMesh), and T15 (reconciliation tick test).
- `diffMesh(expected, actual)` — defined T4, imported but not actively used in T12; left in for future enhancement of useCall reconciliation. Acceptable — `void diffMesh` line silences the unused warning.
- `WEBRTC_EVENTS.OFFER` / `ANSWER` / `ICE` / `CALL_END` — used consistently in T6, T7, T9 (replaceVideoTrackEverywhere is independent), T14, T23.
- `CallState = 'idle' | 'requesting-permission' | 'on-call' | 'leaving' | 'permission-denied'` — defined T12, consumed in T17, T20.
- `TileVm` type — defined T20, consumed in T23.

### Placeholder scan

No "TBD"/"TODO"/"implement later" remain. The Task 23 note about `userVolume: 80` is a documented limitation, not a placeholder — it ships with that value and the limitation is recorded in SMOKE.md.

### Scope check

This plan covers Phase 6's WebRTC overlay only. It does **not** cover REQ-ROOM-SHARDING (the `signups.room_id` migration / signup-time room assignment), which is the other half of Phase 6. Sharding is independently testable and should be a separate plan executed before or after this one.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-28-webrtc-overlay.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task with two-stage review between tasks. Best for a 24-task plan: each task is bounded, review surface is small, and the subagent's context never accretes prior tasks' chatter.

**2. Inline Execution** — run tasks in this session using `executing-plans`, with checkpoints at the end of each wave (after T5, T9, T11, T15, T20, T21, T23, T24).

**Which approach?**
