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

/**
 * Compare the set of peers we *should* be connected to (from presence with
 * `on_call_intent: true` minus self) with the set we *are* connected to (PC
 * map keys). The reconciliation tick uses this to spawn missing offers and
 * close orphaned connections.
 */
export function diffMesh(
  expected: string[],
  actual: Set<string>
): { toAdd: string[]; toRemove: string[] } {
  const expectedSet = new Set(expected);
  const toAdd = expected.filter((id) => !actual.has(id));
  const toRemove: string[] = [];
  for (const id of actual) {
    if (!expectedSet.has(id)) toRemove.push(id);
  }
  return { toAdd, toRemove };
}
