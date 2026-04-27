export type CuratedVideo = {
  id: string;
  title: string;
  durationSec: number;
  thumbnail?: string;
};

// Placeholder Habuild yoga IDs — to be replaced pre-demo with the real curated list.
// All videos must have embedding enabled (YouTube → embed=true).
export const CURATED_VIDEOS: readonly CuratedVideo[] = [
  {
    id: 'inpok4MKVLM',
    title: 'Morning yoga · 10 min energy flow',
    durationSec: 600,
    thumbnail: 'https://i.ytimg.com/vi/inpok4MKVLM/hqdefault.jpg',
  },
  {
    id: 'v7AYKMP6rOE',
    title: 'Evening calm · 20 min wind-down',
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
