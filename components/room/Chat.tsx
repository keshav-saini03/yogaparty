'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from '@/lib/room-types';
import { ChatMessage } from './ChatMessage';

type Props = {
  messages: ChatMsg[];
  onSend: (text: string) => void;
  selfId: string;
  // mobile-only props
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
};

export function Chat({
  messages,
  onSend,
  selfId,
  isMobileOpen = false,
  onMobileClose,
}: Props) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <>
      {/* Desktop sidebar — visible at md+ */}
      <aside className="hidden md:flex md:w-[320px] md:flex-col md:border-l md:border-[color:var(--line)] md:bg-[color:var(--bg-raised)]">
        <ChatBody
          messages={messages}
          selfId={selfId}
          listRef={listRef}
          draft={draft}
          setDraft={setDraft}
          onSubmit={handleSubmit}
        />
      </aside>

      {/* Mobile bottom sheet */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ${
          isMobileOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: '70vh' }}
        aria-hidden={!isMobileOpen}
      >
        <div className="h-full flex flex-col bg-[color:var(--bg-raised)] border-t border-[color:var(--line)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
            <span className="eyebrow">Chat</span>
            <button
              onClick={onMobileClose}
              className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]"
              aria-label="Close chat"
            >
              Close ✕
            </button>
          </div>
          <ChatBody
            messages={messages}
            selfId={selfId}
            listRef={listRef}
            draft={draft}
            setDraft={setDraft}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </>
  );
}

function ChatBody({
  messages,
  selfId,
  listRef,
  draft,
  setDraft,
  onSubmit,
}: {
  messages: ChatMsg[];
  selfId: string;
  listRef: React.RefObject<HTMLDivElement | null>;
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <div
        ref={listRef}
        data-testid="chat-list"
        className="flex-1 overflow-y-auto p-4 space-y-2"
      >
        {messages.length === 0 ? (
          <p className="font-mono text-[0.7rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
            Say hi to your room.
          </p>
        ) : (
          messages.map((m, i) => (
            <ChatMessage
              key={`${m.user_id}-${m.timestamp}-${i}`}
              msg={m}
              self={m.user_id === selfId}
            />
          ))
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t border-[color:var(--line)] p-3 flex gap-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={300}
          placeholder="Type a message…"
          className="field flex-1"
          aria-label="Chat message"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="cta px-4"
          style={{ height: '3rem' }}
        >
          Send
        </button>
      </form>
    </>
  );
}
