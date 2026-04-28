import { describe, it, expect } from 'vitest';
import { pickInitiator, diffMesh } from './webrtc-utils';

describe('pickInitiator', () => {
  it('returns true when self id is lex-lower', () => {
    expect(pickInitiator('alpha', 'zulu')).toBe(true);
  });

  it('returns false when self id is lex-higher', () => {
    expect(pickInitiator('zulu', 'alpha')).toBe(false);
  });

  it('returns false when ids are equal (defensive)', () => {
    expect(pickInitiator('same', 'same')).toBe(false);
  });

  it('handles UUIDs correctly', () => {
    const lo = '11111111-2222-3333-4444-555555555555';
    const hi = '99999999-9999-9999-9999-999999999999';
    expect(pickInitiator(lo, hi)).toBe(true);
    expect(pickInitiator(hi, lo)).toBe(false);
  });
});

describe('diffMesh', () => {
  it('returns toAdd for expected peers not in actual', () => {
    const result = diffMesh(['a', 'b', 'c'], new Set(['a']));
    expect(result.toAdd.sort()).toEqual(['b', 'c']);
    expect(result.toRemove).toEqual([]);
  });

  it('returns toRemove for actual peers no longer expected', () => {
    const result = diffMesh(['a'], new Set(['a', 'b', 'c']));
    expect(result.toAdd).toEqual([]);
    expect(result.toRemove.sort()).toEqual(['b', 'c']);
  });

  it('returns empty when in sync', () => {
    const result = diffMesh(['a', 'b'], new Set(['a', 'b']));
    expect(result.toAdd).toEqual([]);
    expect(result.toRemove).toEqual([]);
  });

  it('handles both add and remove in one diff', () => {
    const result = diffMesh(['b', 'c'], new Set(['a', 'b']));
    expect(result.toAdd).toEqual(['c']);
    expect(result.toRemove).toEqual(['a']);
  });
});
