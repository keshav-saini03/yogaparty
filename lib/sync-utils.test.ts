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
    expect(pickCorrection(0.49).kind).toBe('none');
    expect(pickCorrection(-0.49).kind).toBe('none');
  });

  it('returns rate=1.25 when viewer is behind (positive drift)', () => {
    const c = pickCorrection(1.0);
    expect(c.kind).toBe('rate');
    if (c.kind === 'rate') expect(c.rate).toBe(1.25);
  });

  it('returns rate=0.75 when viewer is ahead (negative drift)', () => {
    const c = pickCorrection(-1.0);
    expect(c.kind).toBe('rate');
    if (c.kind === 'rate') expect(c.rate).toBe(0.75);
  });

  it('rate-window duration scales with drift size and is clamped', () => {
    const small = pickCorrection(0.6);
    if (small.kind === 'rate') {
      expect(small.durationMs).toBeGreaterThanOrEqual(800);
      expect(small.durationMs).toBeLessThanOrEqual(8000);
    }
    const big = pickCorrection(1.4);
    if (big.kind === 'rate') {
      expect(big.durationMs).toBeGreaterThan(small.kind === 'rate' ? small.durationMs : 0);
    }
  });

  it('returns seek for drift at or above the large threshold', () => {
    expect(pickCorrection(1.5).kind).toBe('seek');
    expect(pickCorrection(-3).kind).toBe('seek');
  });

  it('honors custom thresholds', () => {
    expect(pickCorrection(0.3, 0.2, 1).kind).toBe('rate');
    expect(pickCorrection(0.1, 0.2, 1).kind).toBe('none');
    expect(pickCorrection(1.1, 0.2, 1).kind).toBe('seek');
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

  it('dedupes by user_id keeping earliest joined_at', () => {
    const state = {
      k1: [mk('a', 2000)],
      k2: [mk('a', 1000)],
    };
    const result = dedupePresence(state);
    expect(result).toHaveLength(1);
    expect(result[0].joined_at).toBe(1000);
  });

  it('returns empty array on empty state', () => {
    expect(dedupePresence({})).toEqual([]);
  });

  it('prefers on_call_intent:true entry over on_call_intent:false for same user', () => {
    // Reproduces the production bug: Supabase keeps both ch.track payloads
    // (initial {intent:false} + later {intent:true}) under one connection's
    // state[user_id] array. Naive "earliest joined_at" picked the false
    // entry, so peers never saw the toggle. Intent-aware dedup wins.
    const state = {
      conn: [
        { user_id: 'a', name: 'A', city: null, joined_at: 1000, on_call_intent: false },
        { user_id: 'a', name: 'A', city: null, joined_at: 2000, on_call_intent: true },
      ],
    };
    const result = dedupePresence(state);
    expect(result).toHaveLength(1);
    expect(result[0].on_call_intent).toBe(true);
  });
});
