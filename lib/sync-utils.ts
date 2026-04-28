export type Participant = {
  user_id: string;
  name: string;
  city: string | null;
  joined_at: number;
  /**
   * Wall-clock ms of the last `ch.track()` payload. Distinct from
   * `joined_at` (which is the session's stable identity for host election).
   * Supabase Realtime keeps every track payload as a separate metadata
   * entry, so dedup picks the entry with the latest `tracked_at` to reflect
   * the user's *current* intent. Stale entries from refreshed/closed tabs
   * are automatically demoted because their tracked_at is older than the
   * fresh session's first track.
   */
  tracked_at?: number;
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
  // Supabase Realtime keeps every `ch.track()` payload as a separate metadata
  // entry under the connection's presence_ref, so a user's array can hold
  // multiple snapshots: an initial {on_call_intent:false}, a later
  // {on_call_intent:true} after the toggle, and stale entries from previous
  // sessions that haven't expired yet.
  //
  // Rule: pick the entry with the highest `tracked_at` (wall-clock ms at
  // write time). That's the user's *most recent* declared state. Falls back
  // to `joined_at` when `tracked_at` is missing (back-compat with entries
  // written by older clients during a deploy window). The previous
  // intent-aware rule had two failure modes:
  //   1. A stale {intent:true} from a closed tab outranks a fresh
  //      {intent:false} from the same user's reconnect.
  //   2. Two equal-intent entries broke ties on joined_at, but joined_at
  //      shifts when we re-track on reconnect, so the winner could flip.
  // tracked_at sidesteps both by being monotonic per session.
  const seen = new Map<string, Participant>();
  const ts = (p: Participant) => p.tracked_at ?? p.joined_at;
  for (const arr of Object.values(state)) {
    for (const p of arr) {
      const existing = seen.get(p.user_id);
      if (!existing || ts(p) > ts(existing)) {
        seen.set(p.user_id, p);
      }
    }
  }
  return [...seen.values()];
}
