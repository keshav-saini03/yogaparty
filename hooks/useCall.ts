'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { MEDIA_CONSTRAINTS, MESH_RECONCILE_INTERVAL_MS } from '@/lib/webrtc-config';
import { WEBRTC_EVENTS } from '@/lib/webrtc-events';
import { pickInitiator } from '@/lib/webrtc-utils';

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

  // Stash the latest args in a ref so callbacks/effects can read fresh values
  // without depending on the (always-new-identity) args object. Without this
  // the reconciliation effect tears down its interval on every parent render.
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  });

  const updatePresence = useCallback(async (onCallIntent: boolean) => {
    const a = argsRef.current;
    if (!a.channel) return;
    const payload: Partial<CallPresenceExtras> = {
      user_id: a.selfId,
      name: a.selfName ?? '',
      city: a.selfCity ?? null,
      joined_at: a.selfJoinedAt ?? Date.now(),
      on_call_intent: onCallIntent,
    };
    try {
      await a.channel.track(payload as never);
    } catch {
      /* presence may not be subscribed yet; ignore */
    }
  }, []);

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
    // Closure-stale state read: callers (toggleMic/toggleCam) capture state from
    // render time; on first call state is 'idle' (or 'requesting-permission'
    // mid-acquireStream), so the negative check correctly admits us to mesh
    // entry. Don't refactor to `state === 'idle'` — that would block entry from
    // mid-permission-flight.
    if (state !== 'on-call') {
      setState('on-call');
      await updatePresence(true);
      const a = argsRef.current;
      // Initiate offers to anyone we should reach (deterministic rule).
      for (const peerId of a.peersOnCall()) {
        if (pickInitiator(a.selfId, peerId)) {
          await a.onCreateOfferTo?.(peerId);
        }
      }
    }
    // Intentionally narrow — argsRef holds latest
     
  }, [state, updatePresence]);

  const toggleMic = useCallback(async () => {
    if (state === 'leaving') return;
    if (!streamRef.current) {
      const s = await acquireStream();
      if (!s) return;
    }
    const track = streamRef.current!.getAudioTracks()[0];
    if (!track) return;
    const willEnable = !micEnabled;
    track.enabled = willEnable;
    setMic(willEnable);
    await enterMesh();
    // Intentionally narrow — argsRef holds latest
     
  }, [state, acquireStream, enterMesh, micEnabled]);

  const toggleCam = useCallback(async () => {
    if (state === 'leaving') return;
    if (!streamRef.current) {
      const s = await acquireStream();
      if (!s) return;
    }
    const track = streamRef.current!.getVideoTracks()[0];
    if (!track) return;
    const willEnable = !camEnabled;
    track.enabled = willEnable;
    setCam(willEnable);
    await argsRef.current.onReplaceVideo?.(willEnable ? track : null);
    await enterMesh();
    // Intentionally narrow — argsRef holds latest
     
  }, [state, acquireStream, enterMesh, camEnabled]);

  const leave = useCallback(async () => {
    if (state === 'idle' || state === 'leaving') return;
    setState('leaving');
    const a = argsRef.current;
    // 1. Broadcast call_end (fire-and-forget — peers update tiles fast).
    a.channel?.send({
      type: 'broadcast',
      event: WEBRTC_EVENTS.CALL_END,
      payload: { from: a.selfId, sentAt: Date.now() },
    });
    // 2. Flip presence intent BEFORE tearing down PCs so peers don't see a
    //    brief on_call_intent=true window during teardown (spec §8.3).
    await updatePresence(false);
    // 3. Now tear down peer connections.
    a.onCloseAll?.();
    // 4. Stop local tracks and release the stream.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // 5. Reset toggles and return to idle.
    setMic(false);
    setCam(false);
    setState('idle');
    // Intentionally narrow — argsRef holds latest
     
  }, [state, updatePresence]);

  // Mesh reconciliation tick — catches missed call_ends and self-heals.
  // Depends only on `state`; reads fresh args from argsRef so the interval
  // survives parent re-renders (the bug we're fixing).
  useEffect(() => {
    if (state !== 'on-call') return;
    const id = window.setInterval(() => {
      const a = argsRef.current;
      const expected = a.peersOnCall();
      // We don't have the actual PC set here; the orchestrator passes it in
      // via onCreateOfferTo decisions. As a simplification we just (re-)offer
      // to any expected peer for whom we should be initiator. The PC hook
      // dedupes (returns existing slot) so this is idempotent.
      for (const peerId of expected) {
        if (pickInitiator(a.selfId, peerId)) {
          a.onCreateOfferTo?.(peerId);
        }
      }
      // Closures: anyone we have a PC with but who is no longer in expected
      // is detected by the orchestrator's webrtc_call_end / iceconnection
      // ladder; useCall doesn't own that bookkeeping.
    }, MESH_RECONCILE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [state]);

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
