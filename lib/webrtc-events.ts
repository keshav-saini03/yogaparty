// lib/webrtc-events.ts
//
// Type definitions + runtime validators for the four new broadcast events on
// the existing room channel. Validators are defensive — receivers from a
// shared channel must not assume payload shape.

export type WebRtcOfferPayload = {
  from: string;
  to: string;
  sdp: string;
  sentAt: number;
};

export type WebRtcAnswerPayload = {
  from: string;
  to: string;
  sdp: string;
  sentAt: number;
};

export type WebRtcIcePayload = {
  from: string;
  to: string;
  candidate: RTCIceCandidateInit;
  sentAt: number;
};

export type WebRtcCallEndPayload = {
  from: string;
  sentAt: number;
};

export const WEBRTC_EVENTS = {
  OFFER: 'webrtc_offer',
  ANSWER: 'webrtc_answer',
  ICE: 'webrtc_ice',
  CALL_END: 'webrtc_call_end',
} as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isOfferPayload(v: unknown): v is WebRtcOfferPayload {
  return isObj(v) && isStr(v.from) && isStr(v.to) && isStr(v.sdp) && isNum(v.sentAt);
}

export function isAnswerPayload(v: unknown): v is WebRtcAnswerPayload {
  return isObj(v) && isStr(v.from) && isStr(v.to) && isStr(v.sdp) && isNum(v.sentAt);
}

export function isIcePayload(v: unknown): v is WebRtcIcePayload {
  return (
    isObj(v) &&
    isStr(v.from) &&
    isStr(v.to) &&
    isObj(v.candidate) &&
    isNum(v.sentAt)
  );
}

export function isCallEndPayload(v: unknown): v is WebRtcCallEndPayload {
  return isObj(v) && isStr(v.from) && isNum(v.sentAt) && !('to' in v);
}
