'use client';

import { useEffect, useRef } from 'react';

type Props = {
  peerId: string;
  name: string;
  city: string | null;
  micOn: boolean;
  camOn: boolean;
  isLocal: boolean;
  isSpeaking: boolean;
  /** Live media stream for this peer; null until it arrives. */
  stream?: MediaStream | null;
};

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

export function PeerTile({
  peerId,
  name,
  city,
  micOn,
  camOn,
  isLocal,
  isSpeaking,
  stream,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const showVideo = camOn;

  useEffect(() => {
    if (!videoRef.current) return;
    // Clear when stream goes null too, otherwise the <video> keeps showing
    // the last frame after camera-off / peer-disconnect.
    // showVideo in the deps: when camOn flips false→true the <video> is
    // freshly mounted with no srcObject; the stream reference may not have
    // changed, so we need this dep to re-fire the assignment on remount.
    videoRef.current.srcObject = stream ?? null;
  }, [stream, showVideo]);
  const cityLabel = city && city !== 'GLOBAL' ? city : null;

  return (
    <div
      data-peer-id={peerId}
      data-speaking={isSpeaking ? 'true' : 'false'}
      className={`relative aspect-[4/3] bg-[color:var(--bg-raised)] border ${
        isSpeaking
          ? 'border-[color:var(--accent)]'
          : 'border-[color:var(--line)]'
      } overflow-hidden`}
    >
      {showVideo ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            data-mirrored={isLocal ? 'true' : 'false'}
            className="w-full h-full object-cover"
            style={isLocal ? { transform: 'scaleX(-1)' } : undefined}
          />
          <span className="tile-scan" aria-hidden />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center select-none">
          <span className="tile-monogram" aria-hidden>
            {monogram(name) || '·'}
          </span>
        </div>
      )}

      {/* Tally — appears when the peer is speaking */}
      <span className="tile-tally" aria-hidden>
        ON
      </span>

      {/* VU meter — 5 bars on the right edge, animated when speaking */}
      <span className="tile-vu" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>

      {/* Bottom strip — name · city + stroke-SVG mic glyph */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 px-2 py-1.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent">
        <span className="font-mono text-[0.58rem] sm:text-[0.62rem] uppercase tracking-[0.18em] text-[color:var(--ink)] truncate">
          {isLocal ? 'You' : name}
          {cityLabel && (
            <span className="text-[color:var(--ink-mute)]"> · {cityLabel}</span>
          )}
        </span>
        <MicGlyph on={micOn} />
      </div>
    </div>
  );
}

function MicGlyph({ on }: { on: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke={on ? 'var(--accent)' : 'var(--ink-mute)'}
      strokeWidth="1.4"
      strokeLinecap="square"
      aria-label={on ? 'mic on' : 'mic off'}
      role="img"
      className="flex-none"
    >
      <rect x="6" y="2" width="4" height="7" rx="2" />
      <path d="M3.5 8c0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5" />
      <line x1="8" y1="12.5" x2="8" y2="14" />
      {!on && <line x1="2" y1="2" x2="14" y2="14" stroke="var(--ink-mute)" />}
    </svg>
  );
}
