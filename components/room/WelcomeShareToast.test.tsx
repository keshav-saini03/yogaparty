import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomeShareToast } from './WelcomeShareToast';

// Vitest fake timers + @testing-library/react's default asyncWrapper deadlock
// because Testing Library queues a real setTimeout(0) to drain microtasks but
// Vitest's fake-timer queue never advances unless we tell it to. Override
// asyncWrapper for this file only — global override would silently slow down
// every other test in the suite.
const originalAsyncWrapper = (cb: () => Promise<unknown>) => cb();

beforeEach(() => {
  vi.useFakeTimers();
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

afterEach(() => {
  vi.useRealTimers();
  configure({ asyncWrapper: originalAsyncWrapper });
});

describe('WelcomeShareToast', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <WelcomeShareToast open={false} shareText="hi" onDismiss={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders toast content when open', () => {
    render(<WelcomeShareToast open shareText="hi" onDismiss={() => {}} />);
    expect(screen.getByText(/you'?re tuned in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
  });

  it('auto-dismisses after 8 seconds', () => {
    const onDismiss = vi.fn();
    render(<WelcomeShareToast open shareText="hi" onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(7999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismiss button calls onDismiss', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WelcomeShareToast open shareText="hi" onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: /later/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not restart the timer when only onDismiss identity changes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <WelcomeShareToast open shareText="hi" onDismiss={first} />
    );
    vi.advanceTimersByTime(5_000);
    rerender(<WelcomeShareToast open shareText="hi" onDismiss={second} />);
    vi.advanceTimersByTime(3_000);
    // Timer was set at mount; identity change on rerender must not reset it.
    // Since the ref now points at `second`, that's the one that fires.
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
