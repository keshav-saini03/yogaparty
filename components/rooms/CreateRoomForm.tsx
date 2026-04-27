'use client';

import { useActionState } from 'react';
import { createRoomAction, type CreateRoomState } from '@/app/actions/create-room';

export function CreateRoomForm() {
  const [state, formAction, pending] = useActionState<CreateRoomState, FormData>(
    createRoomAction,
    undefined
  );

  return (
    <form action={formAction} className="space-y-3">
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

      <button type="submit" disabled={pending} className="cta">
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
