import { describe, it, expect } from 'vitest';
import {
  electHost,
  shouldCorrect,
  correctedTimestamp,
  dedupePresence,
  pickCorrection,
  type Participant,
} from './sync-utils';

const mk = (
  user_id: string,
  joined_at: number,
  name = user_id,
  city: string | null = 'Mumbai'
): Participant => ({ user_id, name, city, joined_at });

describe('electHost', () => {
  it('returns null on empty list', () => {
    expect(electHost([])).toBeNull();
  });

  it('returns the only participant when list has one', () => {
    const p = mk('a', 1000);
    expect(electHost([p])).toEqual(p);
  });

  it('picks earliest joined_at', () => {
    const a = mk('a', 1500);
    const b = mk('b', 1000);
    const c = mk('c', 2000);
    expect(electHost([a, b, c])?.user_id).toBe('b');
  });

  it('breaks tie by user_id lex order', () => {
    const a = mk('zeta', 1000);
    const b = mk('alpha', 1000);
    const c = mk('mu', 1000);
    expect(electHost([a, b, c])?.user_id).toBe('alpha');
  });

  it('does not mutate input array', () => {
    const list = [mk('a', 2000), mk('b', 1000)];
    const before = [...list];
    electHost(list);
    expect(list).toEqual(before);
  });
});

describe('shouldCorrect', () => {
  it('returns false when diff equals threshold (boundary)', () => {
    expect(shouldCorrect(10, 8, 2)).toBe(false);
    expect(shouldCorrect(10, 12, 2)).toBe(false);
  });

  it('returns true when diff exceeds threshold', () => {
    expect(shouldCorrect(10, 7.999, 2)).toBe(true);
    expect(shouldCorrect(10, 12.001, 2)).toBe(true);
  });

  it('handles negative drift symmetrically', () => {
    expect(shouldCorrect(5, 9, 2)).toBe(true);
    expect(shouldCorrect(9, 5, 2)).toBe(true);
  });

  it('uses default threshold of 2', () => {
    expect(shouldCorrect(10, 7.5)).toBe(true);
    expect(shouldCorrect(10, 8.5)).toBe(false);
  });
});

describe('correctedTimestamp', () => {
  it('adds default lookahead 0.3s', () => {
    expect(correctedTimestamp(10)).toBeCloseTo(10.3);
  });

  it('respects custom lookahead', () => {
    expect(correctedTimestamp(10, 0.5)).toBeCloseTo(10.5);
  });
});

describe('pickCorrection', () => {
  it('returns none for sub-tolerance drift', () => {
    expect(pickCorrection(0).kind).toBe('none');
    expect(pickCorrection(0.99).kind).toBe('none');
    expect(pickCorrection(-0.99).kind).toBe('none');
  });

  it('returns seek when drift meets or exceeds the threshold', () => {
    expect(pickCorrection(1.0).kind).toBe('seek');
    expect(pickCorrection(-1.0).kind).toBe('seek');
    expect(pickCorrection(3).kind).toBe('seek');
    expect(pickCorrection(-12).kind).toBe('seek');
  });

  it('honors a custom threshold', () => {
    expect(pickCorrection(0.3, 0.2).kind).toBe('seek');
    expect(pickCorrection(0.1, 0.2).kind).toBe('none');
    expect(pickCorrection(2.0, 3).kind).toBe('none');
  });
});

describe('dedupePresence', () => {
  it('flattens presence_state record into participants array', () => {
    const state = {
      key1: [mk('a', 1000)],
      key2: [mk('b', 2000)],
    };
    const result = dedupePresence(state);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.user_id).sort()).toEqual(['a', 'b']);
  });

  it('dedupes by user_id keeping latest tracked_at', () => {
    const state = {
      k1: [{ ...mk('a', 1000), tracked_at: 5000 }],
      k2: [{ ...mk('a', 1000), tracked_at: 9000 }],
    };
    const result = dedupePresence(state);
    expect(result).toHaveLength(1);
    expect(result[0].tracked_at).toBe(9000);
  });

  it('falls back to joined_at when tracked_at is missing (back-compat)', () => {
    const state = {
      k1: [mk('a', 1000)],
      k2: [mk('a', 2000)],
    };
    const result = dedupePresence(state);
    expect(result).toHaveLength(1);
    expect(result[0].joined_at).toBe(2000);
  });

  it('returns empty array on empty state', () => {
    expect(dedupePresence({})).toEqual([]);
  });

  it('latest tracked_at carries the user\'s current on_call_intent', () => {
    // Reproduces the production bug from a different angle: Supabase keeps
    // BOTH the initial {intent:false} ch.track payload and the later
    // {intent:true} payload under one connection. The right collapse picks
    // whichever was written most recently. tracked_at makes that explicit
    // (it's the wall-clock at each ch.track() call) instead of relying on
    // joined_at, which can drift across reconnects.
    const state = {
      conn: [
        {
          user_id: 'a',
          name: 'A',
          city: null,
          joined_at: 1000,
          tracked_at: 1000,
          on_call_intent: false,
        },
        {
          user_id: 'a',
          name: 'A',
          city: null,
          joined_at: 1000,
          tracked_at: 2000,
          on_call_intent: true,
        },
      ],
    };
    const result = dedupePresence(state);
    expect(result).toHaveLength(1);
    expect(result[0].on_call_intent).toBe(true);
  });

  it('a fresh intent:false write wins over a stale intent:true', () => {
    // The failure mode the old intent-aware rule couldn't see: a stale
    // {intent:true} entry from a closed tab outranking a fresh
    // {intent:false} write from the same user's reconnect. tracked_at
    // resolves it correctly because the reconnect's payload is newer.
    const state = {
      stale: [
        {
          user_id: 'a',
          name: 'A',
          city: null,
          joined_at: 1000,
          tracked_at: 1000,
          on_call_intent: true,
        },
      ],
      fresh: [
        {
          user_id: 'a',
          name: 'A',
          city: null,
          joined_at: 5000,
          tracked_at: 5000,
          on_call_intent: false,
        },
      ],
    };
    const result = dedupePresence(state);
    expect(result).toHaveLength(1);
    expect(result[0].on_call_intent).toBe(false);
  });
});
