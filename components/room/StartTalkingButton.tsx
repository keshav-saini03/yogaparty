'use client';

type Props = { onClick: () => void };

export function StartTalkingButton({ onClick }: Props) {
  return (
    <button type="button" onClick={onClick} className="start-talking">
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
        aria-hidden
        className="flex-none"
      >
        <rect x="6" y="2" width="4" height="7" rx="2" />
        <path d="M3.5 8c0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5" />
        <line x1="8" y1="12.5" x2="8" y2="14" />
      </svg>
      <span>Start talking</span>
      <span aria-hidden className="opacity-60">→</span>
    </button>
  );
}
