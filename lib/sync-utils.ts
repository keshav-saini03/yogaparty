export type Participant = {
  user_id: string;
  name: string;
  city: string | null;
  joined_at: number;
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

export function dedupePresence(
  state: Record<string, Participant[]>
): Participant[] {
  const seen = new Map<string, Participant>();
  for (const arr of Object.values(state)) {
    for (const p of arr) {
      const existing = seen.get(p.user_id);
      if (!existing || p.joined_at < existing.joined_at) {
        seen.set(p.user_id, p);
      }
    }
  }
  return [...seen.values()];
}
