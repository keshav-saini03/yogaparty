import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';

// @testing-library/react's asyncWrapper drains the microtask queue with a
// setTimeout(0) but only advances Jest fake timers, not Vitest's. When
// vi.useFakeTimers() is active that setTimeout never fires and any
// `await userEvent.*` call deadlocks. We override asyncWrapper here to
// advance Vitest fake timers so the drain resolves correctly.
beforeEach(() => {
  configure({
    asyncWrapper: async (cb) => {
      const result = await cb();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
        if (vi.isFakeTimers()) {
          vi.advanceTimersByTime(0);
        }
      });
      return result;
    },
  });
});
