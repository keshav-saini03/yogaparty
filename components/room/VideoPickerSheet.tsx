'use client';

import { useEffect } from 'react';
import { CURATED_VIDEOS } from '@/lib/videos';

type Props = {
  open: boolean;
  currentVideoId: string | null;
  onClose: () => void;
  onPick: (videoId: string) => void;
};

export function VideoPickerSheet({ open, currentVideoId, onClose, onPick }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pick a video"
    >
      <div
        className="w-full sm:max-w-2xl max-h-[85vh] bg-[color:var(--bg-raised)] border-t sm:border border-[color:var(--line)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--line)] px-5 py-4">
          <span className="eyebrow">Pick a session</span>
          <button
            onClick={onClose}
            className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]"
          >
            Close ✕
          </button>
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-[color:var(--line)]">
          {CURATED_VIDEOS.map((v) => {
            const isCurrent = v.id === currentVideoId;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => onPick(v.id)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-[color:var(--bg)] transition-colors"
                >
                  {v.thumbnail && (
                    <span className="block flex-shrink-0 w-24 sm:w-32 aspect-video bg-black border border-[color:var(--line)] overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={v.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[color:var(--ink)] font-display text-base sm:text-lg leading-tight truncate">
                      {v.title}
                    </span>
                    <span className="mt-1 block font-mono text-[0.65rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
                      {Math.round(v.durationSec / 60)} min
                      {isCurrent && (
                        <span className="ml-3 text-[color:var(--accent)]">· now playing</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
