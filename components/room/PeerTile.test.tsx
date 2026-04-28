import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeerTile } from './PeerTile';

describe('PeerTile', () => {
  it('shows the participant name', () => {
    render(
      <PeerTile
        peerId="x"
        name="Priya"
        city="Mumbai"
        micOn
        camOn={false}
        isLocal={false}
        isSpeaking={false}
      />
    );
    expect(screen.getByText(/Priya/)).toBeInTheDocument();
    expect(screen.getByText(/Mumbai/)).toBeInTheDocument();
  });

  it('applies the speaking-border class when isSpeaking', () => {
    const { container } = render(
      <PeerTile
        peerId="x"
        name="Priya"
        city="Mumbai"
        micOn
        camOn={false}
        isLocal={false}
        isSpeaking={true}
      />
    );
    expect(container.querySelector('[data-speaking="true"]')).toBeTruthy();
  });

  it('mirrors video for self-tile (transform: scaleX(-1))', () => {
    const { container } = render(
      <PeerTile
        peerId="self"
        name="You"
        city="Mumbai"
        micOn
        camOn
        isLocal={true}
        isSpeaking={false}
      />
    );
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('data-mirrored')).toBe('true');
  });

  it('shows monogram fallback when camera is off', () => {
    render(
      <PeerTile
        peerId="x"
        name="Sai Kumar"
        city={null}
        micOn={false}
        camOn={false}
        isLocal={false}
        isSpeaking={false}
      />
    );
    expect(screen.getByText('SK')).toBeInTheDocument();
  });
});
