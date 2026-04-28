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

describe('usePeerConnections — disconnected grace promotion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('promotes disconnected to restart-ice after the grace window', async () => {
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

    await act(async () => {
      pc.iceConnectionState = 'disconnected';
      pc.oniceconnectionstatechange?.();
    });

    expect(pc.createOffer).not.toHaveBeenCalled(); // not yet — still in grace window

    await act(async () => {
      vi.advanceTimersByTime(5_000); // ICE_DISCONNECTED_GRACE_MS
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pc.createOffer).toHaveBeenCalledWith({ iceRestart: true });
  });

  it('clears the grace timer when state recovers to connected', async () => {
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

    await act(async () => {
      pc.iceConnectionState = 'disconnected';
      pc.oniceconnectionstatechange?.();
      pc.iceConnectionState = 'connected';
      pc.oniceconnectionstatechange?.();
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(pc.createOffer).not.toHaveBeenCalled();
  });
});

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
