'use client';

type Props = { onClick: () => void };

export function StartTalkingButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 font-mono text-[0.62rem] sm:text-[0.65rem] tracking-[0.22em] uppercase border border-[color:var(--line)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] text-[color:var(--ink-mute)] bg-black/40 backdrop-blur-[2px] px-3 py-1.5"
    >
      🎤 Start talking →
    </button>
  );
}
