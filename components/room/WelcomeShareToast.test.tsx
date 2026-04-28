import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomeShareToast } from './WelcomeShareToast';

describe('WelcomeShareToast', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

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
});
