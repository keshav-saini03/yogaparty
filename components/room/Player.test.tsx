import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Player } from './Player';

vi.mock('react-youtube', () => ({
  __esModule: true,
  default: () => null,
}));

describe('Player — duckedVolume', () => {
  it('accepts a duckedVolume prop without crashing', () => {
    const { container } = render(
      <Player videoId="dQw4w9WgXcQ" isHost={false} duckedVolume={24} />
    );
    expect(container).toBeTruthy();
  });
});

describe('Player hostControl slot', () => {
  it('renders hostControl when isHost is true', () => {
    render(
      <Player
        videoId="abc"
        isHost
        hostControl={<button data-testid="host-cta">Change video</button>}
      />
    );
    expect(screen.getByTestId('host-cta')).toBeInTheDocument();
  });

  it('does not render hostControl when isHost is false', () => {
    render(
      <Player
        videoId="abc"
        isHost={false}
        hostControl={<button data-testid="host-cta">Change video</button>}
      />
    );
    expect(screen.queryByTestId('host-cta')).toBeNull();
  });

  it('does not render slot wrapper when hostControl is undefined', () => {
    const { container } = render(<Player videoId="abc" isHost />);
    expect(container.querySelector('[data-host-slot="true"]')).toBeNull();
  });
});
