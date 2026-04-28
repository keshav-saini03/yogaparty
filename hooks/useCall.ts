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
    const willEnable = !micEnabled;
    track.enabled = willEnable;
    setMic(willEnable);
    await enterMesh();
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
    await args.onReplaceVideo?.(willEnable ? track : null);
    await enterMesh();
  }, [state, acquireStream, enterMesh, args, camEnabled]);

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
