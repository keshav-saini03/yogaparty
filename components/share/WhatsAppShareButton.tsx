'use client';

import { buildShareUrl } from '@/lib/whatsapp';

type Props = {
  text: string;
  label?: string;
  variant?: 'cta' | 'pill' | 'inline';
  className?: string;
  onShare?: () => void;
};

const PILL_CLS =
  'inline-flex items-center gap-2 font-mono text-[0.65rem] sm:text-[0.7rem] tracking-[0.22em] uppercase text-[#0a0a0c] bg-[#19d27a] hover:bg-[#1cef8a] transition-colors px-3 py-2';

const INLINE_CLS =
  'inline-flex items-center gap-2 font-mono text-[0.62rem] tracking-[0.2em] uppercase text-[#19d27a] border border-[#19d27a] hover:bg-[rgba(25,210,122,0.12)] transition-colors px-2 py-1';

const CTA_CLS =
  'cta cta-share';

export function WhatsAppShareButton({
  text,
  label = 'Invite on WhatsApp',
  variant = 'pill',
  className,
  onShare,
}: Props) {
  const href = buildShareUrl(text);
  const cls =
    variant === 'cta' ? CTA_CLS : variant === 'inline' ? INLINE_CLS : PILL_CLS;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onShare?.()}
      data-testid="wa-share-link"
      className={`${cls} ${className ?? ''}`.trim()}
    >
      <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.5 0 .14 5.36.14 11.93c0 2.1.55 4.16 1.6 5.97L0 24l6.27-1.64a11.93 11.93 0 0 0 5.79 1.47h.01c6.56 0 11.92-5.36 11.92-11.93 0-3.18-1.24-6.18-3.47-8.42ZM12.07 21.8h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.72.98 1-3.62-.24-.37a9.85 9.85 0 0 1-1.51-5.27c0-5.45 4.43-9.88 9.87-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.43 9.86-9.88 9.86Zm5.42-7.39c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.66.15-.2.3-.76.96-.93 1.16-.17.2-.34.22-.64.07-.3-.15-1.26-.46-2.4-1.49a9.06 9.06 0 0 1-1.67-2.08c-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.3.3-.49.1-.2.05-.37-.02-.52-.07-.15-.66-1.59-.9-2.18-.24-.58-.49-.5-.66-.51l-.56-.01c-.2 0-.51.07-.78.37-.27.3-1.02 1-1.02 2.43 0 1.43 1.04 2.81 1.19 3 .15.2 2.05 3.13 4.97 4.39.69.3 1.24.48 1.66.62.7.22 1.34.19 1.84.12.56-.08 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34Z" />
      </svg>
      <span>{label}</span>
    </a>
  );
}
