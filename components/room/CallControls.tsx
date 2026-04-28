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
      <p className="font-mono text-[0.62rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)] border-l-2 border-[color:var(--ink-mute)] pl-3">
        Re-enable in browser settings to use mic &amp; camera.
        {permissionError && (
          <span className="block mt-1 text-[color:var(--ink-faint)] normal-case tracking-normal">
            ({permissionError})
          </span>
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      {onCall && (
        <span className="oncall-pill">
          <span className="pulse-dot" aria-hidden /> ON CALL
        </span>
      )}

      <button
        type="button"
        onClick={onToggleMic}
        aria-pressed={micEnabled ? 'true' : 'false'}
        aria-label={micEnabled ? 'Mute mic' : 'Enable mic'}
        className={`panel-btn${micEnabled ? ' panel-btn--accent' : ''}`}
      >
        <IconMic on={micEnabled} />
        <span>mic</span>
      </button>

      <button
        type="button"
        onClick={onToggleCam}
        aria-pressed={camEnabled ? 'true' : 'false'}
        aria-label={camEnabled ? 'Turn camera off' : 'Turn camera on'}
        className={`panel-btn${camEnabled ? ' panel-btn--accent' : ''}`}
      >
        <IconCam on={camEnabled} />
        <span>cam</span>
      </button>

      <button
        type="button"
        onClick={onShowTip}
        aria-label="Headphones tip"
        className="panel-btn"
      >
        <IconHeadphones />
        <span className="hidden sm:inline">headphones</span>
      </button>

      {onCall && (
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave call"
          className="panel-btn panel-btn--leave ml-auto sm:ml-0"
        >
          <IconLeave />
          <span>leave</span>
        </button>
      )}
    </div>
  );
}

/* ── Stroke icons — match the broadcast aesthetic ─────────────────── */

function IconMic({ on }: { on: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      aria-hidden
    >
      <rect x="6" y="2" width="4" height="7" rx="2" />
      <path d="M3.5 8c0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5" />
      <line x1="8" y1="12.5" x2="8" y2="14" />
      {!on && <line x1="2" y1="2" x2="14" y2="14" />}
    </svg>
  );
}

function IconCam({ on }: { on: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <rect x="2" y="4.5" width="10" height="7" />
      <path d="M12 7l3-1.4v4.8L12 9" />
      {!on && <line x1="2" y1="2" x2="14" y2="14" />}
    </svg>
  );
}

function IconHeadphones() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      aria-hidden
    >
      <path d="M2.5 9.5a5.5 5.5 0 0 1 11 0" />
      <rect x="1.8" y="9.5" width="2.4" height="3.5" />
      <rect x="11.8" y="9.5" width="2.4" height="3.5" />
    </svg>
  );
}

function IconLeave() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <path d="M9 3h4v10H9" />
      <line x1="2.5" y1="8" x2="9.5" y2="8" />
      <path d="M5 5l-2.5 3 2.5 3" />
    </svg>
  );
}
