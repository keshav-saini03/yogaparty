'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginByPhone, type LoginState } from '@/app/actions/login';
import { CountryCodeSelect } from '@/components/signup/CountryCodeSelect';

const NEXT_PATH_RE = /^\/room\/[0-9a-f-]{36}$/i;

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginByPhone,
    undefined
  );

  const searchParams = useSearchParams();
  const nextRaw = searchParams.get('next');
  const nextPath = nextRaw && NEXT_PATH_RE.test(nextRaw) ? nextRaw : '';
  const signupHref = nextPath ? `/signup?next=${nextPath}` : '/signup';

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label
          htmlFor="login-phone"
          className="block font-mono text-[0.65rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] mb-2"
        >
          Phone you signed up with
        </label>
        <div className="flex gap-px bg-[color:var(--line)]">
          <CountryCodeSelect />
          <input
            id="login-phone"
            name="phone"
            required
            inputMode="numeric"
            pattern="\d*"
            placeholder="98765 43210"
            autoComplete="tel-national"
            className="field field-mono"
          />
        </div>
      </div>

      {nextPath && (
        <div className="border border-[color:var(--accent-soft)] bg-[color:var(--accent-soft)] p-3 font-mono text-[0.7rem] tracking-[0.16em] uppercase text-[color:var(--accent)]">
          Resuming → {nextPath}
        </div>
      )}

      <input type="hidden" name="next" value={nextPath} readOnly />

      <button type="submit" disabled={pending} className="cta w-full justify-center">
        {pending ? 'Tuning in…' : 'Tune back in'}
        <span className="arrow" aria-hidden />
      </button>

      {state?.error && (
        <p
          role="alert"
          className="font-mono text-[0.78rem] tracking-[0.04em] text-[color:#ff7878] border-l-2 border-[#ff7878] pl-3"
        >
          {state.error}
        </p>
      )}

      <p className="border-t border-[color:var(--line)] pt-5 font-mono text-[0.65rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
        New here?{' '}
        <Link
          href={signupHref}
          className="text-[color:var(--accent)] hover:underline"
        >
          Sign up in 3 fields →
        </Link>
      </p>
    </form>
  );
}
