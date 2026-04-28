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

  return (
    <section
      aria-label="Call participants"
      className="border-t border-[color:var(--line)] pt-4 mt-4 space-y-3"
    >
      <p className="eyebrow">On call · {peerTiles.length + (selfTile ? 1 : 0)}</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
        {selfTile && <PeerTile {...selfTile} />}
        {peerTiles.map((t) => (
          <PeerTile key={t.peerId} {...t} />
        ))}
      </div>
      {peerTiles.length === 0 && state === 'on-call' && (
        <p className="font-mono text-[0.65rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
          Waiting for others to join the call.
        </p>
      )}
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
