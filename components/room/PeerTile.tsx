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

  useEffect(() => {
    if (!videoRef.current) return;
    // Clear when stream goes null too, otherwise the <video> keeps showing
    // the last frame after camera-off / peer-disconnect.
    videoRef.current.srcObject = stream ?? null;
  }, [stream]);

  const showVideo = camOn;
  const cityLabel = city && city !== 'GLOBAL' ? city : null;

  return (
    <div
      data-peer-id={peerId}
      data-speaking={isSpeaking ? 'true' : 'false'}
      className={`relative aspect-[4/3] bg-[color:var(--bg-raised)] border ${
        isSpeaking ? 'border-[color:var(--accent)]' : 'border-[color:var(--line)]'
      } overflow-hidden`}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          data-mirrored={isLocal ? 'true' : 'false'}
          className="w-full h-full object-cover"
          style={isLocal ? { transform: 'scaleX(-1)' } : undefined}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono uppercase tracking-[0.18em] text-[color:var(--ink-soft)] text-2xl">
            {monogram(name)}
          </span>
        </div>
      )}
      <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[color:var(--ink)] truncate">
          {isLocal ? 'You' : name}
          {cityLabel && (
            <span className="text-[color:var(--ink-mute)]"> · {cityLabel}</span>
          )}
        </span>
        <span
          aria-label={micOn ? 'mic on' : 'mic off'}
          className={`font-mono text-[0.6rem] tracking-[0.18em] uppercase ${
            micOn ? 'text-[color:var(--accent)]' : 'text-[color:var(--ink-mute)] line-through'
          }`}
        >
          🎤
        </span>
      </div>
    </div>
  );
}
