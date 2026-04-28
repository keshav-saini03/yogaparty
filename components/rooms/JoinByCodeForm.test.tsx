import { describe, it, expect } from 'vitest';
import { extractRoomId } from './JoinByCodeForm';

const ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('extractRoomId', () => {
  it('returns a bare UUID', () => {
    expect(extractRoomId(ID)).toBe(ID);
  });

  it('extracts UUID from /room/{id} path', () => {
    expect(extractRoomId(`/room/${ID}`)).toBe(ID);
  });

  it('extracts UUID from a full URL', () => {
    expect(extractRoomId(`https://yogaparty.app/room/${ID}?ref=x`)).toBe(ID);
  });

  it('extracts UUID from a deployed Vercel URL', () => {
    expect(
      extractRoomId(
        `https://yogaparty-git-main-foo.vercel.app/room/${ID}`
      )
    ).toBe(ID);
  });

  it('lowercases an UPPERCASE id', () => {
    expect(extractRoomId(ID.toUpperCase())).toBe(ID);
  });

  it('trims whitespace', () => {
    expect(extractRoomId(`   ${ID}   `)).toBe(ID);
  });

  it('returns null when no UUID is present', () => {
    expect(extractRoomId('not-an-id')).toBeNull();
    expect(extractRoomId('https://yogaparty.app/about')).toBeNull();
    expect(extractRoomId('')).toBeNull();
  });

  it('picks the first UUID when multiple are present', () => {
    const ID2 = '11111111-2222-3333-4444-555555555555';
    expect(extractRoomId(`${ID} something ${ID2}`)).toBe(ID);
  });
});
