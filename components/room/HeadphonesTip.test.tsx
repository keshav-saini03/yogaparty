import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeadphonesTip } from './HeadphonesTip';
import { HEADPHONES_TIP_KEY } from '@/lib/webrtc-config';

describe('HeadphonesTip', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the tip and persists the seen flag when shown', () => {
    render(<HeadphonesTip open onClose={() => {}} />);
    expect(screen.getByText(/headphones recommended/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(HEADPHONES_TIP_KEY)).toBe('1');
  });

  it('renders nothing when open=false', () => {
    const { container } = render(<HeadphonesTip open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
