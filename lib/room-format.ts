export type EyebrowInput = {
  listening: number;
  onCall: number;
  speakerName: string | null;
  ducked: boolean;
};

/**
 * Formats the room status line shown above the peer ribbon.
 *
 *   idle:               "04 listening · nobody on call yet"
 *   on-call (silent):   "03 on call · audio synced"
 *   on-call (talking):  "Riya is talking" (+ " · audio ducked" when ducked)
 *
 * Counts pad to two digits for tally aesthetics; three-plus stay unpadded.
 */
export function formatRoomEyebrow(input: EyebrowInput): string {
  const { listening, onCall, speakerName, ducked } = input;
  if (onCall === 0) {
    return `${pad(listening)} listening · nobody on call yet`;
  }
  if (speakerName) {
    return `${speakerName} is talking${ducked ? ' · audio ducked' : ''}`;
  }
  return `${pad(onCall)} on call · audio synced`;
}

function pad(n: number): string {
  return n < 100 ? n.toString().padStart(2, '0') : n.toString();
}
