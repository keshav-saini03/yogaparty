import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
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
