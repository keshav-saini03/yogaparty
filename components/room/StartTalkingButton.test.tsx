import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartTalkingButton } from './StartTalkingButton';

describe('StartTalkingButton', () => {
  it('renders with the canonical label', () => {
    render(<StartTalkingButton onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /start talking/i })).toBeInTheDocument();
  });

  it('invokes onClick once per click', async () => {
    const onClick = vi.fn();
    render(<StartTalkingButton onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
