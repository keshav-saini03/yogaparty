import { describe, it, expect } from 'vitest';
import {
  CURATED_VIDEOS,
  getCuratedVideo,
  isCuratedVideo,
  isYouTubeId,
  parseYouTubeId,
} from './videos';

const SAMPLE_ID = 'dQw4w9WgXcQ';

describe('isYouTubeId', () => {
  it('accepts an 11-char alphanum/underscore/dash id', () => {
    expect(isYouTubeId(SAMPLE_ID)).toBe(true);
    expect(isYouTubeId('abc-DEF_xyz')).toBe(true);
  });

  it('rejects shorter / longer / illegal ids', () => {
    expect(isYouTubeId('short')).toBe(false);
    expect(isYouTubeId('toolongidentifier')).toBe(false);
    expect(isYouTubeId('hasaspace !!')).toBe(false);
  });
});

describe('parseYouTubeId', () => {
  it('returns the id for a bare 11-char id', () => {
    expect(parseYouTubeId(SAMPLE_ID)).toBe(SAMPLE_ID);
  });

  it('parses a youtu.be link', () => {
    expect(parseYouTubeId(`https://youtu.be/${SAMPLE_ID}`)).toBe(SAMPLE_ID);
    expect(parseYouTubeId(`https://youtu.be/${SAMPLE_ID}?t=42`)).toBe(SAMPLE_ID);
  });

  it('parses a www.youtube.com/watch?v= link', () => {
    expect(
      parseYouTubeId(`https://www.youtube.com/watch?v=${SAMPLE_ID}`)
    ).toBe(SAMPLE_ID);
    expect(
      parseYouTubeId(`https://www.youtube.com/watch?v=${SAMPLE_ID}&t=10s&list=foo`)
    ).toBe(SAMPLE_ID);
  });

  it('parses youtube.com without www', () => {
    expect(parseYouTubeId(`https://youtube.com/watch?v=${SAMPLE_ID}`)).toBe(SAMPLE_ID);
  });

  it('parses an /embed/ID link', () => {
    expect(parseYouTubeId(`https://www.youtube.com/embed/${SAMPLE_ID}`)).toBe(SAMPLE_ID);
  });

  it('parses a /shorts/ID link', () => {
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${SAMPLE_ID}`)).toBe(SAMPLE_ID);
  });

  it('parses m.youtube.com variant', () => {
    expect(parseYouTubeId(`https://m.youtube.com/watch?v=${SAMPLE_ID}`)).toBe(SAMPLE_ID);
  });

  it('parses music.youtube.com variant', () => {
    expect(
      parseYouTubeId(`https://music.youtube.com/watch?v=${SAMPLE_ID}&list=x`)
    ).toBe(SAMPLE_ID);
  });

  it('parses a URL pasted without a scheme', () => {
    expect(parseYouTubeId(`youtu.be/${SAMPLE_ID}`)).toBe(SAMPLE_ID);
    expect(parseYouTubeId(`youtube.com/watch?v=${SAMPLE_ID}`)).toBe(SAMPLE_ID);
  });

  it('trims surrounding whitespace', () => {
    expect(parseYouTubeId(`   https://youtu.be/${SAMPLE_ID}   `)).toBe(SAMPLE_ID);
  });

  it('returns null for empty / null / whitespace input', () => {
    expect(parseYouTubeId(null)).toBeNull();
    expect(parseYouTubeId(undefined)).toBeNull();
    expect(parseYouTubeId('')).toBeNull();
    expect(parseYouTubeId('   ')).toBeNull();
  });

  it('returns null for non-YouTube URLs', () => {
    expect(parseYouTubeId('https://vimeo.com/123456')).toBeNull();
    expect(parseYouTubeId('https://google.com')).toBeNull();
  });

  it('returns null for malformed YouTube URLs', () => {
    expect(parseYouTubeId('https://youtube.com/watch?v=tooshort')).toBeNull();
    expect(parseYouTubeId('https://youtube.com/watch')).toBeNull();
    expect(parseYouTubeId('https://youtu.be/')).toBeNull();
  });
});

describe('isCuratedVideo / getCuratedVideo', () => {
  it('matches every curated id', () => {
    for (const v of CURATED_VIDEOS) {
      expect(isCuratedVideo(v.id)).toBe(true);
      expect(getCuratedVideo(v.id)?.title).toBe(v.title);
    }
  });

  it('rejects non-curated ids', () => {
    expect(isCuratedVideo('not_in_list')).toBe(false);
    expect(getCuratedVideo('not_in_list')).toBeUndefined();
  });
});
