'use client';

import { useEffect, useRef } from 'react';
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
    mute: 1,
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

type Props = {
  videoId: string | null;
  isHost: boolean;
  onReady?: (handle: PlayerHandle) => void;
  onEvent?: (name: PlayerEventName, currentTime: number) => void;
  className?: string;
};

export function Player({ videoId, isHost, onReady, onEvent, className }: Props) {
  const ytRef = useRef<YouTubePlayer | null>(null);
  const handleRef = useRef<PlayerHandle | null>(null);
  const lastStateRef = useRef<number>(-1);

  // Imperative load when videoId changes — avoid full unmount/remount.
  useEffect(() => {
    const player = ytRef.current;
    if (!player || !videoId) return;
    try {
      // cueVideoById prepares without autoplay; host can press play.
      player.cueVideoById?.(videoId);
    } catch {
      /* player may not be ready yet; YouTube handles this */
    }
  }, [videoId]);

  if (!videoId) {
    return (
      <div className={`aspect-video bg-[color:var(--bg-raised)] border border-[color:var(--line)] flex items-center justify-center ${className ?? ''}`}>
        <div className="text-center px-6">
          <p className="eyebrow">Standing by</p>
          <p className="mt-3 font-display text-[clamp(1.25rem,3vw,1.75rem)] text-[color:var(--ink-soft)]">
            {isHost ? 'Pick a video to start the broadcast.' : 'Waiting for host to pick a video…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`aspect-video bg-black border border-[color:var(--line)] ${className ?? ''}`}>
      <YouTube
        videoId={videoId}
        opts={isHost ? HOST_OPTS : VIEWER_OPTS}
        className="w-full h-full"
        iframeClassName="w-full h-full"
        onReady={(e: YouTubeEvent) => {
          ytRef.current = e.target;
          const handle: PlayerHandle = {
            play: () => e.target.playVideo(),
            pause: () => e.target.pauseVideo(),
            seekTo: (sec, allow = true) => e.target.seekTo(sec, allow),
            getCurrentTime: () => e.target.getCurrentTime?.() ?? 0,
            getPlayerState: () => e.target.getPlayerState?.() ?? -1,
            loadVideo: (id: string, startSec = 0) => e.target.loadVideoById(id, startSec),
          };
          handleRef.current = handle;
          onReady?.(handle);
        }}
        onStateChange={(e: YouTubeEvent<number>) => {
          if (!isHost || !onEvent) return;
          const state = e.data;
          // 1 = playing, 2 = paused, 3 = buffering
          const t = e.target.getCurrentTime?.() ?? 0;
          if (state === 1 && lastStateRef.current !== 1) {
            onEvent('play', t);
          } else if (state === 2 && lastStateRef.current !== 2) {
            onEvent('pause', t);
          }
          lastStateRef.current = state;
        }}
      />
    </div>
  );
}
