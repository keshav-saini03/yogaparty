import Link from 'next/link';
import { WhatsAppShareButton } from '@/components/share/WhatsAppShareButton';
import { CopyLinkButton } from '@/components/share/CopyLinkButton';
import { SignOutButton } from '@/components/share/SignOutButton';
import { buildRoomShareUrl, inRoomInviteCopy } from '@/lib/whatsapp';

type Props = {
  city: string | null;
  participantCount: number;
  selfId: string;
  /** Room UUID — used to build the shareable room URL. */
  roomId?: string;
  onChatToggle?: () => void;
  isMobileChatOpen?: boolean;
  /** Mobile-only unread message count. 0 hides the badge. */
  unreadChat?: number;
};

export function RoomHeader({
  city,
  participantCount,
  selfId,
  roomId,
  onChatToggle,
  isMobileChatOpen,
  unreadChat = 0,
}: Props) {
  const cityLabel = city && city !== 'GLOBAL' ? city : 'around the world';
  const countLabel = participantCount === 1 ? '1 person' : `${participantCount} people`;

  const inviteText = inRoomInviteCopy({
    cityCount: participantCount,
    cityName: city,
    refId: selfId,
    roomId,
  });
  const shareUrl = buildRoomShareUrl(roomId, selfId);

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
        <span className="text-[color:var(--ink-faint)] hidden sm:inline">|</span>
        <Link
          href="/rooms"
          className="hidden sm:inline font-mono text-[0.65rem] sm:text-[0.7rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--accent)] transition-colors"
        >
          Browse
        </Link>

        <div className="ml-auto flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="font-mono text-[0.62rem] sm:text-[0.7rem] tracking-[0.18em] uppercase text-[color:var(--ink-soft)]">
            <span className="text-[color:var(--accent)]">{countLabel}</span>{' '}
            from <span className="text-[color:var(--ink)]">{cityLabel}</span>
          </span>

          <WhatsAppShareButton
            text={inviteText}
            label="Invite friends"
            variant="pill"
          />

          {roomId && <CopyLinkButton url={shareUrl} label="Copy link" />}

          {onChatToggle && (
            <button
              type="button"
              onClick={onChatToggle}
              className="md:hidden relative font-mono text-[0.62rem] tracking-[0.2em] uppercase text-[color:var(--ink)] border border-[color:var(--line)] px-2 py-1 hover:border-[color:var(--accent)]"
              aria-expanded={isMobileChatOpen ? 'true' : 'false'}
              aria-label={
                isMobileChatOpen
                  ? 'Close chat'
                  : unreadChat > 0
                    ? `Open chat, ${unreadChat} unread message${unreadChat === 1 ? '' : 's'}`
                    : 'Open chat'
              }
            >
              {isMobileChatOpen ? 'Close' : 'Chat'}
              {!isMobileChatOpen && unreadChat > 0 && (
                <span
                  data-testid="chat-unread-badge"
                  className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-1 inline-flex items-center justify-center bg-[color:var(--accent)] text-[color:var(--bg)] font-mono text-[0.55rem] tracking-[0.06em] tabular-nums"
                  aria-hidden="true"
                >
                  {unreadChat > 9 ? '9+' : unreadChat}
                </span>
              )}
            </button>
          )}

          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
