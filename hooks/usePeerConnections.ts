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
   * Late-attach hook for the race we hit in production: an inbound offer can
   * arrive (and a PC be built) before this peer's local `getUserMedia`
   * resolves. The PC's pre-allocated transceivers exist, but their senders
   * have no track — so nothing flows back to the offerer and they see a
   * black tile / no peer. Once the stream IS acquired, call this to
   * `replaceTrack` on every existing PC's senders. No re-negotiation needed
   * because the m-section direction is already `sendrecv`.
   */
  attachLocalStream: (stream: MediaStream) => Promise<void>;
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
      const trackCount = local?.getTracks().length ?? 0;
      console.log('[rtc] buildPc', { self: args.selfId, peer: peerId, hasLocal: !!local, trackCount });
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
        console.log('[rtc] ontrack', { self: args.selfId, peer: peerId, kind: e.track.kind, hasStream: !!e.streams[0] });
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
    console.log('[rtc] handleAnswer ←', { from: p.from });
    const slot = slotsRef.current.get(p.from);
    if (!slot) {
      console.warn('[rtc] handleAnswer: no slot for', p.from);
      return;
    }
    await slot.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
  }, []);

  const handleIce = useCallback(async (p: WebRtcIcePayload) => {
    const slot = slotsRef.current.get(p.from);
    if (!slot) {
      console.warn('[rtc] handleIce: no slot for', p.from);
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

  const attachLocalStream = useCallback(async (stream: MediaStream) => {
    const audio = stream.getAudioTracks()[0] ?? null;
    const video = stream.getVideoTracks()[0] ?? null;
    const ops: Promise<void>[] = [];
    let attached = 0;
    for (const slot of slotsRef.current.values()) {
      for (const tx of slot.pc.getTransceivers()) {
        const kind = tx.receiver.track?.kind ?? tx.sender.track?.kind ?? null;
        if (kind === 'audio' && audio && tx.sender.track !== audio) {
          ops.push(tx.sender.replaceTrack(audio));
          attached++;
        } else if (kind === 'video' && video && tx.sender.track !== video) {
          ops.push(tx.sender.replaceTrack(video));
          attached++;
        }
      }
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
