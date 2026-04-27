import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertResult = { data: { id: 'NEW-ROOM-ID', city: 'Mumbai' }, error: null };
const selectMaybeSingleSpy = vi.fn();
const insertSingleSpy = vi.fn(() => insertResult);

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: selectMaybeSingleSpy,
                }),
              }),
            }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: insertSingleSpy,
        }),
      }),
      update: () => ({
        eq: () => ({ error: null }),
      }),
    }),
  }),
}));

import {
  findOrCreateCityRoom,
  normalizeCity,
} from './rooms';

beforeEach(() => {
  selectMaybeSingleSpy.mockReset();
  insertSingleSpy.mockReset();
  insertSingleSpy.mockReturnValue(insertResult);
});

describe('normalizeCity', () => {
  it('returns GLOBAL for null', () => {
    expect(normalizeCity(null)).toBe('GLOBAL');
  });

  it('returns GLOBAL for empty string', () => {
    expect(normalizeCity('')).toBe('GLOBAL');
  });

  it('trims whitespace', () => {
    expect(normalizeCity('  Mumbai  ')).toBe('Mumbai');
  });

  it('preserves non-ASCII city names', () => {
    expect(normalizeCity('Bengaluru')).toBe('Bengaluru');
  });

  it('returns GLOBAL for whitespace-only', () => {
    expect(normalizeCity('   ')).toBe('GLOBAL');
  });
});

describe('findOrCreateCityRoom', () => {
  it('returns existing city room id when one exists', async () => {
    selectMaybeSingleSpy.mockResolvedValueOnce({
      data: { id: 'EXISTING-ROOM', city: 'Mumbai' },
      error: null,
    });

    const result = await findOrCreateCityRoom('Mumbai');

    expect(result.id).toBe('EXISTING-ROOM');
    expect(result.city).toBe('Mumbai');
    expect(insertSingleSpy).not.toHaveBeenCalled();
  });

  it('creates new room when none exists', async () => {
    selectMaybeSingleSpy.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await findOrCreateCityRoom('Mumbai');

    expect(result.id).toBe('NEW-ROOM-ID');
    expect(insertSingleSpy).toHaveBeenCalledOnce();
  });

  it('falls back to GLOBAL when city is null', async () => {
    selectMaybeSingleSpy.mockResolvedValueOnce({
      data: { id: 'GLOBAL-ROOM', city: 'GLOBAL' },
      error: null,
    });

    const result = await findOrCreateCityRoom(null);

    expect(result.city).toBe('GLOBAL');
  });

  it('on insert error, retries SELECT to handle race', async () => {
    selectMaybeSingleSpy
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { id: 'RACE-WON-ROOM', city: 'Mumbai' },
        error: null,
      });
    insertSingleSpy.mockReturnValueOnce({
      data: null,
      error: { message: 'duplicate key' },
    });

    const result = await findOrCreateCityRoom('Mumbai');

    expect(result.id).toBe('RACE-WON-ROOM');
    expect(selectMaybeSingleSpy).toHaveBeenCalledTimes(2);
  });

  it('throws when insert fails AND retry select also empty', async () => {
    selectMaybeSingleSpy
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    insertSingleSpy.mockReturnValueOnce({
      data: null,
      error: { message: 'permission denied' },
    });

    await expect(findOrCreateCityRoom('Mumbai')).rejects.toThrow(
      /findOrCreateCityRoom failed/
    );
  });
});
