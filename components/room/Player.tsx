'use client';

import { useEffect, useRef, useState } from 'react';
import YouTube, { type YouTubeEvent, type YouTubePlayer } from 'react-youtube';

export const HOST_OPTS = {
  playerVars: {
    controls: 1,
    disablekb: 1,
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
  },
};

export const VIEWER_OPTS = {
  playerVars: {
    controls: 0,
    disablekb: 1,
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
    mute: 1, // viewers start muted to satisfy autoplay policy; toggle below
  },
};

export type PlayerHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (sec: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  loadVideo: (videoId: string, startSec?: number) => void;
  /**
   * Set YouTube playback rate. Only the discrete rates returned by
   * getAvailablePlaybackRates() are reliable — typically
   * [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]. Used for smooth drift
   * correction instead of jarring seeks.
   */
  setPlaybackRate: (rate: number) => void;
};

export type PlayerEventName = 'play' | 'pause' | 'seek';

// YouTube player state codes — see IFrame Player API reference.
const YT_PLAYING = 1;
const YT_PAUSED = 2;

type Props = {
  videoId: string | null;
  isHost: boolean;
  /**
   * For viewers only: the host's most recent intent (1 = playing, 2 = paused).
   * If a viewer's local player diverges from this, the player force-corrects
   * itself. null/undefined means "no intent yet" — viewer follows whatever
   * happens (e.g., before any sync_play is received).
   */
  enforceState?: number | null;
  onReady?: (handle: PlayerHandle) => void;
  onEvent?: (name: PlayerEventName, currentTime: number) => void;
  className?: string;
};

