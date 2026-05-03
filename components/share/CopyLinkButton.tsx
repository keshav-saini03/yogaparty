'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  /** Absolute URL to copy. Caller is responsible for building it (room URL + ?ref=). */
  url: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
};

const PILL_CLS =
  'inline-flex items-center gap-2 font-mono text-[0.65rem] sm:text-[0.7rem] tracking-[0.22em] uppercase text-[color:var(--ink)] border border-[color:var(--line)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] transition-colors px-3 py-2';

export function CopyLinkButton({
  url,
  label = 'Copy link',
  copiedLabel = 'Copied!',
  className,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // execCommand fallback for older mobile browsers / non-secure contexts.
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Swallow — user can long-press the WhatsApp button or share text manually.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid="copy-link-button"
      aria-live="polite"
      className={`${PILL_CLS} ${className ?? ''}`.trim()}
    >
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
        <rect x="9" y="9" width="11" height="11" />
        <path d="M5 15V5h10" />
      </svg>
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
