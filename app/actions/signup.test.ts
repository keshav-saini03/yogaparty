import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result<T> = { data: T | null; error: unknown };

const mocks = vi.hoisted(() => {
  return {
    refLookupRef: { data: null as { id: string } | null, error: null as unknown },
    insertResultRef: {
      data: null as { id: string; city: string | null } | null,
      error: null as unknown,
    },
    phoneLookupRef: {
      data: null as { id: string; city: string | null } | null,
      error: null as unknown,
    },
    insertSpy: vi.fn<(row: Record<string, unknown>) => void>(),
    cookiesSet: vi.fn(),
    cookiesGet: vi.fn<(name: string) => { value: string } | undefined>(() => undefined),
    getRoomByIdMock: vi.fn(),
    redirectMock: vi.fn(() => {
      throw new Error('REDIRECT');
    }),
    getDetectedCityMock: vi.fn(async () => 'Mumbai'),
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      // .insert(row).select('id, city').single()
      insert: (row: Record<string, unknown>) => {
        mocks.insertSpy(row);
        return {
          select: () => ({
            single: async (): Promise<Result<{ id: string; city: string | null }>> =>
              mocks.insertResultRef,
          }),
        };
      },
      // .select(cols).eq(col, val).maybeSingle()
      select: () => ({
        eq: (col: string) => ({
          maybeSingle: async (): Promise<Result<unknown>> => {
            if (col === 'id') return mocks.refLookupRef;
            return mocks.phoneLookupRef;
          },
        }),
      }),
    }),
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: mocks.cookiesSet,
    get: mocks.cookiesGet,
  }),
}));

vi.mock('@/lib/rooms', () => ({
  getRoomById: mocks.getRoomByIdMock,
}));

vi.mock('@/lib/geo', () => ({
  getDetectedCity: mocks.getDetectedCityMock,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirectMock,
}));

const {
  refLookupRef,
  insertResultRef,
  phoneLookupRef,
  insertSpy,
  cookiesSet,
  cookiesGet,
  getRoomByIdMock,
  redirectMock,
} = mocks;

import { createSignup } from './signup';

beforeEach(() => {
  refLookupRef.data = null;
  refLookupRef.error = null;
  insertResultRef.data = null;
  insertResultRef.error = null;
  phoneLookupRef.data = null;
  phoneLookupRef.error = null;
  insertSpy.mockReset();
  cookiesSet.mockReset();
  cookiesGet.mockReset();
  cookiesGet.mockReturnValue(undefined);
  getRoomByIdMock.mockReset();
  redirectMock.mockClear();
});

function fd(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.append(k, v);
  return data;
}

const VALID_REF = 'e57043bc-abcd-4fc9-bec6-3645f5931397';

describe('createSignup', () => {
  it('rejects missing name', async () => {
    const r = await createSignup(undefined, fd({ name: '  ', phone: '9730799430' }));
    expect(r).toEqual({ error: 'Please enter your name.' });
  });

  it('rejects malformed phone', async () => {
    const r = await createSignup(undefined, fd({ name: 'jseven', phone: 'abc' }));
    expect(r).toEqual({ error: 'Phone must be 6–15 digits.' });
  });

  it('nulls a referrer_id that does not exist before insert (no FK violation)', async () => {
    refLookupRef.data = null; // stale UUID
    insertResultRef.data = { id: 'NEW-SIGNUP', city: 'Mumbai' };
    await expect(
      createSignup(
        undefined,
        fd({ name: 'jseven', phone: '9730799430', referrer_id: VALID_REF })
      )
    ).rejects.toThrow('REDIRECT');
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0][0]).toMatchObject({ referrer_id: null });
    expect(redirectMock).toHaveBeenCalledWith('/rooms');
  });

  it('keeps a real referrer_id when it resolves in signups', async () => {
    refLookupRef.data = { id: VALID_REF };
    insertResultRef.data = { id: 'NEW-SIGNUP', city: 'Mumbai' };
    await expect(
      createSignup(
        undefined,
        fd({ name: 'jseven', phone: '9730799430', referrer_id: VALID_REF })
      )
    ).rejects.toThrow('REDIRECT');
    expect(insertSpy.mock.calls[0][0]).toMatchObject({ referrer_id: VALID_REF });
  });

  it('redirects existing signup on duplicate phone (23505)', async () => {
    insertResultRef.error = { code: '23505' };
    phoneLookupRef.data = { id: 'EXISTING-SIGNUP', city: 'Mumbai' };
    await expect(
      createSignup(undefined, fd({ name: 'jseven', phone: '9730799430' }))
    ).rejects.toThrow('REDIRECT');
    expect(cookiesSet).toHaveBeenCalledWith(
      'yp_session',
      'EXISTING-SIGNUP',
      expect.any(Object)
    );
    expect(redirectMock).toHaveBeenCalledWith('/rooms');
  });

  it('surfaces supabase error detail in the user-facing message', async () => {
    insertResultRef.error = { code: 'PGRST301', message: 'JWT invalid' };
    const r = await createSignup(
      undefined,
      fd({ name: 'jseven', phone: '9730799430' })
    );
    expect(r?.error).toMatch(/JWT invalid/);
  });
});
