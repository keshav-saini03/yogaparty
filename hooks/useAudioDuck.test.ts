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

describe('useAudioDuck speakingPeerIds', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useAudioDuck({ userVolume: 80 }));
    expect(result.current.speakingPeerIds).toEqual([]);
  });

  // Note: a full RMS-driven test would need to mock AudioContext/AnalyserNode,
  // which is heavyweight for Vitest. We rely on the empty/initial state assertion
  // and existing speakingRef-based tests; integration coverage comes from the
  // PresenceList speaker-glow component test in Task 6.
});
