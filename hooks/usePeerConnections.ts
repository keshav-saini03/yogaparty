'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
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
  /**
   * Late-attach hook for the inbound-offer-before-permission race: if a peer
   * sends us an offer before our `getUserMedia` has resolved, the PC was
   * built with no local tracks, so the answer is recvonly and the offerer
   * sees a black tile. Call this when the stream finally resolves to push
   * tracks onto every existing PC's senders via `replaceTrack`.
   */
  attachLocalStream: (stream: MediaStream) => Promise<void>;
  peerIds: () => string[];
};

/**
 * Owns the lifecycle of one `RTCPeerConnection` per remote peer in the room.
 *
 * Mechanics mirror the proven watch-mate pattern: `new RTCPeerConnection` →
 * `addTrack` per local track → done. We do NOT pre-allocate transceivers,
 * because the offerer/answerer interaction with pre-allocated transceivers +
 * `addTrack` + `setRemoteDescription(offer)` was producing one-way media
 * (offerer sees ICE connected but never gets `ontrack`). The simpler path
 * matches what browsers test the most heavily.
 *
 * Recovery policy (spec §8.2): on `iceConnectionState === 'failed'`, attempt
 * exactly one ICE restart. A second failure closes the PC and drops the slot.
 */
export function usePeerConnections(args: Args): PeerConnections {
  const slotsRef = useRef<Map<string, Slot>>(new Map());
  /**
   * Per-peer queue of ICE candidates that arrived before we had a slot for
   * them OR before `setRemoteDescription` had been applied. Drained inside
   * `handleOffer` / `handleAnswer` after the remote description is set.
   * Mirrors watch-mate's `iceCandidateQueues`.
   */
  const iceQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const send = useCallback(
    (event: string, payload: unknown) => {
      args.channel?.send({ type: 'broadcast', event, payload });
    },
    [args.channel]
  );

  const getQueue = useCallback((peerId: string): RTCIceCandidateInit[] => {
    let q = iceQueueRef.current.get(peerId);
    if (!q) {
      q = [];
      iceQueueRef.current.set(peerId, q);
    }
    return q;
  }, []);

  const drainIceQueue = useCallback(async (peerId: string) => {
    const slot = slotsRef.current.get(peerId);
    const queue = iceQueueRef.current.get(peerId);
    if (!slot || !queue || queue.length === 0) return;
    const drained = queue.splice(0, queue.length);
    for (const c of drained) {
      try {
        await slot.pc.addIceCandidate(c);
      } catch (err) {
        console.warn('[rtc] drainIceQueue: addIceCandidate failed', {
          peer: peerId,
          err: (err as Error).message,
        });
      }
    }
  }, []);

  const closeSlot = useCallback(
    (peerId: string) => {
      const slot = slotsRef.current.get(peerId);
      if (!slot) {
        iceQueueRef.current.delete(peerId);
        return;
      }
      if (slot.graceTimer !== null) window.clearTimeout(slot.graceTimer);
      slot.pc.getSenders().forEach((s) => {
        try {
          s.track?.stop?.();
        } catch {
          /* track may already be stopped */
        }
      });
      try {
        slot.pc.close();
      } catch {
        /* already closed */
      }
      slotsRef.current.delete(peerId);
      iceQueueRef.current.delete(peerId);
      args.onPeerDropped?.(peerId);
    },
    // Intentionally narrow: stabilizing callback identity is the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [args.onPeerDropped]
  );

  const buildPc = useCallback(
    (peerId: string): Slot => {
      const pc = new RTCPeerConnection(PC_CONFIG);

      const local = args.getLocalStream();
      const trackCount = local?.getTracks().length ?? 0;
      console.log('[rtc] buildPc', {
        self: args.selfId,
        peer: peerId,
        hasLocal: !!local,
        trackCount,
      });
      // Watch-mate pattern: just addTrack. The transceivers are auto-created
      // with our local tracks attached, and `setRemoteDescription` matches
      // them by m-line index cleanly.
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
        console.log('[rtc] ontrack', {
          self: args.selfId,
          peer: peerId,
          kind: e.track.kind,
          hasStream: !!e.streams[0],
        });
        if (e.streams[0]) args.onRemoteStream?.(peerId, e.streams[0]);
      };

      const slot: Slot = { pc, restartedOnce: false, graceTimer: null };

      const handleFailureRecovery = () => {
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
              // Peer may have left or PC is wedged; drop the slot so we
              // don't leave it stuck with restartedOnce=true forever.
              closeSlot(peerId);
            }
          })();
          return;
        }
        // Second failure → drop.
        closeSlot(peerId);
      };

      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        console.log('[rtc] iceState', { self: args.selfId, peer: peerId, state: s });
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
            // Browsers (notably Firefox) may sit in 'disconnected' forever
            // without promoting to 'failed'. Drive recovery ourselves if
            // the state hasn't recovered after the grace window.
            if (pc.iceConnectionState === 'disconnected') {
              handleFailureRecovery();
            }
          }, ICE_DISCONNECTED_GRACE_MS);
          return;
        }
        if (s === 'failed') {
          handleFailureRecovery();
          return;
        }
        if (s === 'closed') {
          closeSlot(peerId);
        }
      };

      return slot;
    },
    // Intentionally narrow — stable callback identity for downstream effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [args.selfId, args.getLocalStream, args.onRemoteStream, send, closeSlot]
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
      console.log('[rtc] createOfferTo →', { self: args.selfId, peer: peerId });
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
      console.log('[rtc] handleOffer ←', { self: args.selfId, from: p.from });
      const { pc } = ensureSlot(p.from);
      await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
      // Drain any ICE candidates that arrived before the offer reached us.
      await drainIceQueue(p.from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send(WEBRTC_EVENTS.ANSWER, {
        from: args.selfId,
        to: p.from,
        sdp: answer.sdp ?? '',
        sentAt: Date.now(),
      });
    },
    [ensureSlot, send, args.selfId, drainIceQueue]
  );

  const handleAnswer = useCallback(
    async (p: WebRtcAnswerPayload) => {
      console.log('[rtc] handleAnswer ←', { from: p.from });
      const slot = slotsRef.current.get(p.from);
      if (!slot) {
        console.warn('[rtc] handleAnswer: no slot for', p.from);
        return;
      }
      await slot.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
      // Drain any ICE candidates that arrived before the answer.
      await drainIceQueue(p.from);
    },
    [drainIceQueue]
  );

  const handleIce = useCallback(async (p: WebRtcIcePayload) => {
    const slot = slotsRef.current.get(p.from);
    // No slot yet OR remote description not set → queue and drain later.
    // This mirrors watch-mate's `iceCandidateQueues` and prevents the silent-
    // drop bug where ICE candidates from an inbound offer arrive before the
    // offer itself does (rare but possible across realtime broadcasts).
    if (!slot || !slot.pc.remoteDescription) {
      const q = getQueue(p.from);
      q.push(p.candidate);
      return;
    }
    try {
      await slot.pc.addIceCandidate(p.candidate);
    } catch (err) {
      console.warn('[rtc] handleIce: addIceCandidate failed', {
        from: p.from,
        hasRemote: !!slot.pc.remoteDescription,
        err: (err as Error).message,
      });
    }
  }, [getQueue]);

  const closePeer = useCallback(
    (peerId: string) => {
      closeSlot(peerId);
    },
    [closeSlot]
  );

  const closeAll = useCallback(() => {
    for (const peerId of [...slotsRef.current.keys()]) closeSlot(peerId);
    iceQueueRef.current.clear();
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

  const attachLocalStream = useCallback(async (stream: MediaStream) => {
    const audio = stream.getAudioTracks()[0] ?? null;
    const video = stream.getVideoTracks()[0] ?? null;
    const ops: Promise<void>[] = [];
    let attached = 0;
    let missingSender = 0;
    for (const slot of slotsRef.current.values()) {
      const senders = slot.pc.getSenders();
      const audioSender = senders.find((s) => s.track?.kind === 'audio') ??
        senders.find((s) => !s.track); // null-track sender (auto-created from setRemoteDescription)
      const videoSender = senders.find((s) => s.track?.kind === 'video') ??
        senders.find((s) => !s.track && s !== audioSender);
      if (audio && audioSender && audioSender.track !== audio) {
        ops.push(audioSender.replaceTrack(audio));
        attached++;
      } else if (audio && !audioSender) {
        // No matching sender: buildPc was called without a stream, so no
        // m-line for audio exists yet. Adding now would require a re-offer
        // we don't currently emit; the caller (RoomClient) acquires the
        // stream synchronously before flipping `on_call_intent`, so this
        // path should not fire in practice.
        missingSender++;
      }
      if (video && videoSender && videoSender.track !== video) {
        ops.push(videoSender.replaceTrack(video));
        attached++;
      } else if (video && !videoSender) {
        missingSender++;
      }
    }
    if (missingSender > 0) {
      console.warn('[rtc] attachLocalStream: senders missing', {
        pcs: slotsRef.current.size,
        missingSender,
      });
    }
    console.log('[rtc] attachLocalStream', { pcs: slotsRef.current.size, attached });
    await Promise.all(ops);
  }, []);

  const peerIds = useCallback(() => [...slotsRef.current.keys()], []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      closeAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(
    () => ({
      createOfferTo,
      handleOffer,
      handleAnswer,
      handleIce,
      closePeer,
      closeAll,
      replaceVideoTrackEverywhere,
      attachLocalStream,
      peerIds,
    }),
    [
      createOfferTo,
      handleOffer,
      handleAnswer,
      handleIce,
      closePeer,
      closeAll,
      replaceVideoTrackEverywhere,
      attachLocalStream,
      peerIds,
    ]
  );
}
