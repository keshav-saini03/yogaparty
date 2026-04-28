'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CallControls } from './CallControls';
import { HeadphonesTip } from './HeadphonesTip';
import { PeerTile } from './PeerTile';
import { HEADPHONES_TIP_KEY } from '@/lib/webrtc-config';
import { formatRoomEyebrow } from '@/lib/room-format';
import type { CallState } from '@/hooks/useCall';

export type TileVm = {
  peerId: string;
  name: string;
  city: string | null;
  micOn: boolean;
  camOn: boolean;
  isLocal: boolean;
  isSpeaking: boolean;
  stream?: MediaStream | null;
};

type Props = {
  state: CallState;
  selfTile: TileVm | null;
  peerTiles: TileVm[];
  micEnabled: boolean;
  camEnabled: boolean;
  permissionError: string | null;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
  /** Called when the + Join CTA tile is clicked while idle. */
  onJoinClick: () => void;
  /** Counts and speaker info for the eyebrow line. */
  listeningCount: number;
  onCallCount: number;
  speakerName: string | null;
  ducked: boolean;
};

const SEATS = 7;

export function CallDock({
  state,
  selfTile,
  peerTiles,
  micEnabled,
  camEnabled,
  permissionError,
  onToggleMic,
  onToggleCam,
  onLeave,
  onJoinClick,
  listeningCount,
  onCallCount,
  speakerName,
  ducked,
}: Props) {
  const [tipOpen, setTipOpen] = useState(false);

  useEffect(() => {
    if (!micEnabled) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(HEADPHONES_TIP_KEY) === '1') return;
    setTipOpen(true);
  }, [micEnabled]);

  const eyebrow = formatRoomEyebrow({
    listening: listeningCount,
    onCall: onCallCount,
    speakerName,
    ducked,
  });

  const seats: ReactNode[] = [];
  const isOnCall = state === 'on-call';

  if (!isOnCall) {
    seats.push(
      <button
        key="join"
        type="button"
        onClick={onJoinClick}
        aria-label="Join call"
        className="aspect-[4/3] border border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex flex-col items-center justify-center gap-1 hover:bg-[rgba(245,180,0,0.18)] transition-colors"
      >
        <span aria-hidden className="text-2xl leading-none">+</span>
        <span className="font-mono text-[0.55rem] tracking-[0.22em] uppercase">Join call</span>
      </button>
    );
    for (const t of peerTiles.slice(0, SEATS - 1)) {
      seats.push(<PeerTile key={t.peerId} {...t} />);
    }
    while (seats.length < SEATS) seats.push(<EmptySeat key={`e${seats.length}`} />);
  } else {
    if (selfTile) seats.push(<PeerTile key={selfTile.peerId} {...selfTile} />);
    for (const t of peerTiles.slice(0, SEATS - (selfTile ? 1 : 0))) {
      seats.push(<PeerTile key={t.peerId} {...t} />);
    }
    while (seats.length < SEATS) seats.push(<EmptySeat key={`e${seats.length}`} />);
  }

  return (
    <section
      aria-label="Call participants"
      className="dock-reveal mt-5 pt-4 border-t border-[color:var(--line)] space-y-3"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <p className="eyebrow flex items-center gap-2">
          <span className="pulse-dot" aria-hidden />
          {isOnCall ? 'On call' : 'In the room'}
        </p>
        <span
          aria-live="polite"
          className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-[color:var(--ink-soft)]"
        >
          {eyebrow}
        </span>
        <span className="ml-auto font-mono tabular-nums text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)]">
          {onCallCount.toString().padStart(2, '0')} / {SEATS.toString().padStart(2, '0')}
        </span>
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-2 sm:gap-3">
        {seats}
      </div>

      {isOnCall && (
        <CallControls
          state={state}
          micEnabled={micEnabled}
          camEnabled={camEnabled}
          permissionError={permissionError}
          onToggleMic={onToggleMic}
          onToggleCam={onToggleCam}
          onLeave={onLeave}
          onShowTip={() => setTipOpen(true)}
        />
      )}

      <HeadphonesTip open={tipOpen} onClose={() => setTipOpen(false)} />
    </section>
  );
}

function EmptySeat() {
  return (
    <div
      aria-hidden
      className="aspect-[4/3] border border-dashed border-[color:var(--ink-faint)] flex items-center justify-center text-[color:var(--ink-faint)] text-xs"
    >
      ·
    </div>
  );
}
