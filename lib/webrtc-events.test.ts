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

describe('webrtc-events validators — defensive cases', () => {
  it('rejects wrong-type fields', () => {
    expect(isOfferPayload({ from: 123, to: 'b', sdp: 'v=0', sentAt: 1 })).toBe(false);
    expect(isOfferPayload({ from: 'a', to: 'b', sdp: 'v=0', sentAt: '1' })).toBe(false);
  });

  it('rejects empty-string required fields', () => {
    expect(isOfferPayload({ from: '', to: 'b', sdp: 'v=0', sentAt: 1 })).toBe(false);
    expect(isOfferPayload({ from: 'a', to: '', sdp: 'v=0', sentAt: 1 })).toBe(false);
  });

  it('isIcePayload rejects non-object candidate', () => {
    expect(isIcePayload({ from: 'a', to: 'b', candidate: 'foo', sentAt: 1 })).toBe(false);
    expect(isIcePayload({ from: 'a', to: 'b', candidate: 42, sentAt: 1 })).toBe(false);
  });

  it('isIcePayload rejects candidate object missing the .candidate string', () => {
    expect(isIcePayload({ from: 'a', to: 'b', candidate: {}, sentAt: 1 })).toBe(false);
  });

  it('isIcePayload accepts empty-string end-of-candidates sentinel', () => {
    expect(
      isIcePayload({
        from: 'a',
        to: 'b',
        candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0 },
        sentAt: 1,
      })
    ).toBe(true);
  });
});
