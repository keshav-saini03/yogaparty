'use client';

import { useEffect, useState } from 'react';
import { CallControls } from './CallControls';
import { HeadphonesTip } from './HeadphonesTip';
import { PeerTile } from './PeerTile';
import { HEADPHONES_TIP_KEY } from '@/lib/webrtc-config';
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
};

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
}: Props) {
  const [tipOpen, setTipOpen] = useState(false);

  // First-mic-on: open the tip if we haven't shown it yet.
  useEffect(() => {
    if (!micEnabled) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(HEADPHONES_TIP_KEY) === '1') return;
    setTipOpen(true);
  }, [micEnabled]);

  // Empty state — no self tile and no peers.
  const empty = !selfTile && peerTiles.length === 0;
  if (empty) return null;

  const allTiles: TileVm[] = selfTile ? [selfTile, ...peerTiles] : [...peerTiles];
  const totalCount = allTiles.length;

  return (
    <section
      aria-label="Call participants"
      className="dock-reveal mt-5 pt-4 border-t border-[color:var(--line)] space-y-4"
    >
      {/* Header — eyebrow + tally row + count */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="eyebrow flex items-center gap-2">
          <span className="pulse-dot" aria-hidden />
          On call
        </p>
        <span className="tally-row" aria-hidden>
          {allTiles.map((t) => (
            <span key={t.peerId} data-on={t.isSpeaking ? 'true' : 'false'} />
          ))}
        </span>
        <span className="ml-auto font-mono tabular-nums text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)]">
          {totalCount.toString().padStart(2, '0')}{' '}
          / {Math.max(7, totalCount).toString().padStart(2, '0')}
        </span>
      </div>

      {/* Tile grid — 3 cols mobile, expanding to 6 on lg */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
        {selfTile && <PeerTile {...selfTile} />}
        {peerTiles.map((t) => (
          <PeerTile key={t.peerId} {...t} />
        ))}
      </div>

      {peerTiles.length === 0 && state === 'on-call' && (
        <p className="font-mono text-[0.6rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] border-l-2 border-[color:var(--ink-faint)] pl-3">
          Waiting for others to join the call.
        </p>
      )}

      {/* Controls row */}
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

      <HeadphonesTip open={tipOpen} onClose={() => setTipOpen(false)} />
    </section>
  );
}
