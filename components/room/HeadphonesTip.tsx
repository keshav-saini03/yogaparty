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
    <div
      role="status"
      className="border border-[color:var(--accent)] bg-[color:var(--accent-soft)] p-3 sm:p-4 flex items-start gap-3 max-w-xl"
    >
      <span aria-hidden className="text-lg">🎧</span>
      <p className="font-mono text-[0.7rem] sm:text-[0.75rem] tracking-[0.04em] leading-relaxed text-[color:var(--ink)]">
        Heads-up: echo cancellation is off so the music stays clean.{' '}
        <strong>Headphones recommended</strong> so others don&apos;t hear the
        session bleed through your mic.
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss tip"
        className="ml-auto font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]"
      >
        OK
      </button>
    </div>
  );
}
