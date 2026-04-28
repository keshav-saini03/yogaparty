'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Extract the room id from anything the user might paste:
 *   `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
 *   `/room/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
 *   `https://yogaparty.app/room/aaaa…?utm=x`
 *   `room/aaaa…`
 * Returns the lowercased UUID or null.
 */
export function extractRoomId(input: string): string | null {
  if (!input) return null;
  const match = input.trim().match(UUID_RE);
  return match ? match[0].toLowerCase() : null;
}

export function JoinByCodeForm() {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractRoomId(draft);
    if (!id) {
      setError("That doesn't look like a room link or code.");
      return;
    }
    setSubmitting(true);
    router.push(`/room/${id}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label
        htmlFor="join-code"
        className="block font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)]"
      >
        Got a room link or code?
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="join-code"
          name="code"
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          placeholder="paste link or room id"
          className="field field-mono flex-1"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={submitting}
          className="cta sm:flex-shrink-0"
        >
          {submitting ? 'Tuning in…' : 'Join'}
          <span className="arrow" aria-hidden />
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="font-mono text-[0.7rem] tracking-[0.04em] text-[color:#ff7878] border-l-2 border-[#ff7878] pl-3"
        >
          {error}
        </p>
      )}
      <p className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
        Works with full URLs, /room/{'{id}'} paths, or just the id
      </p>
    </form>
  );
}
