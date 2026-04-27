import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildShareUrl,
  cityCompetitionCopy,
  getAppUrl,
  inRoomInviteCopy,
  postSessionCopy,
  postSignupCopy,
  withRef,
} from './whatsapp';

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

describe('getAppUrl', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it('uses NEXT_PUBLIC_APP_URL when set, stripping trailing slashes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://yogaparty.example.com/';
    expect(getAppUrl()).toBe('https://yogaparty.example.com');
  });

  it('falls back to window.location.origin when env missing', () => {
    expect(getAppUrl()).toBe(window.location.origin);
  });
});

describe('withRef', () => {
  it('appends ?ref when path has no query', () => {
    expect(withRef('https://yogaparty.app', VALID_UUID)).toBe(
      `https://yogaparty.app?ref=${VALID_UUID}`
    );
  });

  it('appends &ref when path already has query', () => {
    expect(withRef('https://yogaparty.app?utm=x', VALID_UUID)).toBe(
      `https://yogaparty.app?utm=x&ref=${VALID_UUID}`
    );
  });

  it('returns path unchanged when refId is null', () => {
    expect(withRef('https://yogaparty.app', null)).toBe('https://yogaparty.app');
  });

  it('returns path unchanged when refId is malformed', () => {
    expect(withRef('https://yogaparty.app', 'not-a-uuid')).toBe(
      'https://yogaparty.app'
    );
  });

  it('returns path unchanged when refId is empty string', () => {
    expect(withRef('https://yogaparty.app', '')).toBe('https://yogaparty.app');
  });
});

describe('buildShareUrl', () => {
  it('wraps wa.me/?text= and url-encodes the text', () => {
    const url = buildShareUrl('hi there → world');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(url).toContain('hi%20there');
    expect(url).toContain(encodeURIComponent('→'));
  });

  it('encodes special characters that break URL parsing', () => {
    const url = buildShareUrl('a&b=c?d#e');
    expect(url).toBe(
      'https://wa.me/?text=' + encodeURIComponent('a&b=c?d#e')
    );
  });
});

describe('postSignupCopy', () => {
  it('uses city + count variant when both available', () => {
    const out = postSignupCopy({
      cityCount: 23,
      cityName: 'Mumbai',
      refId: VALID_UUID,
    });
    expect(out).toContain('23 logon ke saath');
    expect(out).toContain('Mumbai');
    expect(out).toContain(`ref=${VALID_UUID}`);
  });

  it('falls back to count-only when city is GLOBAL', () => {
    const out = postSignupCopy({
      cityCount: 5,
      cityName: 'GLOBAL',
      refId: VALID_UUID,
    });
    expect(out).toContain('5 logon');
    expect(out).not.toContain('GLOBAL');
  });

  it('falls back to city-only when count is 0', () => {
    const out = postSignupCopy({
      cityCount: 0,
      cityName: 'Bengaluru',
      refId: VALID_UUID,
    });
    expect(out).toContain('Bengaluru');
    expect(out).not.toMatch(/\b0 logon\b/);
  });

  it('falls back to neutral copy when nothing known', () => {
    const out = postSignupCopy({});
    expect(out).toContain('yoga watch party');
  });

  it('omits ?ref when refId is invalid', () => {
    const out = postSignupCopy({ cityCount: 5, cityName: 'Mumbai', refId: null });
    expect(out).not.toContain('?ref=');
    expect(out).not.toContain('&ref=');
  });
});

describe('inRoomInviteCopy', () => {
  it('mentions the city count in plural variant', () => {
    expect(
      inRoomInviteCopy({ cityCount: 12, cityName: 'Delhi', refId: VALID_UUID })
    ).toMatch(/12 log Delhi/);
  });

  it('falls back to neutral when no city/count', () => {
    expect(inRoomInviteCopy({ refId: VALID_UUID })).toContain('Yoga watch party');
  });
});

describe('cityCompetitionCopy', () => {
  it('renders the leaderboard taunt with city', () => {
    const out = cityCompetitionCopy({ cityName: 'Mumbai', refId: VALID_UUID });
    expect(out).toContain('Mumbai peechhe hai');
    expect(out).toContain('leaderboard');
    expect(out).toContain(`ref=${VALID_UUID}`);
  });

  it("uses 'Apni city' fallback when city missing", () => {
    expect(cityCompetitionCopy({ refId: VALID_UUID })).toContain('Apni city');
  });
});

describe('postSessionCopy', () => {
  it('renders count + city when both known', () => {
    const out = postSessionCopy({
      cityCount: 7,
      cityName: 'Pune',
      refId: VALID_UUID,
    });
    expect(out).toContain('7 logon');
    expect(out).toContain('Pune');
  });

  it('renders neutral variant when nothing known', () => {
    expect(postSessionCopy({})).toContain('yoga watch party');
  });
});

describe('SPEC compliance — wa.me share link end-to-end', () => {
  it('post-signup → buildShareUrl produces a wa.me URL with the encoded copy', () => {
    const text = postSignupCopy({
      cityCount: 23,
      cityName: 'Mumbai',
      refId: VALID_UUID,
    });
    const url = buildShareUrl(text);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    const decoded = decodeURIComponent(url.replace('https://wa.me/?text=', ''));
    expect(decoded).toContain('Mumbai');
    expect(decoded).toContain(`ref=${VALID_UUID}`);
  });
});
