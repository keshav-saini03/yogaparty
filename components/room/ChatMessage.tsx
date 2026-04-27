import type { ChatMsg } from '@/lib/room-types';

type Props = { msg: ChatMsg; self: boolean };

export function ChatMessage({ msg, self }: Props) {
  const time = new Date(msg.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`text-[0.85rem] leading-relaxed ${self ? 'text-right' : 'text-left'}`}
    >
      <div
        className={`inline-block max-w-full ${
          self
            ? 'bg-[color:var(--accent-soft)] text-[color:var(--ink)]'
            : 'bg-[color:var(--bg)] text-[color:var(--ink-soft)] border border-[color:var(--line)]'
        } px-3 py-1.5`}
      >
        <span
          className={`block font-mono text-[0.6rem] tracking-[0.18em] uppercase ${
            self ? 'text-[color:var(--accent)]' : 'text-[color:var(--ink-mute)]'
          }`}
        >
          {self ? 'You' : msg.user} · {time}
        </span>
        <span className="break-words">{msg.text}</span>
      </div>
    </div>
  );
}
