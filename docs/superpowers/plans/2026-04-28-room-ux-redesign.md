# Room UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the room's vertically-stacked CallDock with a theatre+ribbon layout where the YouTube video is always the hero and every peer is visible alongside it; add a one-tap `+ Join call` tile in the ribbon, plus five adjacent UX wins (speaker indicator on presence list, pre-join cam/mic preview, mobile chat unread badge, host's change-video as player overlay, welcome banner → corner toast).

**Architecture:** All changes are presentational. No new realtime events. The two foundational extensions are: (a) a small `useAudioDuck.speakingPeerIds: string[]` addition so the speaker name and presence-row outline can react to RMS changes, and (b) a `useCall.adoptStream(stream, …)` method that lets `PreJoinPreview` hand off an already-acquired stream without re-prompting `getUserMedia`. Everything else slots into existing component boundaries.

**Tech Stack:** Next.js 15 App Router · TypeScript · Tailwind v4 · Vitest + Testing Library · existing custom CSS variables (`--ink`, `--accent`, `--live`, `--line`, `--bg-raised`).

---

## File structure

**New files:**
- `lib/room-format.ts` — pure formatter (`formatRoomEyebrow`)
- `lib/room-format.test.ts`
- `components/room/PreJoinPreview.tsx` — local cam/mic preview card with mic level meter
- `components/room/PreJoinPreview.test.tsx`
- `components/room/WelcomeShareToast.tsx` — corner toast extracted from `RoomClient`
- `components/room/WelcomeShareToast.test.tsx`
- `components/room/PresenceList.test.tsx` — new (none exists today)

**Modified files:**
- `components/room/CallDock.tsx` — ribbon layout + integrated `+ Join` tile + eyebrow header
- `components/room/CallDock.test.tsx` — extend
- `components/room/PresenceList.tsx` — `speakingPeerIds` prop
- `components/room/Player.tsx` — `hostControl` slot
- `components/room/Player.test.tsx` — extend
- `components/room/RoomHeader.tsx` — `unreadChat` prop + badge
- `components/room/Chat.tsx` — emit `onOpened` when chat opens (so RoomClient can reset unread)
- `app/room/[id]/RoomClient.tsx` — wire all of the above; remove the mid-page change-video row; replace welcome banner JSX with `<WelcomeShareToast />`
- `hooks/useCall.ts` — `adoptStream` method
- `hooks/useCall.test.ts` — extend
- `hooks/useAudioDuck.ts` — `speakingPeerIds` reactive return
- `hooks/useAudioDuck.test.ts` — extend

**Deleted files:**
- `components/room/StartTalkingButton.tsx`
- `components/room/StartTalkingButton.test.tsx`

---

## Task 1: `formatRoomEyebrow` helper

Pure formatter for the eyebrow header line. Lives in a new file because it is presentational, not transport-related — keeping it out of `lib/sync-utils.ts` avoids polluting that module.

**Files:**
- Create: `lib/room-format.ts`
- Test: `lib/room-format.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/room-format.test.ts
import { describe, it, expect } from 'vitest';
import { formatRoomEyebrow } from './room-format';

describe('formatRoomEyebrow', () => {
  it('idle (nobody on call) lists who is listening', () => {
    expect(
      formatRoomEyebrow({ listening: 4, onCall: 0, speakerName: null, ducked: false })
    ).toBe('04 listening · nobody on call yet');
  });

  it('on-call with active speaker and ducked audio', () => {
    expect(
      formatRoomEyebrow({ listening: 4, onCall: 3, speakerName: 'Riya', ducked: true })
    ).toBe('Riya is talking · audio ducked');
  });

  it('on-call with speaker, audio not ducked yet', () => {
    expect(
      formatRoomEyebrow({ listening: 4, onCall: 3, speakerName: 'Riya', ducked: false })
    ).toBe('Riya is talking');
  });

  it('on-call with no current speaker', () => {
    expect(
      formatRoomEyebrow({ listening: 4, onCall: 3, speakerName: null, ducked: false })
    ).toBe('03 on call · audio synced');
  });

  it('pads single-digit counts to two digits', () => {
    expect(
      formatRoomEyebrow({ listening: 1, onCall: 0, speakerName: null, ducked: false })
    ).toBe('01 listening · nobody on call yet');
  });

  it('does not pad three-digit counts', () => {
    expect(
      formatRoomEyebrow({ listening: 102, onCall: 0, speakerName: null, ducked: false })
    ).toBe('102 listening · nobody on call yet');
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npx vitest run lib/room-format.test.ts`
Expected: all 6 tests fail with "Failed to resolve import './room-format'"

- [ ] **Step 3: Implement**

```ts
// lib/room-format.ts
type EyebrowInput = {
  listening: number;
  onCall: number;
  speakerName: string | null;
  ducked: boolean;
};

/**
 * Formats the room status line shown above the peer ribbon.
 *
 *   idle:               "04 listening · nobody on call yet"
 *   on-call (silent):   "03 on call · audio synced"
 *   on-call (talking):  "Riya is talking" (+ " · audio ducked" when ducked)
 *
 * Counts pad to two digits for tally aesthetics; three-plus stay unpadded.
 */
export function formatRoomEyebrow(input: EyebrowInput): string {
  const { listening, onCall, speakerName, ducked } = input;
  if (onCall === 0) {
    return `${pad(listening)} listening · nobody on call yet`;
  }
  if (speakerName) {
    return `${speakerName} is talking${ducked ? ' · audio ducked' : ''}`;
  }
  return `${pad(onCall)} on call · audio synced`;
}

function pad(n: number): string {
  return n < 100 ? n.toString().padStart(2, '0') : n.toString();
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run lib/room-format.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add lib/room-format.ts lib/room-format.test.ts
git commit -m "feat(room): add formatRoomEyebrow helper for ribbon header line"
```

---

## Task 2: Welcome share banner → corner toast

Extracts the welcome banner from `RoomClient.tsx` into its own component, repositions to a fixed bottom-left toast, adds an 8s auto-dismiss timer.

**Files:**
- Create: `components/room/WelcomeShareToast.tsx`
- Create: `components/room/WelcomeShareToast.test.tsx`
- Modify: `app/room/[id]/RoomClient.tsx` (replace welcome JSX block + remove `welcomeOpen` from main column)

- [ ] **Step 1: Write failing tests**

