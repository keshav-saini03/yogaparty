import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallControls } from './CallControls';

describe('CallControls', () => {
  it('renders mic, cam, leave buttons', () => {
    render(
      <CallControls
        state="on-call"
        micEnabled
        camEnabled={false}
        permissionError={null}
        onToggleMic={() => {}}
        onToggleCam={() => {}}
        onLeave={() => {}}
        onShowTip={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /mic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cam/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /leave/i })).toBeInTheDocument();
  });

  it('clicking mic invokes onToggleMic', async () => {
    const onToggleMic = vi.fn();
    render(
      <CallControls
        state="on-call"
        micEnabled={false}
        camEnabled={false}
        permissionError={null}
        onToggleMic={onToggleMic}
        onToggleCam={() => {}}
        onLeave={() => {}}
        onShowTip={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /mic/i }));
    expect(onToggleMic).toHaveBeenCalledTimes(1);
  });

  it('hides Leave when state is idle', () => {
    render(
      <CallControls
        state="idle"
        micEnabled={false}
        camEnabled={false}
        permissionError={null}
        onToggleMic={() => {}}
        onToggleCam={() => {}}
        onLeave={() => {}}
        onShowTip={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /leave/i })).toBeNull();
  });

  it('shows permission-denied caption when state is permission-denied', () => {
    render(
      <CallControls
        state="permission-denied"
        micEnabled={false}
        camEnabled={false}
        permissionError="denied"
        onToggleMic={() => {}}
        onToggleCam={() => {}}
        onLeave={() => {}}
        onShowTip={() => {}}
      />
    );
    expect(screen.getByText(/re-enable in browser/i)).toBeInTheDocument();
  });
});
