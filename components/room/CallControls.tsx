'use client';

import type { CallState } from '@/hooks/useCall';

type Props = {
  state: CallState;
  micEnabled: boolean;
  camEnabled: boolean;
  permissionError: string | null;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
  onShowTip: () => void;
};

export function CallControls({
  state,
  micEnabled,
  camEnabled,
  permissionError,
  onToggleMic,
  onToggleCam,
  onLeave,
  onShowTip,
}: Props) {
  const onCall = state === 'on-call';

  if (state === 'permission-denied') {
    return (
      <p className="font-mono text-[0.65rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
        Re-enable in browser settings to use mic &amp; camera.
        {permissionError && (
          <span className="ml-2 text-[color:var(--ink-soft)]">({permissionError})</span>
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      {onCall && (
        <span className="inline-flex items-center gap-2 font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--accent)] border border-[color:var(--accent)] px-2 py-1">
          <span className="pulse-dot" aria-hidden /> ON CALL
        </span>
      )}
      <button
        type="button"
        onClick={onToggleMic}
        aria-pressed={micEnabled ? 'true' : 'false'}
        aria-label={micEnabled ? 'Mute mic' : 'Enable mic'}
        className={`font-mono text-[0.62rem] tracking-[0.22em] uppercase border px-2.5 py-1 transition-colors ${
          micEnabled
            ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
            : 'border-[color:var(--line)] text-[color:var(--ink-mute)]'
        }`}
      >
        🎤 mic
      </button>
      <button
        type="button"
        onClick={onToggleCam}
        aria-pressed={camEnabled ? 'true' : 'false'}
        aria-label={camEnabled ? 'Turn camera off' : 'Turn camera on'}
        className={`font-mono text-[0.62rem] tracking-[0.22em] uppercase border px-2.5 py-1 transition-colors ${
          camEnabled
            ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
            : 'border-[color:var(--line)] text-[color:var(--ink-mute)]'
        }`}
      >
        📷 cam
      </button>
      <button
        type="button"
        onClick={onShowTip}
        aria-label="Headphones tip"
        className="font-mono text-[0.62rem] tracking-[0.22em] uppercase border border-[color:var(--line)] text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] px-2 py-1"
      >
        ⓘ headphones
      </button>
      {onCall && (
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave call"
          className="font-mono text-[0.62rem] tracking-[0.22em] uppercase border border-[color:var(--line)] hover:border-[#ff7878] hover:text-[#ff7878] text-[color:var(--ink-mute)] px-2 py-1"
        >
          leave
        </button>
      )}
    </div>
  );
}
