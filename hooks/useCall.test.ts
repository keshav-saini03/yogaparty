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

describe('useCall — reconciliation tick', () => {
  it('every MESH_RECONCILE_INTERVAL_MS, re-offers to expected peers we should initiate to', async () => {
    vi.useFakeTimers();

    const channel = makeChannel();
    const onCreateOfferTo = vi.fn(async () => {});
    const peers = ['aaaa-peer', 'zzzz-peer']; // self='self' is lex-greater than 'aaaa-peer' but less than 'zzzz-peer'.

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
