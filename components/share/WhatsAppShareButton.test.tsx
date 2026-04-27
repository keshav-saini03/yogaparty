import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WhatsAppShareButton } from './WhatsAppShareButton';

describe('WhatsAppShareButton', () => {
  it('renders an anchor with wa.me href and encoded text', () => {
    render(<WhatsAppShareButton text="hi → there" label="Invite" />);
    const link = screen.getByTestId('wa-share-link') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.href)).toContain('hi → there');
  });

  it('opens in a new tab with safe rel', () => {
    render(<WhatsAppShareButton text="x" />);
    const link = screen.getByTestId('wa-share-link') as HTMLAnchorElement;
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });

  it('renders the provided label', () => {
    render(<WhatsAppShareButton text="x" label="Invite Friends" />);
    expect(screen.getByText('Invite Friends')).toBeInTheDocument();
  });

  it('uses the default label when none provided', () => {
    render(<WhatsAppShareButton text="x" />);
    expect(screen.getByText('Invite on WhatsApp')).toBeInTheDocument();
  });

  it('fires onShare callback when clicked', () => {
    const onShare = vi.fn();
    render(<WhatsAppShareButton text="x" onShare={onShare} />);
    fireEvent.click(screen.getByTestId('wa-share-link'));
    expect(onShare).toHaveBeenCalledOnce();
  });

  it('does not allow injection of HTML via the text prop', () => {
    render(<WhatsAppShareButton text='<script>alert(1)</script>' />);
    const link = screen.getByTestId('wa-share-link') as HTMLAnchorElement;
    // The text gets URL-encoded in the href, never inserted as innerHTML.
    expect(link.href).toContain(encodeURIComponent('<script>'));
    expect(link.querySelector('script')).toBeNull();
  });
});
