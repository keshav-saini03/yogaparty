import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallDock } from './CallDock';

const noop = () => {};

describe('CallDock', () => {
  it('renders nothing when nobody is on call (state=idle, no peer tiles)', () => {
    const { container } = render(
      <CallDock
        state="idle"
        selfTile={null}
        peerTiles={[]}
        micEnabled={false}
        camEnabled={false}
        permissionError={null}
        onToggleMic={noop}
        onToggleCam={noop}
        onLeave={noop}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders self tile + controls when state=on-call and selfTile provided', () => {
    render(
      <CallDock
        state="on-call"
        selfTile={{
          peerId: 'self',
          name: 'You',
          city: 'Mumbai',
          micOn: true,
          camOn: false,
          isLocal: true,
          isSpeaking: false,
        }}
        peerTiles={[]}
        micEnabled
        camEnabled={false}
        permissionError={null}
        onToggleMic={noop}
        onToggleCam={noop}
        onLeave={noop}
      />
    );
    expect(screen.getByRole('button', { name: /leave/i })).toBeInTheDocument();
    expect(screen.getByText(/waiting for others/i)).toBeInTheDocument();
  });

  it('renders peer tiles when peers present', () => {
    render(
      <CallDock
        state="on-call"
        selfTile={{
          peerId: 'self',
          name: 'You',
          city: 'Mumbai',
          micOn: true,
          camOn: false,
          isLocal: true,
          isSpeaking: false,
        }}
        peerTiles={[
          {
            peerId: 'p1',
            name: 'Priya',
            city: 'Mumbai',
            micOn: true,
            camOn: false,
            isLocal: false,
            isSpeaking: false,
          },
        ]}
        micEnabled
        camEnabled={false}
        permissionError={null}
        onToggleMic={noop}
        onToggleCam={noop}
        onLeave={noop}
      />
    );
    expect(screen.getByText(/Priya/)).toBeInTheDocument();
    expect(screen.queryByText(/waiting for others/i)).toBeNull();
  });
});
