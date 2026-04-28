'use client';

import type { Participant } from '@/lib/sync-utils';
import { HostBadge } from './HostBadge';

type Props = {
  participants: Participant[];
  hostId: string | null;
  selfId: string;
  /** Peer ids whose mic RMS is currently above the speaking threshold. */
  speakingPeerIds?: string[];
};

export function PresenceList({
  participants,
  hostId,
  selfId,
  speakingPeerIds = [],
}: Props) {
  if (participants.length === 0) {
    return (
      <div className="font-mono text-[0.7rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
        Standing by…
      </div>
    );
  }

  const speakingSet = new Set(speakingPeerIds);

  return (
    <ul className="flex flex-col gap-2">
      {participants.map((p) => {
        const isHost = p.user_id === hostId;
        const isSelf = p.user_id === selfId;
        const isSpeaking = speakingSet.has(p.user_id);
        return (
          <li
            key={p.user_id}
            data-speaking={isSpeaking ? 'true' : 'false'}
            className={`flex items-center gap-2 text-[0.78rem] sm:text-[0.85rem] border-b pb-1.5 transition-colors ${
              isSpeaking
                ? 'border-[color:var(--accent)] pl-2 -ml-2 border-l-2'
                : 'border-[color:var(--ink-faint)]'
            }`}
          >
            {isSpeaking && (
              <span aria-hidden className="pulse-dot pulse-dot--accent" />
            )}
            <span
              className={`truncate ${
                isSelf ? 'text-[color:var(--accent)]' : 'text-[color:var(--ink)]'
              }`}
            >
              {p.name}
              {isSelf && (
                <span className="ml-1 text-[color:var(--ink-mute)] text-[0.65rem] tracking-[0.15em] uppercase font-mono">
                  · you
                </span>
              )}
            </span>
            <span className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)] truncate">
              {p.city ?? '—'}
            </span>
            {isHost && (
              <span className="ml-auto">
                <HostBadge />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
