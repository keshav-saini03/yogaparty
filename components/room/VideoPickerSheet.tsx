'use client';

import { useEffect, useState } from 'react';
import { CURATED_VIDEOS, parseYouTubeId } from '@/lib/videos';

type Props = {
  open: boolean;
  currentVideoId: string | null;
  onClose: () => void;
  onPick: (videoId: string) => void;
};

export function VideoPickerSheet({ open, currentVideoId, onClose, onPick }: Props) {
  const [urlDraft, setUrlDraft] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrlDraft('');
    setUrlError(null);
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

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseYouTubeId(urlDraft);
    if (!id) {
      setUrlError("That doesn't look like a YouTube link or id.");
      return;
    }
    setUrlError(null);
    onPick(id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pick a video"
    >
      <div
        className="w-full sm:max-w-2xl max-h-[90vh] bg-[color:var(--bg-raised)] border-t sm:border border-[color:var(--line)] overflow-hidden flex flex-col"
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

        {/* Paste URL — primary path */}
        <form
          onSubmit={handleUrlSubmit}
          className="border-b border-[color:var(--line)] px-5 py-5 space-y-3"
        >
          <label
            htmlFor="yt-url"
            className="block font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)]"
          >
            Paste any YouTube link
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="yt-url"
              name="yt-url"
              type="text"
              autoFocus
              value={urlDraft}
              onChange={(e) => {
                setUrlDraft(e.target.value);
                if (urlError) setUrlError(null);
              }}
              placeholder="https://youtube.com/watch?v=…"
              className="field flex-1 field-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="cta sm:flex-shrink-0">
              Use this
              <span className="arrow" aria-hidden />
            </button>
          </div>
          {urlError && (
            <p
              role="alert"
              className="font-mono text-[0.7rem] tracking-[0.04em] text-[color:#ff7878] border-l-2 border-[#ff7878] pl-3"
            >
              {urlError}
            </p>
          )}
          <p className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
            Works with youtu.be, youtube.com/watch, /shorts/, /embed/
          </p>
        </form>

        {/* Curated quick picks */}
        <div className="px-5 pt-4 pb-2 flex items-baseline justify-between">
          <span className="eyebrow">Quick picks</span>
          <span className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
            Habuild · curated
          </span>
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
