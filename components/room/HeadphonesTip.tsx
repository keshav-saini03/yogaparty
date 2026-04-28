'use client';

import { useEffect } from 'react';
import { HEADPHONES_TIP_DURATION_MS, HEADPHONES_TIP_KEY } from '@/lib/webrtc-config';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HeadphonesTip({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    try {
      window.localStorage.setItem(HEADPHONES_TIP_KEY, '1');
    } catch {
      /* private browsing */
    }
    const id = window.setTimeout(onClose, HEADPHONES_TIP_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div role="status" className="tip-banner">
      <span aria-hidden className="flex-none mt-0.5 text-[color:var(--accent)]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="square"
        >
          <path d="M2.5 9.5a5.5 5.5 0 0 1 11 0" />
          <rect x="1.8" y="9.5" width="2.4" height="3.5" />
          <rect x="11.8" y="9.5" width="2.4" height="3.5" />
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="font-mono text-[0.55rem] tracking-[0.24em] uppercase text-[color:var(--accent)] mb-1"
          aria-hidden
        >
          System · Audio
        </p>
        <p className="text-[0.78rem] sm:text-[0.82rem] leading-relaxed text-[color:var(--ink)]">
          Echo cancellation is off so the music stays clean.{' '}
          <strong className="font-semibold text-[color:var(--ink)]">
            Headphones recommended
          </strong>{' '}
          <span className="text-[color:var(--ink-soft)]">
            so others don&apos;t hear the session bleed through your mic.
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss tip"
        className="flex-none font-mono text-[0.6rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] border border-[color:var(--line)] hover:border-[color:var(--ink-mute)] px-2 py-1 transition-colors"
      >
        OK
      </button>
    </div>
  );
}
