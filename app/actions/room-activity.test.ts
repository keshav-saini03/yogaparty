import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    updateChain: {
      result: { error: null as unknown },
    },
    captured: {
      update: undefined as Record<string, unknown> | undefined,
      filters: [] as Array<[string, unknown, unknown?]>,
    },
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        mocks.captured.update = payload;
        const chain: Record<string, unknown> = {};
        chain.eq = (col: string, val: unknown) => {
          mocks.captured.filters.push(['eq', col, val]);
          return chain;
        };
        chain.not = (col: string, op: string, val: unknown) => {
          mocks.captured.filters.push(['not', col, val]);
          void op;
          return chain;
        };
        chain.lt = (col: string, val: unknown) => {
          mocks.captured.filters.push(['lt', col, val]);
          return chain;
        };
        chain.then = (resolve: (v: unknown) => void) => {
          resolve(mocks.updateChain.result);
        };
        return chain;
      },
    }),
  }),
}));

import { bumpRoomActivity, closeRoomIfStale } from './room-activity';

const VALID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  mocks.updateChain.result = { error: null };
  mocks.captured.update = undefined;
  mocks.captured.filters = [];
});

describe('bumpRoomActivity', () => {
  it('skips when roomId is not a UUID', async () => {
    await bumpRoomActivity('not-a-uuid');
    expect(mocks.captured.update).toBeUndefined();
  });

  it('updates last_active_at to current timestamp', async () => {
    await bumpRoomActivity(VALID);
    expect(mocks.captured.update).toHaveProperty('last_active_at');
    const ts = (mocks.captured.update as { last_active_at: string })
      .last_active_at;
    expect(typeof ts).toBe('string');
    const drift = Math.abs(Date.now() - new Date(ts).getTime());
    expect(drift).toBeLessThan(2000);
  });

  it('filters by room id', async () => {
    await bumpRoomActivity(VALID);
    expect(mocks.captured.filters).toContainEqual(['eq', 'id', VALID]);
  });

  it('does not throw when supabase returns an error', async () => {
    mocks.updateChain.result = { error: { message: 'column missing' } };
    await expect(bumpRoomActivity(VALID)).resolves.toBeUndefined();
  });
});

describe('closeRoomIfStale', () => {
  it('skips when roomId is not a UUID', async () => {
    await closeRoomIfStale('bogus');
    expect(mocks.captured.update).toBeUndefined();
  });

  it('sets is_active=false with city-room exclusion + 90s staleness filter', async () => {
    await closeRoomIfStale(VALID);
    expect(mocks.captured.update).toEqual({ is_active: false });
    const filterPairs = mocks.captured.filters.map((f) => [f[0], f[1]]);
    expect(filterPairs).toContainEqual(['eq', 'id']);
    expect(filterPairs).toContainEqual(['not', 'title']);
    expect(filterPairs).toContainEqual(['lt', 'last_active_at']);

    // Verify the cutoff is roughly now() - 90s
    const ltFilter = mocks.captured.filters.find((f) => f[0] === 'lt');
    expect(ltFilter).toBeDefined();
    const cutoff = new Date(ltFilter![2] as string).getTime();
    const expected = Date.now() - 90_000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(2000);
  });
});