export function Player({
  videoId,
  isHost,
  enforceState,
  onReady,
  onEvent,
  className,
}: Props) {
  const ytRef = useRef<YouTubePlayer | null>(null);
  const handleRef = useRef<PlayerHandle | null>(null);
  const lastStateRef = useRef<number>(-1);
  const enforceRef = useRef<number | null | undefined>(enforceState);
  enforceRef.current = enforceState;

  // Local volume state. Personal — never broadcast. Mute is implicit
  // (volume === 0). Viewers start at 0 to satisfy autoplay; hosts at 80.
  const [volume, setVolume] = useState<number>(isHost ? 80 : 0);
  const [ready, setReady] = useState(false);
  const muted = volume === 0;

  // Push mute/volume to the iframe when our state changes (or when the
  // player becomes ready).
  useEffect(() => {
    const p = ytRef.current;
    if (!p || !ready) return;
    try {
      if (volume === 0) p.mute?.();
      else {
        p.unMute?.();
        p.setVolume?.(volume);
      }
    } catch {
      // player may have been destroyed mid-update; safe to ignore
    }
  }, [volume, ready]);

  // Imperative load when videoId changes — avoid full unmount/remount.
  useEffect(() => {
    const player = ytRef.current;
    if (!player || !videoId) return;
    try {
      player.cueVideoById?.(videoId);
    } catch {
      /* player may not be ready yet; YouTube handles this */
    }
  }, [videoId]);

  if (!videoId) {
    return (
      <div
        className={`aspect-video bg-[color:var(--bg-raised)] border border-[color:var(--line)] flex items-center justify-center ${className ?? ''}`}
      >
        <div className="text-center px-6">
          <p className="eyebrow">Standing by</p>
          <p className="mt-3 font-display text-[clamp(1.25rem,3vw,1.75rem)] text-[color:var(--ink-soft)]">
            {isHost
              ? 'Pick a video to start the broadcast.'
              : 'Waiting for host to pick a video…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-video bg-black border border-[color:var(--line)] overflow-hidden ${className ?? ''}`}
    >
      <YouTube
        videoId={videoId}
        opts={isHost ? HOST_OPTS : VIEWER_OPTS}
        className="w-full h-full"
        iframeClassName="w-full h-full"
        onReady={(e: YouTubeEvent) => {
          ytRef.current = e.target;
          setReady(true);
          const handle: PlayerHandle = {
            play: () => e.target.playVideo(),
            pause: () => e.target.pauseVideo(),
            seekTo: (sec, allow = true) => e.target.seekTo(sec, allow),
            getCurrentTime: () => e.target.getCurrentTime?.() ?? 0,
            getPlayerState: () => e.target.getPlayerState?.() ?? -1,
            loadVideo: (id: string, startSec = 0) =>
              e.target.loadVideoById(id, startSec),
            setPlaybackRate: (rate: number) => {
              try {
                e.target.setPlaybackRate?.(rate);
              } catch {
                /* unsupported rate / detached player — ignore */
              }
            },
          };
          handleRef.current = handle;
          onReady?.(handle);
        }}
        onStateChange={(e: YouTubeEvent<number>) => {
          const state = e.data;
          const t = e.target.getCurrentTime?.() ?? 0;

          if (isHost && onEvent) {
            // Host: convert YT state codes into outbound sync events.
            if (state === YT_PLAYING && lastStateRef.current !== YT_PLAYING) {
              onEvent('play', t);
            } else if (state === YT_PAUSED && lastStateRef.current !== YT_PAUSED) {
              onEvent('pause', t);
            }
          } else if (!isHost) {
            // Viewer: force-correct any local divergence from the host's
            // last broadcast intent. Stops "I clicked the video and now
            // I'm out of sync" entirely. The click-shield below blocks
            // most clicks; this catches anything that slips through
            // (keyboard shortcuts, devtools, etc.).
            const intent = enforceRef.current;
            if (intent === YT_PLAYING && state === YT_PAUSED) {
              try {
                e.target.playVideo();
              } catch {
                /* ignore */
              }
            } else if (intent === YT_PAUSED && state === YT_PLAYING) {
              try {
                e.target.pauseVideo();
              } catch {
                /* ignore */
              }
            }
          }

          lastStateRef.current = state;
        }}
      />

      {/* Click-shield for non-hosts: blocks pointer events on the iframe so
          a tap/click can't toggle play-pause locally. Sits below the audio
          control overlay (which has a higher z-index). Hosts skip this so
          they can still use YouTube's native controls. */}
      {!isHost && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 cursor-default"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      )}

      {/* Personal audio control — broadcast-style volume bar. Sits above the
          click-shield. Affects only this client. Volume of 0 == mute (no
          separate toggle). */}
      <VolumeBar volume={volume} muted={muted} onChange={setVolume} />
    </div>
  );
}

// Broadcast-style volume control. Custom-styled native range input so we keep
// keyboard + screenreader semantics, with a stroke-based speaker glyph whose
// wave count animates with the level. Filled portion uses --accent so the
// control reads at a glance even on a noisy thumbnail.
function VolumeBar({
  volume,
  muted,
  onChange,
}: {
  volume: number;
  muted: boolean;
  onChange: (next: number) => void;
}) {
  const pct = Math.max(0, Math.min(100, volume));
  const waves = muted ? 0 : pct >= 66 ? 2 : pct >= 25 ? 1 : 0;
  return (
    <div className="absolute right-2 bottom-2 sm:right-3 sm:bottom-3 z-20">
      <div
        className="flex items-center gap-2 sm:gap-3 bg-black/75 backdrop-blur-[2px] border border-[color:var(--line)] hover:border-[color:var(--accent)] transition-colors px-2.5 py-1.5"
        data-muted={muted ? 'true' : 'false'}
      >
        <span
          className="font-mono text-[0.55rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] hidden sm:inline"
          aria-hidden
        >
          Vol
        </span>
        <SpeakerGlyph waves={waves} muted={muted} />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={muted ? 'Volume (muted)' : `Volume ${pct} percent`}
          aria-valuetext={muted ? 'Muted' : `${pct} percent`}
          className="vu-slider"
          style={{ ['--vu-pct' as string]: `${pct}%` }}
        />
        <span
          className="font-mono tabular-nums text-[0.6rem] tracking-[0.08em] text-[color:var(--ink-soft)] min-w-[1.75rem] text-right"
          aria-hidden
        >
          {muted ? '—' : String(pct).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}

function SpeakerGlyph({ waves, muted }: { waves: 0 | 1 | 2; muted: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke={muted ? 'var(--ink-mute)' : 'var(--accent)'}
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className="transition-colors"
      aria-hidden
    >
      <path d="M2 6h2.5L8 3v10L4.5 10H2z" />
      {muted && <path d="M11 6l4 4M15 6l-4 4" />}
      {!muted && waves >= 1 && <path d="M11 6.2c0.9 1 0.9 2.6 0 3.6" />}
      {!muted && waves >= 2 && <path d="M13 4.5c2 1.9 2 5.1 0 7" />}
    </svg>
  );
}
