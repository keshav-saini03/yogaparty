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
