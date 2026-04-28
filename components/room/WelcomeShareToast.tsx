'use client';

import { useEffect } from 'react';
import { WhatsAppShareButton } from '@/components/share/WhatsAppShareButton';

const AUTO_DISMISS_MS = 8_000;

type Props = {
  open: boolean;
  shareText: string;
  onDismiss: () => void;
};

export function WelcomeShareToast({ open, shareText, onDismiss }: Props) {
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rise fixed bottom-4 left-4 z-30 max-w-[20rem] border border-[#19d27a] bg-[rgba(25,210,122,0.10)] backdrop-blur-[2px] p-3 sm:p-4 shadow-2xl"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <p className="font-mono text-[0.58rem] tracking-[0.22em] uppercase text-[#19d27a]">
        You&apos;re tuned in
      </p>
      <p className="mt-1.5 font-display text-sm leading-snug text-[color:var(--ink)]">
        Drop the link in your group — it&apos;s better with people.
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <WhatsAppShareButton
          text={shareText}
          label="Share now"
          variant="pill"
          onShare={onDismiss}
        />
        <button
          type="button"
          onClick={onDismiss}
          className="font-mono text-[0.58rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] px-2 py-1"
        >
          Later
        </button>
      </div>
    </div>
  );
}
