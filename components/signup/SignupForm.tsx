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
    <form action={formAction} className="space-y-3 max-w-sm w-full">
      <input
        name="name"
        required
        placeholder="Your name"
        autoComplete="name"
        className="block w-full h-11 rounded-md border border-gray-300 px-3"
      />
      <div className="flex gap-2">
        <CountryCodeSelect />
        <input
          name="phone"
          required
          inputMode="numeric"
          pattern="\d*"
          placeholder="Phone number"
          autoComplete="tel-national"
          className="block w-full h-11 rounded-md border border-gray-300 px-3"
        />
      </div>
      {detectedCity ? (
        <p className="text-sm text-gray-600">
          Joining from: <strong>{detectedCity}</strong>
        </p>
      ) : (
        <p className="text-sm text-gray-600">
          Joining from your detected location
        </p>
      )}
      <input type="hidden" name="referrer_id" value={referrerId} readOnly />
      <button
        type="submit"
        disabled={pending}
        className="w-full h-12 rounded-full bg-black text-white font-semibold disabled:opacity-60"
      >
        {pending ? 'Joining…' : 'Join the Watch Party'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
