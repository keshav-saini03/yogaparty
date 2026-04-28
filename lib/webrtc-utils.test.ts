import { describe, it, expect } from 'vitest';
import { pickInitiator } from './webrtc-utils';

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
