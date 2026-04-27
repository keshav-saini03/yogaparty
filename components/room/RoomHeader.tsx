import Link from 'next/link';

type Props = {
  city: string | null;
  participantCount: number;
  onChatToggle?: () => void;
  isMobileChatOpen?: boolean;
};

export function RoomHeader({
  city,
  participantCount,
  onChatToggle,
  isMobileChatOpen,
}: Props) {
  const cityLabel = city && city !== 'GLOBAL' ? city : 'around the world';
  const countLabel = participantCount === 1 ? '1 person' : `${participantCount} people`;

  return (
    <header className="border-b border-[color:var(--line)] bg-[color:var(--bg)]">
      <div className="mx-auto max-w-6xl w-full px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 flex-wrap">
        <span className="pulse-dot" aria-hidden />
        <span className="font-mono text-[0.65rem] sm:text-[0.7rem] tracking-[0.22em] uppercase text-[color:var(--live)]">
          On Air
        </span>
        <span className="text-[color:var(--ink-faint)]">|</span>
        <Link
          href="/"
          className="font-mono text-[0.65rem] sm:text-[0.72rem] tracking-[0.18em] uppercase text-[color:var(--ink)] hover:text-[color:var(--accent)] transition-colors"
        >
          ← Watch · Party
        </Link>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <span className="font-mono text-[0.62rem] sm:text-[0.7rem] tracking-[0.18em] uppercase text-[color:var(--ink-soft)]">
            <span className="text-[color:var(--accent)]">{countLabel}</span>{' '}
            from <span className="text-[color:var(--ink)]">{cityLabel}</span>
          </span>

          {/* Phase 4 share slot — reserved layout, not wired to wa.me yet */}
          <span
            data-share-slot
            aria-hidden
            className="hidden sm:inline-block w-px h-6 bg-[color:var(--line)]"
          />

          {onChatToggle && (
            <button
              type="button"
              onClick={onChatToggle}
              className="md:hidden font-mono text-[0.62rem] tracking-[0.2em] uppercase text-[color:var(--ink)] border border-[color:var(--line)] px-2 py-1 hover:border-[color:var(--accent)]"
              aria-expanded={isMobileChatOpen ? 'true' : 'false'}
              aria-label={isMobileChatOpen ? 'Close chat' : 'Open chat'}
            >
              {isMobileChatOpen ? 'Close' : 'Chat'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
