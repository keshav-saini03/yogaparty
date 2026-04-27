import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    lookupResultRef: { data: null as unknown, error: null as unknown },
    cookiesSet: vi.fn(),
    findOrCreateCityRoomMock: vi.fn(async () => ({
      id: 'CITY-ROOM',
      city: 'Mumbai',
    })),
    getRoomByIdMock: vi.fn(),
    redirectMock: vi.fn(() => {
      throw new Error('REDIRECT');
    }),
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(mocks.lookupResultRef),
        }),
      }),
    }),
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: mocks.cookiesSet,
  }),
}));

vi.mock('@/lib/rooms', () => ({
  findOrCreateCityRoom: mocks.findOrCreateCityRoomMock,
  getRoomById: mocks.getRoomByIdMock,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirectMock,
}));

const {
  lookupResultRef,
  cookiesSet,
  findOrCreateCityRoomMock,
  getRoomByIdMock,
  redirectMock,
} = mocks;

import { loginByPhone } from './login';

beforeEach(() => {
  lookupResultRef.data = null;
  lookupResultRef.error = null;
  cookiesSet.mockReset();
  findOrCreateCityRoomMock.mockClear();
  getRoomByIdMock.mockReset();
  redirectMock.mockClear();
});

function fd(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.append(k, v);
  return data;
}

describe('loginByPhone', () => {
  it('rejects malformed phone', async () => {
    const r = await loginByPhone(undefined, fd({ phone: 'abc', country_code: '+91' }));
    expect(r).toEqual({ error: 'Phone must be 6–15 digits.' });
  });

  it('returns friendly error when phone not found', async () => {
    lookupResultRef.data = null;
    const r = await loginByPhone(
      undefined,
      fd({ phone: '9876543210', country_code: '+91' })
    );
    expect(r).toBeDefined();
    expect(r?.error).toMatch(/don't have that number/);
  });

  it('returns generic error on supabase lookup failure', async () => {
    lookupResultRef.error = { message: 'db down' };
    const r = await loginByPhone(
      undefined,
      fd({ phone: '9876543210', country_code: '+91' })
    );
    expect(r).toEqual({ error: 'Something went wrong. Try again.' });
  });

  it('sets cookie and redirects to city room on successful lookup', async () => {
    lookupResultRef.data = {
      id: 'sig-id-uuid',
      city: 'Mumbai',
      country_code: '+91',
    };
    await expect(
      loginByPhone(undefined, fd({ phone: '9876543210', country_code: '+91' }))
    ).rejects.toThrow('REDIRECT');
    expect(cookiesSet).toHaveBeenCalledWith(
      'yp_session',
      'sig-id-uuid',
      expect.any(Object)
    );
    expect(findOrCreateCityRoomMock).toHaveBeenCalledWith('Mumbai');
    expect(redirectMock).toHaveBeenCalledWith('/room/CITY-ROOM');
  });

  it('honors a valid ?next= path when the room exists', async () => {
    lookupResultRef.data = {
      id: 'sig-id-uuid',
      city: 'Mumbai',
      country_code: '+91',
    };
    getRoomByIdMock.mockResolvedValueOnce({ id: 'real-room' });
    await expect(
      loginByPhone(
        undefined,
        fd({
          phone: '9876543210',
          country_code: '+91',
          next: '/room/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        })
      )
    ).rejects.toThrow('REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith(
      '/room/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    );
  });

  it('falls back to city room when ?next= room does not exist', async () => {
    lookupResultRef.data = {
      id: 'sig-id-uuid',
      city: 'Mumbai',
      country_code: '+91',
    };
    getRoomByIdMock.mockResolvedValueOnce(null);
    await expect(
      loginByPhone(
        undefined,
        fd({
          phone: '9876543210',
          country_code: '+91',
          next: '/room/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        })
      )
    ).rejects.toThrow('REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/room/CITY-ROOM');
  });

  it('rejects open-redirect-style next paths', async () => {
    lookupResultRef.data = {
      id: 'sig-id-uuid',
      city: 'Mumbai',
      country_code: '+91',
    };
    await expect(
      loginByPhone(
        undefined,
        fd({
          phone: '9876543210',
          country_code: '+91',
          next: 'https://evil.example/x',
        })
      )
    ).rejects.toThrow('REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/room/CITY-ROOM');
  });
});
