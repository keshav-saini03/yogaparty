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
  peerIds: () => string[];
};

/**
 * Owns the lifecycle of one `RTCPeerConnection` per remote peer in the room.
 *
 * This hook is purely imperative — it exposes methods that the higher-level
 * call state machine (`useCall`, later wave) drives in response to signaling
 * events on the room's Supabase Realtime channel. It does NOT decide when to
 * call whom; it just makes the calls happen and forwards offer/answer/ICE to
 * the channel.
 *
 * Recovery policy (spec §8.2): on `iceConnectionState === 'failed'`, attempt
 * exactly one ICE restart. A second failure closes the PC and drops the slot.
 */
export function usePeerConnections(args: Args): PeerConnections {
  const slotsRef = useRef<Map<string, Slot>>(new Map());

  const send = useCallback(
    (event: string, payload: unknown) => {
      args.channel?.send({ type: 'broadcast', event, payload });
    },
    [args.channel]
  );

  const closeSlot = useCallback(
    (peerId: string) => {
      const slot = slotsRef.current.get(peerId);
      if (!slot) return;
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
      args.onPeerDropped?.(peerId);
    },
    // Intentionally narrow: stabilizing callback identity is the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [args.onPeerDropped]
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

  return useMemo(
    () => ({
      createOfferTo,
      handleOffer,
      handleAnswer,
      handleIce,
      closePeer,
      closeAll,
      replaceVideoTrackEverywhere,
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
      peerIds,
    ]
  );
}
