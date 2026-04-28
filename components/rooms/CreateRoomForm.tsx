'use client';

import { useActionState, useState } from 'react';
import { createRoomAction, type CreateRoomState } from '@/app/actions/create-room';

type Visibility = 'public' | 'private';

export function CreateRoomForm() {
  const [state, formAction, pending] = useActionState<CreateRoomState, FormData>(
    createRoomAction,
    undefined
  );
  const [visibility, setVisibility] = useState<Visibility>('public');

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="room-title"
          className="block font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] mb-2"
        >
          Room title
        </label>
        <input
          id="room-title"
          name="title"
          required
          maxLength={80}
          placeholder="e.g. Morning flow with chai"
          autoComplete="off"
          className="field"
        />
      </div>

      <div>
        <p className="block font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] mb-2">
          Visibility
        </p>
        <input type="hidden" name="visibility" value={visibility} />
        <div className="grid grid-cols-2 gap-px bg-[color:var(--line)]">
          <button
            type="button"
            onClick={() => setVisibility('public')}
            aria-pressed={visibility === 'public'}
            className={`text-left p-3 transition-colors ${
              visibility === 'public'
                ? 'bg-[color:var(--accent-soft)] border border-[color:var(--accent)]'
                : 'bg-[color:var(--bg)] hover:bg-[color:var(--bg-raised)]'
            }`}
          >
            <span
              className={`block font-mono text-[0.65rem] tracking-[0.22em] uppercase ${
                visibility === 'public'
                  ? 'text-[color:var(--accent)]'
                  : 'text-[color:var(--ink)]'
              }`}
            >
              Public
            </span>
            <span className="mt-1 block text-[0.78rem] text-[color:var(--ink-mute)] leading-tight">
              Listed in the directory
            </span>
          </button>
          <button
            type="button"
            onClick={() => setVisibility('private')}
            aria-pressed={visibility === 'private'}
            className={`text-left p-3 transition-colors ${
              visibility === 'private'
                ? 'bg-[color:var(--accent-soft)] border border-[color:var(--accent)]'
                : 'bg-[color:var(--bg)] hover:bg-[color:var(--bg-raised)]'
            }`}
          >
            <span
              className={`block font-mono text-[0.65rem] tracking-[0.22em] uppercase ${
                visibility === 'private'
                  ? 'text-[color:var(--accent)]'
                  : 'text-[color:var(--ink)]'
              }`}
            >
              Private
            </span>
            <span className="mt-1 block text-[0.78rem] text-[color:var(--ink-mute)] leading-tight">
              Invite by link only
            </span>
          </button>
        </div>
      </div>

      <button type="submit" disabled={pending} className="cta w-full justify-center">
        {pending ? 'Opening room…' : 'Open room'}
        <span className="arrow" aria-hidden />
      </button>

      {state?.error && (
        <p
          role="alert"
          className="font-mono text-[0.7rem] tracking-[0.04em] text-[color:#ff7878] border-l-2 border-[#ff7878] pl-3"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
