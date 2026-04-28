export type Participant = {
  user_id: string;
  name: string;
  city: string | null;
  joined_at: number;
  on_call_intent?: boolean;
};

export function electHost(participants: Participant[]): Participant | null {
  if (participants.length === 0) return null;
  return [...participants].sort((a, b) => {
    if (a.joined_at !== b.joined_at) return a.joined_at - b.joined_at;
    return a.user_id.localeCompare(b.user_id);
  })[0];
}

export function shouldCorrect(
  hostTime: number,
  clientTime: number,
  threshold = 2
): boolean {
  return Math.abs(hostTime - clientTime) > threshold;
}

export function correctedTimestamp(
  hostTime: number,
  lookaheadSec = 0.3
): number {
  return hostTime + lookaheadSec;
}

/**
 * Decide how a viewer should close a gap of `drift` seconds.
 *
 *   drift = expectedTime - viewerTime
 *     > 0 → viewer is BEHIND, must speed up (rate > 1) or jump forward
 *     < 0 → viewer is AHEAD, must slow down (rate < 1) or jump back
 *
 * Tiers (chosen to keep YouTube's seek-stutter off-screen for typical drift):
 *   |drift| <  smallMs  → ignore (within tolerance)
 *   |drift| <  largeMs  → smooth: bend playbackRate by ±0.25 for a window
 *   |drift| >= largeMs  → hard: seekTo(expectedTime)
 */
export type Correction =
  | { kind: 'none' }
  | { kind: 'rate'; rate: number; durationMs: number }
  | { kind: 'seek' };

export function pickCorrection(
  drift: number,
  smallSec = 0.5,
  largeSec = 1.5
): Correction {
  const abs = Math.abs(drift);
  if (abs < smallSec) return { kind: 'none' };
  if (abs < largeSec) {
    // Use ±0.25 step from neutral 1.0 — these are guaranteed-supported
    // YouTube rates. Nudge duration is sized so the offset closes in ~that
    // many seconds: closing X seconds at delta-rate 0.25 takes X/0.25 sec.
    const rate = drift > 0 ? 1.25 : 0.75;
    const durationMs = Math.min(8000, Math.max(800, (abs / 0.25) * 1000));
    return { kind: 'rate', rate, durationMs };
  }
  return { kind: 'seek' };
}

export function dedupePresence(
  state: Record<string, Participant[]>
): Participant[] {
  const seen = new Map<string, Participant>();
  for (const arr of Object.values(state)) {
    for (const p of arr) {
      const existing = seen.get(p.user_id);
      if (!existing) {
        seen.set(p.user_id, p);
        continue;
      }
      // Supabase Realtime keeps every `ch.track()` payload as a separate
      // metadata entry under the connection's presence_ref. After the user
      // toggles on-call, state[user_id] holds BOTH the initial
      // {on_call_intent:false} and the later {on_call_intent:true}. Picking
      // earliest `joined_at` (the previous rule) silently dropped the
      // toggle. The right collapse is intent-aware: a user is on-call if
      // ANY entry says so. Among equal-intent entries we keep the earliest
      // joined_at so host election (which uses joined_at) stays stable.
      const existingOn = !!existing.on_call_intent;
      const candidateOn = !!p.on_call_intent;
      if (candidateOn && !existingOn) {
        seen.set(p.user_id, p);
      } else if (candidateOn === existingOn && p.joined_at < existing.joined_at) {
        seen.set(p.user_id, p);
      }
    }
  }
  return [...seen.values()];
}
