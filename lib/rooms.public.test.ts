import { describe, it, expect, vi, beforeEach } from 'vitest';

const listResultRef: { data: unknown; error: unknown } = {
  data: [],
  error: null,
};
const insertSingleSpy = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const chain: Record<string, unknown> = {};
        chain.eq = () => chain;
        chain.not = () => chain;
        chain.gte = () => chain;
        chain.order = () => chain;
        chain.limit = () => Promise.resolve(listResultRef);
        chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
        return chain;
      },
      insert: () => ({
        select: () => ({
          single: insertSingleSpy,
        }),
      }),
      update: () => ({ eq: () => ({ error: null }) }),
    }),
  }),
}));

import {
  createPublicRoom,
  listPublicRooms,
  splitPublicRoomsByCity,
  type PublicRoomListing,
} from './rooms';

beforeEach(() => {
  listResultRef.data = [];
  listResultRef.error = null;
  insertSingleSpy.mockReset();
});

describe('listPublicRooms', () => {
  it('returns rows from supabase', async () => {
    listResultRef.data = [
      {
        id: 'r1',
        title: 'Morning flow',
        city: 'Mumbai',
        youtube_video_id: 'abc',
        created_at: '2026-04-27T10:00:00Z',
        creator_id: 'c1',
      },
    ];
    const out = await listPublicRooms(50);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Morning flow');
  });

  it('returns empty array on error', async () => {
    listResultRef.data = null;
    listResultRef.error = { message: 'db down' };
    const out = await listPublicRooms(50);
    expect(out).toEqual([]);
  });

  it('returns empty array when supabase returns null data', async () => {
    listResultRef.data = null;
    listResultRef.error = null;
    const out = await listPublicRooms(50);
    expect(out).toEqual([]);
  });
});

describe('createPublicRoom', () => {
  it('rejects empty title', async () => {
    const r = await createPublicRoom({
      title: '   ',
      creatorId: 'c1',
      city: 'Mumbai',
    });
    expect(r).toEqual({ error: 'Give your room a title.' });
    expect(insertSingleSpy).not.toHaveBeenCalled();
  });

  it('rejects title over 80 chars', async () => {
    const r = await createPublicRoom({
      title: 'x'.repeat(81),
      creatorId: 'c1',
      city: 'Mumbai',
    });
    expect(r).toEqual({ error: 'Title must be 80 chars or fewer.' });
  });

  it('inserts and returns id on success', async () => {
    insertSingleSpy.mockResolvedValueOnce({
      data: { id: 'new-room-id' },
      error: null,
    });
    const r = await createPublicRoom({
      title: 'Morning flow',
      creatorId: 'c1',
      city: 'Mumbai',
    });
    expect(r).toEqual({ ok: true, id: 'new-room-id' });
  });

  it('returns generic error on db failure', async () => {
    insertSingleSpy.mockResolvedValueOnce({
      data: null,
      error: { message: 'db down' },
    });
    const r = await createPublicRoom({
      title: 'Morning flow',
      creatorId: 'c1',
      city: 'Mumbai',
    });
    expect(r).toEqual({ error: 'Could not create room. Try again.' });
  });

  it('trims title before insert', async () => {
    insertSingleSpy.mockResolvedValueOnce({
      data: { id: 'rid' },
      error: null,
    });
    const r = await createPublicRoom({
      title: '  Hello  ',
      creatorId: 'c1',
      city: 'Mumbai',
    });
    expect(r).toEqual({ ok: true, id: 'rid' });
  });
});

const mkRoom = (
  id: string,
  city: string | null,
  title = 'Room ' + id
): PublicRoomListing => ({
  id,
  title,
  city,
  youtube_video_id: null,
  created_at: '2026-04-27T10:00:00Z',
  creator_id: null,
});

describe('splitPublicRoomsByCity', () => {
  const rooms = [
    mkRoom('a', 'Mumbai'),
    mkRoom('b', 'Delhi'),
    mkRoom('c', 'Mumbai'),
    mkRoom('d', null),
  ];

  it('puts rooms matching the viewer city into inYourCity', () => {
    const r = splitPublicRoomsByCity(rooms, 'Mumbai');
    expect(r.inYourCity.map((x) => x.id)).toEqual(['a', 'c']);
    expect(r.elsewhere.map((x) => x.id)).toEqual(['b', 'd']);
  });

  it('returns everything in elsewhere when viewerCity is null', () => {
    const r = splitPublicRoomsByCity(rooms, null);
    expect(r.inYourCity).toEqual([]);
    expect(r.elsewhere).toEqual(rooms);
  });

  it('returns everything in elsewhere when viewerCity is GLOBAL', () => {
    const r = splitPublicRoomsByCity(rooms, 'GLOBAL');
    expect(r.inYourCity).toEqual([]);
    expect(r.elsewhere).toEqual(rooms);
  });

  it('treats whitespace-only as no city', () => {
    const r = splitPublicRoomsByCity(rooms, '   ');
    expect(r.inYourCity).toEqual([]);
  });

  it('does not match a room whose city is null', () => {
    const r = splitPublicRoomsByCity(rooms, 'Pune');
    expect(r.inYourCity).toEqual([]);
    expect(r.elsewhere).toEqual(rooms);
  });
});
