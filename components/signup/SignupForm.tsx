'use client';

import { useActionState, useEffect, useState } from 'react';
import { createSignup } from '@/app/actions/signup';
import type { SignupState } from '@/lib/types';
import { CountryCodeSelect } from './CountryCodeSelect';

type Props = { detectedCity: string | null };

export function SignupForm({ detectedCity }: Props) {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    createSignup,
    undefined,
  );
  const [referrerId, setReferrerId] = useState('');

  useEffect(() => {
    setReferrerId(localStorage.getItem('yp_ref') ?? '');
  }, []);

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label
          htmlFor="signup-name"
          className="block font-mono text-[0.65rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] mb-2"
        >
          Name
        </label>
        <input
          id="signup-name"
          name="name"
          required
          placeholder="What should we call you?"
          autoComplete="name"
          className="field"
        />
      </div>

      <div>
        <label
          htmlFor="signup-phone"
          className="block font-mono text-[0.65rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)] mb-2"
        >
          Phone
        </label>
        <div className="flex gap-px bg-[color:var(--line)]">
          <CountryCodeSelect />
          <input
            id="signup-phone"
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

      <div className="border border-[color:var(--line)] p-4 bg-[color:var(--bg)]">
        <div className="font-mono text-[0.65rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)]">
          Joining from
        </div>
        <div className="mt-1 font-mono uppercase tracking-[0.12em] text-[color:var(--ink)]">
          {detectedCity ?? 'Your detected location'}
        </div>
      </div>

      <input type="hidden" name="referrer_id" value={referrerId} readOnly />

      <button type="submit" disabled={pending} className="cta w-full justify-center">
        {pending ? 'Joining…' : 'Tune in'}
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
    </form>
  );
}
