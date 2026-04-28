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
