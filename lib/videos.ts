export type CuratedVideo = {
  id: string;
  title: string;
  durationSec: number;
  thumbnail?: string;
};

// Curated session IDs — all must have embedding enabled (YouTube → embed=true).
export const CURATED_VIDEOS: readonly CuratedVideo[] = [
  {
    id: 'inpok4MKVLM',
    title: 'Morning · 10 min energy flow',
    durationSec: 600,
    thumbnail: 'https://i.ytimg.com/vi/inpok4MKVLM/hqdefault.jpg',
  },
  {
    id: 'v7AYKMP6rOE',
    title: 'Evening · 20 min wind-down',
    durationSec: 1200,
    thumbnail: 'https://i.ytimg.com/vi/v7AYKMP6rOE/hqdefault.jpg',
  },
  {
    id: '4pKly2JojMw',
    title: 'Power flow · 15 min strength',
    durationSec: 900,
    thumbnail: 'https://i.ytimg.com/vi/4pKly2JojMw/hqdefault.jpg',
  },
  {
    id: 'BiWDsfZ3zbo',
    title: 'Beginner basics · 12 min foundations',
    durationSec: 720,
    thumbnail: 'https://i.ytimg.com/vi/BiWDsfZ3zbo/hqdefault.jpg',
  },
  {
    id: 'COp7BR_Dvps',
    title: 'Hip openers · 18 min restore',
    durationSec: 1080,
    thumbnail: 'https://i.ytimg.com/vi/COp7BR_Dvps/hqdefault.jpg',
  },
] as const;

export function isCuratedVideo(id: string): boolean {
  return CURATED_VIDEOS.some((v) => v.id === id);
}

export function getCuratedVideo(id: string): CuratedVideo | undefined {
  return CURATED_VIDEOS.find((v) => v.id === id);
}

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function isYouTubeId(id: string): boolean {
  return YOUTUBE_ID_RE.test(id);
}

/**
 * Extract a YouTube video id from a wide range of inputs:
 *   https://www.youtube.com/watch?v=ID  (with or without trailing query)
 *   https://youtu.be/ID
 *   https://youtube.com/embed/ID
 *   https://youtube.com/v/ID
 *   https://youtube.com/shorts/ID
 *   m.youtube.com / music.youtube.com variants
 *   bare 11-char id
 *
 * Returns null when no valid id can be parsed.
 */
export function parseYouTubeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // Already a bare 11-char id?
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }

  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com'
  ) {
    const v = url.searchParams.get('v');
    if (v && YOUTUBE_ID_RE.test(v)) return v;
    const m = url.pathname.match(/^\/(?:embed|v|shorts|live)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  }

  return null;
}
