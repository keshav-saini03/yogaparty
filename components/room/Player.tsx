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

  // Local mute / volume state. Personal — never broadcast.
  // Viewers start muted (autoplay), hosts start unmuted.
  const [muted, setMuted] = useState<boolean>(!isHost);
  const [volume, setVolume] = useState<number>(80);
  const [ready, setReady] = useState(false);

  // Push mute/volume to the iframe when our state changes (or when the
  // player becomes ready).
  useEffect(() => {
    const p = ytRef.current;
    if (!p || !ready) return;
    try {
      if (muted) p.mute?.();
      else p.unMute?.();
      p.setVolume?.(volume);
    } catch {
      // player may have been destroyed mid-update; safe to ignore
    }
  }, [muted, volume, ready]);

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

      {/* Personal audio control overlay — sits above the click-shield.
          Mute toggle + volume slider. Affects only this client's iframe. */}
      <div className="absolute right-3 bottom-3 z-20 flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 bg-black/70 border border-[color:var(--line)] px-2 py-1">
          <span
            className="font-mono text-[0.55rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]"
            aria-hidden
          >
            Vol
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume}
            onChange={(e) => {
              const next = Number(e.target.value);
              setVolume(next);
              if (next === 0) setMuted(true);
              else if (muted) setMuted(false);
            }}
            aria-label="Volume"
            style={{ width: '5rem', accentColor: 'var(--accent)' }}
          />
        </div>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="bg-black/70 border border-[color:var(--line)] hover:border-[color:var(--accent)] text-[color:var(--ink)] font-mono text-[0.65rem] tracking-[0.18em] uppercase px-2 py-1 transition-colors"
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted ? 'true' : 'false'}
        >
          {muted ? '🔇 Unmute' : '🔊 Mute'}
        </button>
      </div>
    </div>
  );
}
