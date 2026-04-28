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
  const anyPeerSpeakingRef = useRef(false);

  // Ramp state.
  const [duckedVolume, setDuckedVolume] = useState(args.userVolume);
  const duckedVolumeRef = useRef(args.userVolume);
  const userVolumeRef = useRef(args.userVolume);
  userVolumeRef.current = args.userVolume;

  const setDucked = useCallback((v: number) => {
    duckedVolumeRef.current = v;
    setDuckedVolume(v);
  }, []);

  const rampRef = useRef<{
    timer: number | null;
    target: number;
    direction: 'in' | 'out' | null;
  }>({ timer: null, target: args.userVolume, direction: null });
  const quietSinceRef = useRef<number | null>(null);

  // Anti-fight: if user moves slider during ramp, abort and follow them.
  useEffect(() => {
    if (rampRef.current.direction === null) {
      setDucked(args.userVolume);
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
      setDucked(args.userVolume);
    }
  }, [args.userVolume, setDucked]);

  const startRamp = useCallback(
    (toFactor: number, durationMs: number, direction: 'in' | 'out') => {
      if (rampRef.current.timer !== null) {
        window.clearInterval(rampRef.current.timer);
      }
      const start = Date.now();
      const from = duckedVolumeRef.current;
      const target = userVolumeRef.current * toFactor;
      rampRef.current = { timer: null, target, direction };
      const tick = () => {
        const t = Math.min(1, (Date.now() - start) / durationMs);
        const value = from + (rampRef.current.target - from) * t;
        setDucked(value);
        if (t >= 1) {
          if (rampRef.current.timer !== null) {
            window.clearInterval(rampRef.current.timer);
          }
          rampRef.current = { timer: null, target, direction: null };
        }
      };
      rampRef.current.timer = window.setInterval(tick, 16) as unknown as number;
    },
    [setDucked]
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
      // Read from ref so synchronous timer advances see the latest value
      // without waiting for React to flush state.
      const wasAny = anyPeerSpeakingRef.current;
      if (speaking && !wasAny) {
        quietSinceRef.current = null;
        anyPeerSpeakingRef.current = true;
        setAnyPeerSpeaking(true);
        startRamp(DUCK_FACTOR, DUCK_RAMP_IN_MS, 'in');
      } else if (!speaking && wasAny) {
        const now = Date.now();
        if (quietSinceRef.current === null) quietSinceRef.current = now;
        if (now - quietSinceRef.current >= DUCK_QUIET_HOLD_MS) {
          anyPeerSpeakingRef.current = false;
          setAnyPeerSpeaking(false);
          startRamp(1, DUCK_RAMP_OUT_MS, 'out');
          quietSinceRef.current = null;
        }
      } else if (speaking) {
        quietSinceRef.current = null;
      }
    }, 33); // ~30Hz
    return () => window.clearInterval(interval);
  }, [startRamp]);

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
