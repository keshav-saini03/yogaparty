import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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
