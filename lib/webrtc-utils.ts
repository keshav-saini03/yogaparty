// lib/webrtc-utils.ts
//
// Pure helpers for the mesh. No DOM, no React, no Supabase — fully unit-
// testable in isolation.

/**
 * Deterministic initiator rule. Given two participants, the one with the
 * lex-lower user_id creates the offer; the other waits for it. Returns true
 * if `selfId` should initiate to `peerId`.
 */
export function pickInitiator(selfId: string, peerId: string): boolean {
  if (selfId === peerId) return false; // defensive — never happens in practice
  return selfId < peerId;
}
