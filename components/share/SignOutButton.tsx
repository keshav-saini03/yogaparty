import { logout } from '@/app/actions/logout';

type Props = {
  /** Compact "Sign out" link, default. */
  variant?: 'link' | 'pill';
  /** Optional label override. */
  label?: string;
  className?: string;
};

/**
 * Inline server-action form. No client JS, no extra route — submitting clears
 * the yp_session cookie and bounces to /. Renders as a transparent text link
 * by default so it tucks into existing header rows without restyling them.
 */
export function SignOutButton({
  variant = 'link',
  label = 'Sign out',
  className = '',
}: Props) {
  if (variant === 'pill') {
    return (
      <form action={logout} className={className}>
        <button
          type="submit"
          className="font-mono text-[0.62rem] sm:text-[0.65rem] tracking-[0.22em] uppercase border border-[color:var(--line)] hover:border-[color:#ff7878] hover:text-[#ff7878] text-[color:var(--ink-mute)] px-2.5 py-1 transition-colors"
        >
          {label}
        </button>
      </form>
    );
  }

  return (
    <form action={logout} className={className}>
      <button
        type="submit"
        className="font-mono text-[0.65rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)] hover:text-[#ff7878] transition-colors"
      >
        {label}
      </button>
    </form>
  );
}
