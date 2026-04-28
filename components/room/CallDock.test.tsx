import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallDock, type TileVm } from './CallDock';

const baseProps = {
  micEnabled: false,
  camEnabled: false,
  permissionError: null,
  onToggleMic: () => {},
  onToggleCam: () => {},
  onLeave: () => {},
  onJoinClick: () => {},
  listeningCount: 4,
  onCallCount: 0,
  speakerName: null,
  ducked: false,
};

const tile = (id: string, name: string): TileVm => ({
  peerId: id,
  name,
  city: 'Mumbai',
  micOn: true,
  camOn: false,
  isLocal: false,
  isSpeaking: false,
});

describe('CallDock ribbon', () => {
  it('idle: seat 0 is the + Join call CTA', () => {
    render(
      <CallDock
        {...baseProps}
        state="idle"
        selfTile={null}
        peerTiles={[tile('a', 'Riya'), tile('b', 'Jaya')]}
      />
    );
    expect(screen.getByRole('button', { name: /join call/i })).toBeInTheDocument();
    expect(screen.getByText(/Riya/)).toBeInTheDocument();
    expect(screen.getByText(/Jaya/)).toBeInTheDocument();
  });

  it('on-call: seat 0 is self tile, controls visible', () => {
    render(
      <CallDock
        {...baseProps}
        state="on-call"
        selfTile={{
          peerId: 'self',
          name: 'You',
          city: 'BLR',
          micOn: true,
          camOn: false,
          isLocal: true,
          isSpeaking: false,
        }}
        peerTiles={[tile('a', 'Riya')]}
        micEnabled
      />
    );
    expect(screen.queryByRole('button', { name: /join call/i })).toBeNull();
    expect(screen.getByRole('button', { name: /leave/i })).toBeInTheDocument();
  });

  it('idle: clicking + Join calls onJoinClick', async () => {
    const onJoinClick = vi.fn();
    const user = userEvent.setup();
    render(
      <CallDock
        {...baseProps}
        state="idle"
        selfTile={null}
        peerTiles={[]}
        onJoinClick={onJoinClick}
      />
    );
    await user.click(screen.getByRole('button', { name: /join call/i }));
    expect(onJoinClick).toHaveBeenCalledTimes(1);
  });

  it('eyebrow shows speaker name when on-call and someone is talking', () => {
    render(
      <CallDock
        {...baseProps}
        state="on-call"
        selfTile={{
          peerId: 'self',
          name: 'You',
          city: null,
          micOn: true,
          camOn: false,
          isLocal: true,
          isSpeaking: false,
        }}
        peerTiles={[tile('a', 'Riya')]}
        onCallCount={2}
        speakerName="Riya"
        ducked
      />
    );
    expect(screen.getByText(/Riya is talking · audio ducked/i)).toBeInTheDocument();
  });

  it('eyebrow shows listening count + no-call note when idle', () => {
    render(
      <CallDock
        {...baseProps}
        state="idle"
        selfTile={null}
        peerTiles={[tile('a', 'Riya')]}
        listeningCount={4}
      />
    );
    expect(screen.getByText(/04 listening · nobody on call yet/i)).toBeInTheDocument();
  });
});
