import { describe, it, expect } from 'vitest';
import {
  electHost,
  shouldCorrect,
  correctedTimestamp,
  dedupePresence,
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
});