```tsx
// components/room/WelcomeShareToast.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomeShareToast } from './WelcomeShareToast';

describe('WelcomeShareToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <WelcomeShareToast open={false} shareText="hi" onDismiss={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders toast content when open', () => {
    render(<WelcomeShareToast open shareText="hi" onDismiss={() => {}} />);
    expect(screen.getByText(/you'?re tuned in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
  });

  it('auto-dismisses after 8 seconds', () => {
    const onDismiss = vi.fn();
    render(<WelcomeShareToast open shareText="hi" onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(7999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismiss button calls onDismiss', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WelcomeShareToast open shareText="hi" onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: /later/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npx vitest run components/room/WelcomeShareToast.test.tsx`
Expected: 4 tests fail (component does not exist).

- [ ] **Step 3: Implement component**

```tsx
// components/room/WelcomeShareToast.tsx
'use client';

import { useEffect } from 'react';
import { WhatsAppShareButton } from '@/components/share/WhatsAppShareButton';

const AUTO_DISMISS_MS = 8_000;

type Props = {
  open: boolean;
  shareText: string;
  onDismiss: () => void;
};

export function WelcomeShareToast({ open, shareText, onDismiss }: Props) {
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rise fixed bottom-4 left-4 z-30 max-w-[20rem] border border-[#19d27a] bg-[rgba(25,210,122,0.10)] backdrop-blur-[2px] p-3 sm:p-4 shadow-2xl"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <p className="font-mono text-[0.58rem] tracking-[0.22em] uppercase text-[#19d27a]">
        You&apos;re tuned in
      </p>
      <p className="mt-1.5 font-display text-sm leading-snug text-[color:var(--ink)]">
        Drop the link in your group — it&apos;s better with people.
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <WhatsAppShareButton
          text={shareText}
          label="Share now"
          variant="pill"
          onShare={onDismiss}
        />
        <button
          type="button"
          onClick={onDismiss}
          className="font-mono text-[0.58rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] px-2 py-1"
        >
          Later
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify component tests pass**

Run: `npx vitest run components/room/WelcomeShareToast.test.tsx`
Expected: 4 passed

- [ ] **Step 5: Wire into RoomClient**

In `app/room/[id]/RoomClient.tsx`:

(a) Add import near other component imports:
```tsx
import { WelcomeShareToast } from '@/components/room/WelcomeShareToast';
```

(b) Delete the entire JSX block that renders the welcome banner — currently the conditional starting with `{welcomeOpen && (` and the corresponding green-bordered `<div>` inside the main column. Replace with nothing in the main column.

(c) Just before the closing `</div>` of the outermost wrapper (the `min-h-screen flex flex-col` div), add:
```tsx
<WelcomeShareToast
  open={welcomeOpen}
  shareText={welcomeShareText}
  onDismiss={dismissWelcome}
/>
```

- [ ] **Step 6: Run full suite to confirm no regression**

Run: `npx vitest run`
Expected: all suites pass; total count rises by 4.

- [ ] **Step 7: Commit**

```bash
git add components/room/WelcomeShareToast.tsx components/room/WelcomeShareToast.test.tsx app/room/\[id\]/RoomClient.tsx
git commit -m "feat(room): demote welcome share banner to corner toast with auto-dismiss"
```

---

## Task 3: Player overlay slot for host's change-video

Add an optional `hostControl` ReactNode slot to `<Player>`. Render at top-right inside the player container, between the click-shield (z-10) and the volume bar (z-20). Move the host's "Change video" button into this slot; remove the row-below-the-player change-video button from `RoomClient`.

**Files:**
- Modify: `components/room/Player.tsx`
- Modify: `components/room/Player.test.tsx`
- Modify: `app/room/[id]/RoomClient.tsx`

- [ ] **Step 1: Write failing test**

Append to `components/room/Player.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Player } from './Player';

describe('Player hostControl slot', () => {
  it('renders hostControl when isHost is true', () => {
    render(
      <Player
        videoId="abc"
        isHost
        hostControl={<button data-testid="host-cta">Change video</button>}
      />
    );
    expect(screen.getByTestId('host-cta')).toBeInTheDocument();
  });

  it('does not render hostControl when isHost is false', () => {
    render(
      <Player
        videoId="abc"
        isHost={false}
        hostControl={<button data-testid="host-cta">Change video</button>}
      />
    );
    expect(screen.queryByTestId('host-cta')).toBeNull();
  });

  it('does not render slot wrapper when hostControl is undefined', () => {
    const { container } = render(<Player videoId="abc" isHost />);
    // Sanity: at most the YouTube iframe + volume bar — no extra wrappers added.
    expect(container.querySelector('[data-host-slot="true"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run components/room/Player.test.tsx`
Expected: 3 new tests fail (`hostControl` prop unrecognized / DOM mismatch).

- [ ] **Step 3: Add `hostControl` prop to Player**

In `components/room/Player.tsx`, extend the `Props` type:

```tsx
type Props = {
  videoId: string | null;
  isHost: boolean;
  enforceState?: number | null;
  onReady?: (handle: PlayerHandle) => void;
  onEvent?: (name: PlayerEventName, currentTime: number) => void;
  className?: string;
  duckedVolume?: number;
  onVolumeChange?: (volume: number) => void;
  /**
   * Host-only overlay control rendered at the player's top-right corner.
   * Sits between the click-shield (z-10) and the volume bar (z-20). Ignored
   * when `isHost` is false. Use it for host-only chrome like "Change video".
   */
  hostControl?: React.ReactNode;
};
```

Add `hostControl` to the destructured props in the function signature. Then, inside the player's outer `<div>` JSX (the one with class `relative aspect-video bg-black ...`), insert this block right after the `<YouTube />` element and BEFORE the click-shield:

```tsx
{isHost && hostControl && (
  <div
    data-host-slot="true"
    className="absolute top-2 right-2 z-[15] pointer-events-auto"
  >
    {hostControl}
  </div>
)}
```

- [ ] **Step 4: Verify Player tests pass**

Run: `npx vitest run components/room/Player.test.tsx`
Expected: all tests pass.

- [ ] **Step 5: Wire RoomClient to use the slot**

In `app/room/[id]/RoomClient.tsx`:

(a) Find the `<Player ...>` JSX. Add a `hostControl` prop:

```tsx
<Player
  videoId={videoId}
  isHost={isHost}
  enforceState={enforceState}
  onReady={(h) => {
    playerRef.current = h;
  }}
  onEvent={onPlayerEvent}
  duckedVolume={audioDuck.duckedVolume}
  onVolumeChange={setUserVolume}
  hostControl={
    <button
      type="button"
      onClick={() => setPickerOpen(true)}
      className="font-mono text-[0.58rem] tracking-[0.22em] uppercase border border-[color:var(--accent)] text-[color:var(--accent)] bg-black/70 backdrop-blur-[2px] px-2.5 py-1.5 hover:bg-[color:var(--accent-soft)] transition-colors"
    >
      Change video
    </button>
  }
/>
```

(b) Delete the entire `<div className="flex flex-wrap items-center justify-between gap-3">` block that previously held the "Now broadcasting" copy + change-video button. Replace it with a slimmer non-interactive copy block (the broadcasting label still has informational value):

```tsx
<div className="min-w-0">
  {videoId ? (
    <>
      <p className="eyebrow">Now broadcasting</p>
      <p className="mt-1 font-display text-lg sm:text-xl text-[color:var(--ink)] truncate">
        {currentVideoMeta ? (
          currentVideoMeta.title
        ) : (
          <>
            Custom broadcast
            <span className="ml-2 font-mono text-[0.65rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
              {videoId}
            </span>
          </>
        )}
      </p>
    </>
  ) : (
    <>
      <p className="eyebrow">Broadcast queued</p>
      <p className="mt-1 font-display text-lg sm:text-xl text-[color:var(--ink-soft)]">
        Waiting for host pick.
      </p>
    </>
  )}
</div>
```

- [ ] **Step 6: Run full suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add components/room/Player.tsx components/room/Player.test.tsx app/room/\[id\]/RoomClient.tsx
git commit -m "feat(room): host change-video moves into player overlay slot"
```

---

## Task 4: Mobile chat unread badge

Track an `unreadChat` counter in `RoomClient` that increments on every `chat` broadcast while `chatOpen === false`. Reset to 0 when chat opens. Render a small numeric badge inside the mobile-only chat toggle button.

**Files:**
- Modify: `components/room/RoomHeader.tsx`
- Modify: `app/room/[id]/RoomClient.tsx`
- Create or extend: `components/room/RoomHeader.test.tsx` (create if absent)

- [ ] **Step 1: Confirm RoomHeader test file**

Run: `ls components/room/RoomHeader.test.tsx 2>&1`
If the file is missing, create the file with this content (test fails initially):

```tsx
// components/room/RoomHeader.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomHeader } from './RoomHeader';

describe('RoomHeader unread badge', () => {
  it('renders no badge when unreadChat is 0', () => {
    render(
      <RoomHeader
        city="Mumbai"
        participantCount={3}
        selfId="u1"
        onChatToggle={() => {}}
        unreadChat={0}
      />
    );
    expect(screen.queryByTestId('chat-unread-badge')).toBeNull();
  });

  it('renders badge with count when unreadChat > 0', () => {
    render(
      <RoomHeader
        city="Mumbai"
        participantCount={3}
        selfId="u1"
        onChatToggle={() => {}}
        unreadChat={4}
      />
    );
    const badge = screen.getByTestId('chat-unread-badge');
    expect(badge).toHaveTextContent('4');
  });

  it('caps badge display at 9+', () => {
    render(
      <RoomHeader
        city="Mumbai"
        participantCount={3}
        selfId="u1"
        onChatToggle={() => {}}
        unreadChat={42}
      />
    );
    expect(screen.getByTestId('chat-unread-badge')).toHaveTextContent('9+');
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run components/room/RoomHeader.test.tsx`
Expected: 3 tests fail (prop `unreadChat` not on type).

- [ ] **Step 3: Add `unreadChat` to RoomHeader**

In `components/room/RoomHeader.tsx`:

(a) Extend `Props`:
```tsx
type Props = {
  city: string | null;
  participantCount: number;
  selfId: string;
  onChatToggle?: () => void;
  isMobileChatOpen?: boolean;
  /** Mobile-only unread message count. 0 hides the badge. */
  unreadChat?: number;
};
```

(b) Destructure with default: `unreadChat = 0`.

(c) Replace the existing chat toggle `<button>` JSX with:

```tsx
{onChatToggle && (
  <button
    type="button"
    onClick={onChatToggle}
    className="md:hidden relative font-mono text-[0.62rem] tracking-[0.2em] uppercase text-[color:var(--ink)] border border-[color:var(--line)] px-2 py-1 hover:border-[color:var(--accent)]"
    aria-expanded={isMobileChatOpen ? 'true' : 'false'}
    aria-label={isMobileChatOpen ? 'Close chat' : 'Open chat'}
  >
    {isMobileChatOpen ? 'Close' : 'Chat'}
    {!isMobileChatOpen && unreadChat > 0 && (
      <span
        data-testid="chat-unread-badge"
        className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-1 inline-flex items-center justify-center bg-[color:var(--accent)] text-[#0a0a0c] font-mono text-[0.55rem] tracking-[0.06em] tabular-nums"
        aria-label={`${unreadChat} unread messages`}
      >
        {unreadChat > 9 ? '9+' : unreadChat}
      </span>
    )}
  </button>
)}
```

- [ ] **Step 4: Verify RoomHeader tests pass**

Run: `npx vitest run components/room/RoomHeader.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 5: Track unread state in RoomClient**

In `app/room/[id]/RoomClient.tsx`:

(a) Add a state declaration alongside the other `useState` calls:
```tsx
const [unreadChat, setUnreadChat] = useState(0);
```

(b) Find the `chat` broadcast handler (`ch.on('broadcast', { event: 'chat' }, ...)`). Replace it with:

```tsx
ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
  setMessages((prev) => [...prev, payload as ChatMsg]);
  setUnreadChat((n) => n + 1);
});
```

(c) Find the `RoomHeader` JSX. Pass `unreadChat` and a wrapped `onChatToggle` that resets the counter when opening:

```tsx
<RoomHeader
  city={roomCity}
  participantCount={participants.length}
  selfId={self.user_id}
  onChatToggle={() => {
    setChatOpen((v) => {
      const next = !v;
      if (next) setUnreadChat(0);
      return next;
    });
  }}
  isMobileChatOpen={chatOpen}
  unreadChat={unreadChat}
/>
```

(d) Also reset the counter when the mobile sheet's own close button is hit. Find the `<Chat ... onMobileClose={...} />` prop and update:

```tsx
<Chat
  messages={messages}
  onSend={onChatSend}
  selfId={self.user_id}
  isMobileOpen={chatOpen}
  onMobileClose={() => setChatOpen(false)}
/>
```

(`onMobileClose` only ever closes, so no reset needed there.)

(e) On desktop the chat sidebar is always visible, so chat broadcast increments would create a stale badge. Add a mount-time effect that resets the counter on viewport-width changes when at md+:

```tsx
useEffect(() => {
  const mq = window.matchMedia('(min-width: 768px)');
  const reset = () => mq.matches && setUnreadChat(0);
  reset();
  mq.addEventListener('change', reset);
  return () => mq.removeEventListener('change', reset);
}, []);
```

- [ ] **Step 6: Run full suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add components/room/RoomHeader.tsx components/room/RoomHeader.test.tsx app/room/\[id\]/RoomClient.tsx
git commit -m "feat(room): unread chat badge on mobile chat toggle"
```

---

## Task 5: Reactive `speakingPeerIds` from `useAudioDuck`

Today `audioDuck.isSpeaking(peerId)` reads a non-reactive ref — it only refreshes when the surrounding component re-renders. We need a reactive list so that the speaker name (Task 9) and the presence-list outline (Task 6) update on RMS changes. Extend the existing 30 Hz polling loop to set a smoothed `speakingPeerIds` state when the *set* of speakers changes (not on every tick).

**Files:**
- Modify: `hooks/useAudioDuck.ts`
- Modify: `hooks/useAudioDuck.test.ts`

- [ ] **Step 1: Write failing test**

Append to `hooks/useAudioDuck.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioDuck } from './useAudioDuck';

describe('useAudioDuck speakingPeerIds', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useAudioDuck({ userVolume: 80 }));
    expect(result.current.speakingPeerIds).toEqual([]);
  });

  // Note: a full RMS-driven test would need to mock AudioContext/AnalyserNode,
  // which is heavyweight for Vitest. We rely on the empty/initial state assertion
  // and existing speakingRef-based tests; integration coverage comes from the
  // PresenceList speaker-glow component test in Task 6.
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run hooks/useAudioDuck.test.ts`
Expected: new test fails (`speakingPeerIds` undefined).

- [ ] **Step 3: Add reactive state**

In `hooks/useAudioDuck.ts`:

(a) Add at the top of the hook body, near the other state hooks:

```ts
const [speakingPeerIds, setSpeakingPeerIds] = useState<string[]>([]);
const speakingPeerIdsRef = useRef<string[]>([]);
```

(b) Inside the 30 Hz polling loop, after the existing per-peer `speakingRef.current.set(peerId, isSpeaking)` line and before the `wasAny` block, compute the new list and only commit if it changed:

```ts
// Snapshot the current set of speaking peer ids in stable order. Only
// fire setState when the set itself changes (not on every 33 ms tick).
const next: string[] = [];
for (const [peerId, sp] of speakingRef.current.entries()) {
  if (sp) next.push(peerId);
}
next.sort();
const prev = speakingPeerIdsRef.current;
if (next.length !== prev.length || next.some((id, i) => id !== prev[i])) {
  speakingPeerIdsRef.current = next;
  setSpeakingPeerIds(next);
}
```

(c) When `detachPeer` removes a speaker, also clear them from the list to avoid a stale entry between RMS ticks. After `speakingRef.current.delete(peerId);`:

```ts
const prev = speakingPeerIdsRef.current;
if (prev.includes(peerId)) {
  const next = prev.filter((id) => id !== peerId);
  speakingPeerIdsRef.current = next;
  setSpeakingPeerIds(next);
}
```

(d) Add `speakingPeerIds` to the hook's return:

```ts
return {
  duckedVolume,
  anyPeerSpeaking,
  speakingPeerIds,
  isSpeaking: (peerId: string) => speakingRef.current.get(peerId) ?? false,
  attachPeer,
  detachPeer,
};
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run hooks/useAudioDuck.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/useAudioDuck.ts hooks/useAudioDuck.test.ts
git commit -m "feat(audio-duck): expose reactive speakingPeerIds for downstream UI"
```

---

## Task 6: Speaker indicator on `PresenceList`

Add `speakingPeerIds: string[]` prop to `PresenceList`. Highlight matching rows with a yellow left-side rule and an animated dot.

**Files:**
- Modify: `components/room/PresenceList.tsx`
- Create: `components/room/PresenceList.test.tsx`
- Modify: `app/room/[id]/RoomClient.tsx` (pass derived prop)

- [ ] **Step 1: Write failing test**

```tsx
// components/room/PresenceList.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceList } from './PresenceList';
import type { Participant } from '@/lib/sync-utils';

const mk = (id: string, name: string): Participant => ({
  user_id: id,
  name,
  city: 'Mumbai',
  joined_at: 1,
});

describe('PresenceList speaker indicator', () => {
  it('renders no speaker outline when speakingPeerIds is empty', () => {
    const { container } = render(
      <PresenceList
        participants={[mk('a', 'Riya'), mk('b', 'Jaya')]}
        hostId={null}
        selfId="self"
        speakingPeerIds={[]}
      />
    );
    expect(container.querySelectorAll('[data-speaking="true"]').length).toBe(0);
  });

  it('marks matching rows as speaking', () => {
    const { container } = render(
      <PresenceList
        participants={[mk('a', 'Riya'), mk('b', 'Jaya')]}
        hostId={null}
        selfId="self"
        speakingPeerIds={['a']}
      />
    );
    const speakingRows = container.querySelectorAll('[data-speaking="true"]');
    expect(speakingRows.length).toBe(1);
    expect(speakingRows[0].textContent).toContain('Riya');
  });

  it('still works without the speakingPeerIds prop (back-compat default)', () => {
    expect(() =>
      render(
        <PresenceList
          participants={[mk('a', 'Riya')]}
          hostId={null}
          selfId="self"
        />
      )
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run components/room/PresenceList.test.tsx`
Expected: 3 tests fail.

- [ ] **Step 3: Implement**

Replace `components/room/PresenceList.tsx` with:

```tsx
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
              <span
                aria-hidden
                className="pulse-dot"
                style={{ background: 'var(--accent)' }}
              />
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
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run components/room/PresenceList.test.tsx`
Expected: 3 pass.

- [ ] **Step 5: Wire RoomClient**

In `app/room/[id]/RoomClient.tsx`, find the `<PresenceList ... />` JSX and pass the new prop sourced from the audio-duck hook:

```tsx
<PresenceList
  participants={participants}
  hostId={hostId}
  selfId={self.user_id}
  speakingPeerIds={audioDuck.speakingPeerIds}
/>
```

- [ ] **Step 6: Run full suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add components/room/PresenceList.tsx components/room/PresenceList.test.tsx app/room/\[id\]/RoomClient.tsx
git commit -m "feat(room): speaker indicator on presence list"
```

---

## Task 7: `useCall.adoptStream` — accept a pre-acquired MediaStream

Add a method that drives `useCall` into the on-call state using a stream the caller already obtained from `getUserMedia`. Mirrors the relevant body of `toggleMic`'s "first call" branch but skips the permission prompt. Existing `toggleMic` / `toggleCam` paths stay intact for any caller that doesn't go through the preview.

**Files:**
- Modify: `hooks/useCall.ts`
- Modify: `hooks/useCall.test.ts`

- [ ] **Step 1: Read the current shape**

```bash
sed -n '100,180p' hooks/useCall.ts
```

Familiarize yourself with the existing `toggleMic` first-call branch (the one that calls `getUserMedia` and applies the resulting tracks). `adoptStream` replicates that path minus the `getUserMedia` call.

- [ ] **Step 2: Write failing test**

Append to `hooks/useCall.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react';

describe('useCall.adoptStream', () => {
  it('transitions to on-call without calling getUserMedia', async () => {
    // Spy: we want to ensure adoptStream does NOT trigger getUserMedia.
    const gum = vi
      .spyOn(navigator.mediaDevices, 'getUserMedia')
      .mockImplementation(() => Promise.reject(new Error('should not be called')));

    const fakeAudio = { kind: 'audio', enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack;
    const fakeVideo = { kind: 'video', enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack;
    const fakeStream = {
      getAudioTracks: () => [fakeAudio],
      getVideoTracks: () => [fakeVideo],
      getTracks: () => [fakeAudio, fakeVideo],
    } as unknown as MediaStream;

    const onStreamAcquired = vi.fn();
    const { result } = renderHook(() =>
      useCall({
        selfId: 'u1',
        channel: null,
        peersOnCall: () => [],
        onStreamAcquired,
      })
    );

    expect(result.current.state).toBe('idle');

    await act(async () => {
      await result.current.adoptStream(fakeStream, { mic: true, cam: false });
    });

    expect(result.current.state).toBe('on-call');
    expect(result.current.micEnabled).toBe(true);
    expect(result.current.camEnabled).toBe(false);
    expect(result.current.getStream()).toBe(fakeStream);
    expect(onStreamAcquired).toHaveBeenCalledWith(fakeStream);
    expect(gum).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Verify failure**

Run: `npx vitest run hooks/useCall.test.ts`
Expected: new test fails (method `adoptStream` undefined).

- [ ] **Step 4: Implement `adoptStream`**

In `hooks/useCall.ts`, after the existing `toggleCam` and before `leave`, add:

```ts
/**
 * Adopt an already-acquired MediaStream. Used by PreJoinPreview, which
 * holds the stream during the cam/mic confirmation step and hands it
 * over here without re-prompting the OS for permission. Mirrors the
 * acquireStream → toggleMic happy path minus getUserMedia.
 *
 * Track-enabled state rides on the flags the caller supplies — a user
 * who toggled cam off in the preview gets a disabled video track here.
 */
const adoptStream = useCallback(
  async (
    stream: MediaStream,
    flags: { mic: boolean; cam: boolean }
  ) => {
    if (state === 'leaving') return;

    for (const t of stream.getAudioTracks()) t.enabled = flags.mic;
    for (const t of stream.getVideoTracks()) t.enabled = flags.cam;

    streamRef.current = stream;
    setMic(flags.mic);
    setCam(flags.cam);
    setPermissionError(null);

    // Same fire-and-forget side-effect acquireStream does — lets PCs that
    // were built from an inbound offer before permission resolved attach
    // these tracks via replaceTrack.
    void argsRef.current.onStreamAcquired?.(stream);

    // Drive into the mesh via the same path toggleMic uses. enterMesh
    // owns the state transition (`setState('on-call')`) AND the presence
    // update (`updatePresence(true)`), so we don't duplicate either.
    await enterMesh();
  },
  [state, enterMesh]
);
```

Add `adoptStream` to the hook's return object:

```ts
return {
  state,
  micEnabled,
  camEnabled,
  permissionError,
  toggleMic,
  toggleCam,
  leave,
  getStream: () => streamRef.current,
  adoptStream,
};
```

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run hooks/useCall.test.ts`
Expected: existing useCall tests still pass + new one passes.

- [ ] **Step 6: Commit**

```bash
git add hooks/useCall.ts hooks/useCall.test.ts
git commit -m "feat(call): useCall.adoptStream lets pre-join preview hand off mediastream"
```

---

## Task 8: `PreJoinPreview` component

A small inline card that owns its own `getUserMedia` lifecycle, shows the user their cam feed + a 5-bar mic level meter, lets them toggle mic/cam before committing, and on confirm hands the stream to the parent via callback. On cancel it stops every track.

**Files:**
- Create: `components/room/PreJoinPreview.tsx`
- Create: `components/room/PreJoinPreview.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// components/room/PreJoinPreview.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreJoinPreview } from './PreJoinPreview';

function makeFakeStream() {
  const audio = { kind: 'audio', enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack;
  const video = { kind: 'video', enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack;
  const stream = {
    getAudioTracks: () => [audio],
    getVideoTracks: () => [video],
    getTracks: () => [audio, video],
  } as unknown as MediaStream;
  return { stream, audio, video };
}

describe('PreJoinPreview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests camera+mic on mount and shows confirm/cancel', async () => {
    const fake = makeFakeStream();
    const gum = vi
      .spyOn(navigator.mediaDevices, 'getUserMedia')
      .mockResolvedValue(fake.stream);

    render(<PreJoinPreview onConfirm={() => {}} onCancel={() => {}} />);

    await waitFor(() =>
      expect(gum).toHaveBeenCalledWith(expect.objectContaining({ audio: true, video: true }))
    );
    expect(screen.getByRole('button', { name: /go live/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('confirms with the live stream and current toggle flags', async () => {
    const fake = makeFakeStream();
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(fake.stream);

    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<PreJoinPreview onConfirm={onConfirm} onCancel={() => {}} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /go live/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /go live/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(fake.stream, { mic: true, cam: true });
  });

  it('cancel stops every track and calls onCancel', async () => {
    const fake = makeFakeStream();
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(fake.stream);

    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<PreJoinPreview onConfirm={() => {}} onCancel={onCancel} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(fake.audio.stop).toHaveBeenCalledTimes(1);
    expect(fake.video.stop).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows error and try-again button on permission denied', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const gum = vi
      .spyOn(navigator.mediaDevices, 'getUserMedia')
      .mockRejectedValue(denied);

    render(<PreJoinPreview onConfirm={() => {}} onCancel={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/camera or microphone access/i)).toBeInTheDocument()
    );
    const retry = screen.getByRole('button', { name: /try again/i });
    expect(retry).toBeInTheDocument();
    expect(gum).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run components/room/PreJoinPreview.test.tsx`
Expected: 4 tests fail (component does not exist).

- [ ] **Step 3: Implement component**

```tsx
// components/room/PreJoinPreview.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const REQUEST_TIMEOUT_MS = 10_000;

type Props = {
  onConfirm: (stream: MediaStream, flags: { mic: boolean; cam: boolean }) => void;
  onCancel: () => void;
};

type Status = 'requesting' | 'ready' | 'error';

export function PreJoinPreview({ onConfirm, onCancel }: Props) {
  const [status, setStatus] = useState<Status>('requesting');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      analyserRef.current?.disconnect();
    } catch {
      /* already detached */
    }
    analyserRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  const acquire = useCallback(async () => {
    setStatus('requesting');
    setErrorText(null);

    let timeoutId: number | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error('Camera didn’t respond — try again.')),
        REQUEST_TIMEOUT_MS
      );
    });

    try {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
        timeout,
      ]);
      if (timeoutId !== null) window.clearTimeout(timeoutId);

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Mic level meter — feed an AnalyserNode and animate.
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      ctxRef.current = ctx;
      analyserRef.current = analyser;

      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(1, rms * 6));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setStatus('ready');
    } catch (err) {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      const e = err as Error;
      const msg =
        e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError'
          ? 'Camera or microphone access was blocked. Update your browser permissions and try again.'
          : e.message || 'Camera unavailable. Try again.';
      setErrorText(msg);
      setStatus('error');
    }
  }, []);

  // Initial request on mount; cleanup on unmount stops every track.
  useEffect(() => {
    void acquire();
    return () => stopStream();
  }, [acquire, stopStream]);

  // Keep track-enabled state in sync with the toggles.
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = mic));
  }, [mic]);
  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = cam));
  }, [cam]);

  const handleConfirm = () => {
    if (!streamRef.current) return;
    // Hand ownership to the parent — do NOT stop tracks in the unmount
    // cleanup path. We null out streamRef so stopStream becomes a no-op.
    const stream = streamRef.current;
    streamRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      analyserRef.current?.disconnect();
    } catch {
      /* already detached */
    }
    analyserRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    onConfirm(stream, { mic, cam });
  };

  const handleCancel = () => {
    stopStream();
    onCancel();
  };

  const bars = 5;
  const litBars = Math.round(level * bars);

  return (
    <div
      role="region"
      aria-label="Camera and microphone preview"
      className="border border-[color:var(--accent)] bg-[color:var(--bg-raised)] p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:col-span-4"
    >
      <div className="aspect-[4/3] w-full sm:w-[12rem] bg-black border border-[color:var(--line)] relative overflow-hidden flex-none">
        {status === 'ready' && cam ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[color:var(--ink-mute)] font-mono text-[0.6rem] tracking-[0.2em] uppercase text-center px-2">
            {status === 'requesting' && 'Requesting camera…'}
            {status === 'ready' && !cam && 'Camera off'}
            {status === 'error' && 'No preview'}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between gap-3">
        <div>
          <p className="font-mono text-[0.58rem] tracking-[0.22em] uppercase text-[color:var(--accent)]">
            Pre-join check
          </p>
          {status === 'error' ? (
            <p className="mt-1.5 text-sm text-[color:#ff7878] leading-snug">
              {errorText}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-[color:var(--ink-soft)] leading-snug">
              Confirm camera + mic, then go live.
            </p>
          )}

          {status === 'ready' && (
            <div
              aria-label={`Mic level ${Math.round(level * 100)}%`}
              className="mt-3 flex items-center gap-1.5"
            >
              {Array.from({ length: bars }).map((_, i) => (
                <span
                  key={i}
                  className={`h-3 w-2 ${
                    i < litBars
                      ? 'bg-[color:var(--accent)]'
                      : 'bg-[color:var(--ink-faint)]'
                  }`}
                />
              ))}
              <span className="ml-2 font-mono text-[0.55rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
                Mic
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === 'ready' && (
            <>
              <button
                type="button"
                onClick={() => setMic((v) => !v)}
                className={`font-mono text-[0.58rem] tracking-[0.22em] uppercase border px-2.5 py-1.5 ${
                  mic
                    ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
                    : 'border-[color:var(--ink-mute)] text-[color:var(--ink-mute)]'
                }`}
              >
                {mic ? 'Mic on' : 'Mic off'}
              </button>
              <button
                type="button"
                onClick={() => setCam((v) => !v)}
                className={`font-mono text-[0.58rem] tracking-[0.22em] uppercase border px-2.5 py-1.5 ${
                  cam
                    ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
                    : 'border-[color:var(--ink-mute)] text-[color:var(--ink-mute)]'
                }`}
              >
                {cam ? 'Cam on' : 'Cam off'}
              </button>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="font-mono text-[0.58rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] border border-[color:var(--line)] px-3 py-1.5 hover:text-[color:var(--ink)]"
            >
              Cancel
            </button>
            {status === 'error' ? (
              <button
                type="button"
                onClick={() => void acquire()}
                className="font-mono text-[0.58rem] tracking-[0.22em] uppercase text-[#0a0a0c] bg-[color:var(--accent)] px-3 py-1.5"
              >
                Try again
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={status !== 'ready'}
                className="font-mono text-[0.58rem] tracking-[0.22em] uppercase text-[#0a0a0c] bg-[color:var(--accent)] px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Go live →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run components/room/PreJoinPreview.test.tsx`
Expected: 4 pass.

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add components/room/PreJoinPreview.tsx components/room/PreJoinPreview.test.tsx
git commit -m "feat(room): pre-join camera+mic preview component"
```

---

## Task 9: Theatre + ribbon CallDock with integrated `+ Join` tile and eyebrow header

The big visual change. The CallDock becomes a single ribbon row that always shows 7 seats (5 mobile / 6 sm / 7 md+). When idle, seat 0 is the `+ Join call` CTA; clicking it expands the row inline into the `PreJoinPreview` from Task 8 (preview spans 4 seat-widths). When on call, seat 0 is the user's own `PeerTile`. Below the ribbon: the existing `CallControls`, only visible when `state === 'on-call'`. Above the ribbon: the eyebrow line from Task 1, fed by counts + speaker name from Task 5.

This task also deletes `StartTalkingButton.tsx` and its test, and removes the empty-state `<StartTalkingButton />` JSX from `RoomClient.tsx`.

**Files:**
- Modify: `components/room/CallDock.tsx`
- Modify: `components/room/CallDock.test.tsx`
- Modify: `app/room/[id]/RoomClient.tsx`
- Delete: `components/room/StartTalkingButton.tsx`, `components/room/StartTalkingButton.test.tsx`

- [ ] **Step 1: Update / extend CallDock test**

Read `components/room/CallDock.test.tsx` first to see the current shape. Replace its body with:

```tsx
// components/room/CallDock.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallDock, type TileVm } from './CallDock';

const baseProps = {
  micEnabled: false,
  camEnabled: false,
  permissionError: null,
  onToggleMic: () => {},
  onToggleCam: () => {},
  onLeave: () => {},
  onJoinClick: () => {},
  listeningCount: 4,
  onCallCount: 0,
  speakerName: null,
  ducked: false,
  preview: null,
};

const tile = (id: string, name: string): TileVm => ({
  peerId: id,
  name,
  city: 'Mumbai',
  micOn: true,
  camOn: false,
  isLocal: false,
  isSpeaking: false,
});

describe('CallDock ribbon', () => {
  it('idle: seat 0 is the + Join call CTA', () => {
    render(
      <CallDock
        {...baseProps}
        state="idle"
        selfTile={null}
        peerTiles={[tile('a', 'Riya'), tile('b', 'Jaya')]}
      />
    );
    expect(screen.getByRole('button', { name: /join call/i })).toBeInTheDocument();
    expect(screen.getByText(/Riya/)).toBeInTheDocument();
    expect(screen.getByText(/Jaya/)).toBeInTheDocument();
  });

  it('on-call: seat 0 is self tile, controls visible', () => {
    render(
      <CallDock
        {...baseProps}
        state="on-call"
        selfTile={{
          peerId: 'self',
          name: 'You',
          city: 'BLR',
          micOn: true,
          camOn: false,
          isLocal: true,
          isSpeaking: false,
        }}
        peerTiles={[tile('a', 'Riya')]}
        micEnabled
      />
    );
    expect(screen.queryByRole('button', { name: /join call/i })).toBeNull();
    expect(screen.getByRole('button', { name: /leave/i })).toBeInTheDocument();
  });

  it('idle: clicking + Join calls onJoinClick', async () => {
    const onJoinClick = vi.fn();
    const user = userEvent.setup();
    render(
      <CallDock
        {...baseProps}
        state="idle"
        selfTile={null}
        peerTiles={[]}
        onJoinClick={onJoinClick}
      />
    );
    await user.click(screen.getByRole('button', { name: /join call/i }));
    expect(onJoinClick).toHaveBeenCalledTimes(1);
  });

  it('renders the preview slot when preview prop is provided (idle)', () => {
    render(
      <CallDock
        {...baseProps}
        state="idle"
        selfTile={null}
        peerTiles={[]}
        preview={<div data-testid="preview-mounted" />}
      />
    );
    expect(screen.getByTestId('preview-mounted')).toBeInTheDocument();
    // While preview is mounted the +Join CTA is hidden.
    expect(screen.queryByRole('button', { name: /join call/i })).toBeNull();
  });

  it('eyebrow shows speaker name when on-call and someone is talking', () => {
    render(
      <CallDock
        {...baseProps}
        state="on-call"
        selfTile={{
          peerId: 'self',
          name: 'You',
          city: null,
          micOn: true,
          camOn: false,
          isLocal: true,
          isSpeaking: false,
        }}
        peerTiles={[tile('a', 'Riya')]}
        onCallCount={2}
        speakerName="Riya"
        ducked
      />
    );
    expect(screen.getByText(/Riya is talking · audio ducked/i)).toBeInTheDocument();
  });

  it('eyebrow shows listening count + no-call note when idle', () => {
    render(
      <CallDock
        {...baseProps}
        state="idle"
        selfTile={null}
        peerTiles={[tile('a', 'Riya')]}
        listeningCount={4}
      />
    );
    expect(screen.getByText(/04 listening · nobody on call yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run components/room/CallDock.test.tsx`
Expected: tests fail (props don't match new contract; CTA not rendered when idle).

- [ ] **Step 3: Rewrite CallDock**

Replace `components/room/CallDock.tsx` with:

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CallControls } from './CallControls';
import { HeadphonesTip } from './HeadphonesTip';
import { PeerTile } from './PeerTile';
import { HEADPHONES_TIP_KEY } from '@/lib/webrtc-config';
import { formatRoomEyebrow } from '@/lib/room-format';
import type { CallState } from '@/hooks/useCall';

export type TileVm = {
  peerId: string;
  name: string;
  city: string | null;
  micOn: boolean;
  camOn: boolean;
  isLocal: boolean;
  isSpeaking: boolean;
  stream?: MediaStream | null;
};

type Props = {
  state: CallState;
  selfTile: TileVm | null;
  peerTiles: TileVm[];
  micEnabled: boolean;
  camEnabled: boolean;
  permissionError: string | null;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
  /** Called when the + Join CTA tile is clicked while idle. */
  onJoinClick: () => void;
  /** Counts and speaker info for the eyebrow line. */
  listeningCount: number;
  onCallCount: number;
  speakerName: string | null;
  ducked: boolean;
  /**
   * If provided AND state === 'idle', the ribbon's first 4 seats are
   * replaced by this node (the PreJoinPreview). The + Join CTA is hidden
   * while the preview is mounted.
   */
  preview?: ReactNode;
};

const SEATS = 7;

export function CallDock({
  state,
  selfTile,
  peerTiles,
  micEnabled,
  camEnabled,
  permissionError,
  onToggleMic,
  onToggleCam,
  onLeave,
  onJoinClick,
  listeningCount,
  onCallCount,
  speakerName,
  ducked,
  preview,
}: Props) {
  const [tipOpen, setTipOpen] = useState(false);

  useEffect(() => {
    if (!micEnabled) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(HEADPHONES_TIP_KEY) === '1') return;
    setTipOpen(true);
  }, [micEnabled]);

  const eyebrow = formatRoomEyebrow({
    listening: listeningCount,
    onCall: onCallCount,
    speakerName,
    ducked,
  });

  const seats: ReactNode[] = [];
  const isIdle = state !== 'on-call';

  if (isIdle && preview) {
    // Preview occupies seats 0..3, then peer tiles fill remaining seats.
    seats.push(
      <div key="preview" className="col-span-full sm:col-span-4">
        {preview}
      </div>
    );
    for (let i = 4; i < SEATS && i - 4 < peerTiles.length; i++) {
      const t = peerTiles[i - 4];
      seats.push(<PeerTile key={t.peerId} {...t} />);
    }
    while (seats.length < SEATS - 3) seats.push(<EmptySeat key={`e${seats.length}`} />);
  } else if (isIdle) {
    seats.push(
      <button
        key="join"
        type="button"
        onClick={onJoinClick}
        aria-label="Join call"
        className="aspect-[4/3] border border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex flex-col items-center justify-center gap-1 hover:bg-[rgba(245,180,0,0.18)] transition-colors"
      >
        <span aria-hidden className="text-2xl leading-none">+</span>
        <span className="font-mono text-[0.55rem] tracking-[0.22em] uppercase">Join call</span>
      </button>
    );
    for (const t of peerTiles.slice(0, SEATS - 1)) {
      seats.push(<PeerTile key={t.peerId} {...t} />);
    }
    while (seats.length < SEATS) seats.push(<EmptySeat key={`e${seats.length}`} />);
  } else {
    if (selfTile) seats.push(<PeerTile key={selfTile.peerId} {...selfTile} />);
    for (const t of peerTiles.slice(0, SEATS - (selfTile ? 1 : 0))) {
      seats.push(<PeerTile key={t.peerId} {...t} />);
    }
    while (seats.length < SEATS) seats.push(<EmptySeat key={`e${seats.length}`} />);
  }

  return (
    <section
      aria-label="Call participants"
      className="dock-reveal mt-5 pt-4 border-t border-[color:var(--line)] space-y-3"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <p className="eyebrow flex items-center gap-2">
          <span className="pulse-dot" aria-hidden />
          {state === 'on-call' ? 'On call' : 'In the room'}
        </p>
        <span
          aria-live="polite"
          className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-[color:var(--ink-soft)]"
        >
          {eyebrow}
        </span>
        <span className="ml-auto font-mono tabular-nums text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)]">
          {onCallCount.toString().padStart(2, '0')} / {SEATS.toString().padStart(2, '0')}
        </span>
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-2 sm:gap-3">
        {seats}
      </div>

      {state === 'on-call' && (
        <CallControls
          state={state}
          micEnabled={micEnabled}
          camEnabled={camEnabled}
          permissionError={permissionError}
          onToggleMic={onToggleMic}
          onToggleCam={onToggleCam}
          onLeave={onLeave}
          onShowTip={() => setTipOpen(true)}
        />
      )}

      <HeadphonesTip open={tipOpen} onClose={() => setTipOpen(false)} />
    </section>
  );
}

function EmptySeat() {
  return (
    <div
      aria-hidden
      className="aspect-[4/3] border border-dashed border-[color:var(--ink-faint)] flex items-center justify-center text-[color:var(--ink-faint)] text-xs"
    >
      ·
    </div>
  );
}
```

- [ ] **Step 4: Verify CallDock tests pass**

Run: `npx vitest run components/room/CallDock.test.tsx`
Expected: all pass.

- [ ] **Step 5: Wire RoomClient**

In `app/room/[id]/RoomClient.tsx`:

(a) Add imports:
```tsx
import { PreJoinPreview } from '@/components/room/PreJoinPreview';
```

(b) Add state for the preview:
```tsx
const [previewOpen, setPreviewOpen] = useState(false);
```

(c) Compute `onCallCount` and `speakerName`. Place these near other useMemo derivations:

```tsx
const onCallCount = useMemo(
  () => participants.filter((p) => p.on_call_intent).length,
  [participants]
);

const speakerName = useMemo(() => {
  const ids = audioDuck.speakingPeerIds;
  if (ids.length === 0) return null;
  // Pick the first speaker (sorted ascending by user_id) and resolve
  // to their display name. If they leave between RMS sample and render,
  // fall through to null silently.
  const id = ids[0];
  return participants.find((p) => p.user_id === id)?.name ?? null;
}, [audioDuck.speakingPeerIds, participants]);
```

(d) Replace the existing `<CallDock ... />` JSX with:

```tsx
<CallDock
  state={call.state}
  selfTile={selfTile}
  peerTiles={peerTiles}
  micEnabled={call.micEnabled}
  camEnabled={call.camEnabled}
  permissionError={call.permissionError}
  onToggleMic={() => void call.toggleMic()}
  onToggleCam={() => void call.toggleCam()}
  onLeave={() => void call.leave()}
  onJoinClick={() => setPreviewOpen(true)}
  listeningCount={participants.length}
  onCallCount={onCallCount}
  speakerName={speakerName}
  ducked={audioDuck.duckedVolume < userVolume}
  preview={
    previewOpen ? (
      <PreJoinPreview
        onCancel={() => setPreviewOpen(false)}
        onConfirm={async (stream, flags) => {
          setPreviewOpen(false);
          await call.adoptStream(stream, flags);
        }}
      />
    ) : null
  }
/>
```

(e) Delete the entire `{dockEmpty && (...)}` block that previously rendered `<StartTalkingButton />`. Also delete the `dockEmpty` variable declaration (no longer needed). Also remove the import of `StartTalkingButton`.

- [ ] **Step 6: Delete StartTalkingButton**

```bash
rm components/room/StartTalkingButton.tsx components/room/StartTalkingButton.test.tsx
```

- [ ] **Step 7: Run full suite**

Run: `npx vitest run`
Expected: all pass; total test count adjusted (remove StartTalkingButton tests, add new ones).

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in any of the files this plan touched. (Pre-existing errors in `pick-video.test.ts`, `usePeerConnections.test.ts`, `rooms.test.ts` are out of scope and acceptable.)

- [ ] **Step 9: Manual smoke**

```bash
npm run dev
```

Then in two browser tabs (different `selfId` cookies — use one private window):

1. Open the same room in both tabs.
2. Confirm the ribbon is visible with `+ Join` tile + dashed empty seats.
3. Click `+ Join` in tab 1: preview spans the first 4 seats, shows your camera, mic-level meter animates.
4. Click `Go live →`. Preview collapses; your tile takes seat 0; controls (Mic / Cam / Leave) appear.
5. In tab 2 the ribbon updates — your tile appears in their ribbon.
6. Speak in tab 1; tab 2's eyebrow line reads `<your name> is talking · audio ducked` (after the duck-in ramp).
7. Tab 2's presence list shows a yellow border-left + pulse dot on your row.
8. Host: confirm the change-video button appears as an overlay at the player's top-right.
9. Mobile (resize to 375 px): chat sheet closed, send a message from the other tab, verify the chat toggle in the header gets a numeric badge. Open chat — badge clears.
10. New session in a private window: confirm the welcome share appears as a corner toast, not a full-row banner; auto-dismisses after ~8 s.

- [ ] **Step 10: Commit**

```bash
git add components/room/CallDock.tsx components/room/CallDock.test.tsx app/room/\[id\]/RoomClient.tsx
git rm components/room/StartTalkingButton.tsx components/room/StartTalkingButton.test.tsx
git commit -m "feat(room): theatre+ribbon CallDock with integrated +Join CTA and pre-join preview"
```

---

## Final verification

- [ ] Run the full suite once more

```bash
npx vitest run
```

Expected: all suites pass; net test delta is positive (we removed `StartTalkingButton.test.tsx` and added `room-format`, `WelcomeShareToast`, `RoomHeader`, `PresenceList`, `useCall.adoptStream`, `useAudioDuck speakingPeerIds`, `PreJoinPreview`, plus extended `CallDock.test.tsx` and `Player.test.tsx`).

- [ ] Type-check

```bash
npx tsc --noEmit
```

Expected: no new errors in files this plan touched.

- [ ] Push

```bash
git push origin main
```
