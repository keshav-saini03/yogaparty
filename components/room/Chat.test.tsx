import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Chat } from './Chat';
import type { ChatMsg } from '@/lib/room-types';

const mk = (text: string, user_id: string, ts: number, user = user_id): ChatMsg => ({
  type: 'chat',
  user_id,
  user,
  text,
  timestamp: ts,
});

describe('Chat', () => {
  it('renders messages in chronological order received', () => {
    const messages: ChatMsg[] = [
      mk('first', 'a', 1000, 'Anu'),
      mk('second', 'b', 2000, 'Bo'),
      mk('third', 'a', 3000, 'Anu'),
    ];
    render(
      <Chat messages={messages} onSend={() => {}} selfId="a" />
    );
    const list = screen.getAllByTestId('chat-list');
    const desktopList = list[0];
    const text = desktopList.textContent ?? '';
    expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'));
    expect(text.indexOf('second')).toBeLessThan(text.indexOf('third'));
  });

  it('shows empty-state copy when no messages', () => {
    render(<Chat messages={[]} onSend={() => {}} selfId="a" />);
    // both desktop + mobile render so the copy will appear twice.
    expect(screen.getAllByText(/Say hi to your room/).length).toBeGreaterThan(0);
  });

  it('disables submit button when draft is empty or whitespace only', () => {
    render(<Chat messages={[]} onSend={() => {}} selfId="a" />);
    const inputs = screen.getAllByLabelText('Chat message') as HTMLInputElement[];
    const input = inputs[0];
    const button = input.closest('form')!.querySelector('button[type="submit"]') as HTMLButtonElement;

    // Initial: empty draft → disabled
    expect(button.disabled).toBe(true);

    // Whitespace-only → still disabled
    fireEvent.change(input, { target: { value: '   ' } });
    expect(button.disabled).toBe(true);

    // Real text → enabled
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(button.disabled).toBe(false);
  });

  it('marks self messages distinctly', () => {
    const messages = [mk('hi from me', 'self', 1000, 'Me')];
    render(<Chat messages={messages} onSend={() => {}} selfId="self" />);
    expect(screen.getAllByText(/^You/).length).toBeGreaterThan(0);
  });
});
