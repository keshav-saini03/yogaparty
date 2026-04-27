import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateEqEq = vi.fn(() => ({ error: null }));
const cookiesGet = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: updateEqEq,
        }),
      }),
    }),
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: cookiesGet,
  }),
}));

import { pickVideo } from './pick-video';
import { CURATED_VIDEOS } from '@/lib/videos';

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const VALID_SESSION = '99999999-aaaa-bbbb-cccc-dddddddddddd';

beforeEach(() => {
  updateEqEq.mockReset();
  updateEqEq.mockReturnValue({ error: null });
  cookiesGet.mockReset();
  cookiesGet.mockReturnValue({ value: VALID_SESSION });
});

describe('pickVideo', () => {
  it('rejects invalid roomId', async () => {
    const result = await pickVideo('not-a-uuid', CURATED_VIDEOS[0].id);
    expect(result).toEqual({ error: 'Invalid room id.' });
  });

  it('rejects non-curated videoId', async () => {
    const result = await pickVideo(VALID_UUID, 'malicious-id');
    expect(result).toEqual({ error: 'Video not in curated list.' });
  });

  it('rejects when no session cookie', async () => {
    cookiesGet.mockReturnValueOnce(undefined);
    const result = await pickVideo(VALID_UUID, CURATED_VIDEOS[0].id);
    expect(result).toEqual({ error: 'Not signed in.' });
  });

  it('rejects when session cookie is malformed', async () => {
    cookiesGet.mockReturnValueOnce({ value: 'not-a-uuid' });
    const result = await pickVideo(VALID_UUID, CURATED_VIDEOS[0].id);
    expect(result).toEqual({ error: 'Not signed in.' });
  });

  it('accepts a curated video with valid uuid + session', async () => {
    const result = await pickVideo(VALID_UUID, CURATED_VIDEOS[1].id);
    expect(result).toEqual({ ok: true });
    expect(updateEqEq).toHaveBeenCalledOnce();
  });

  it('returns error when supabase update fails', async () => {
    updateEqEq.mockReturnValueOnce({ error: { message: 'db down' } });
    const result = await pickVideo(VALID_UUID, CURATED_VIDEOS[0].id);
    expect(result).toEqual({ error: 'Could not change video.' });
  });
});
