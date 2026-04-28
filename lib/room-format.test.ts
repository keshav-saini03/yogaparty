import { describe, it, expect } from 'vitest';
import { formatRoomEyebrow } from './room-format';

describe('formatRoomEyebrow', () => {
  it('idle (nobody on call) lists who is listening', () => {
    expect(
      formatRoomEyebrow({ listening: 4, onCall: 0, speakerName: null, ducked: false })
    ).toBe('04 listening · nobody on call yet');
  });

  it('on-call with active speaker and ducked audio', () => {
    expect(
      formatRoomEyebrow({ listening: 4, onCall: 3, speakerName: 'Riya', ducked: true })
    ).toBe('Riya is talking · audio ducked');
  });

  it('on-call with speaker, audio not ducked yet', () => {
    expect(
      formatRoomEyebrow({ listening: 4, onCall: 3, speakerName: 'Riya', ducked: false })
    ).toBe('Riya is talking');
  });

  it('on-call with no current speaker', () => {
    expect(
      formatRoomEyebrow({ listening: 4, onCall: 3, speakerName: null, ducked: false })
    ).toBe('03 on call · audio synced');
  });

  it('pads single-digit counts to two digits', () => {
    expect(
      formatRoomEyebrow({ listening: 1, onCall: 0, speakerName: null, ducked: false })
    ).toBe('01 listening · nobody on call yet');
  });

  it('does not pad three-digit counts', () => {
    expect(
      formatRoomEyebrow({ listening: 102, onCall: 0, speakerName: null, ducked: false })
    ).toBe('102 listening · nobody on call yet');
  });
});
