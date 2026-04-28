import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from '@/components/login/LoginForm';
import { redirectIfSignedIn } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Search = Promise<{ next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Search;
}) {
  const params = (await searchParams) ?? {};
  await redirectIfSignedIn(params.next);
  return (
    <main className="min-h-screen relative overflow-hidden">
      <header className="border-b border-[color:var(--line)]">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-4">
          <span className="pulse-dot" aria-hidden />
          <span className="font-mono text-[0.7rem] tracking-[0.22em] uppercase text-[color:var(--live)]">
            On Air
          </span>
          <span className="text-[color:var(--ink-faint)]">|</span>
          <Link
            href="/"
            className="font-mono text-[0.72rem] tracking-[0.18em] uppercase text-[color:var(--ink)] hover:text-[color:var(--accent)] transition-colors"
          >
            ← Watch · Party
          </Link>
          <span className="ml-auto font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)] hidden sm:inline">
            Sign in
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-16 items-start">
          <div className="rise" style={{ animationDelay: '120ms' }}>
            <p className="eyebrow">Welcome back</p>
            <h1 className="font-display mt-6 text-[clamp(2.5rem,7vw,5rem)] leading-[0.95] tracking-[-0.02em] font-light">
              Same phone.
              <span
                className="block italic"
                style={{ fontVariationSettings: '"SOFT" 100' }}
              >
                Same seat.
              </span>
            </h1>
            <p className="mt-8 max-w-md text-[color:var(--ink-soft)] leading-relaxed">
              No password to remember. Punch in the phone you signed up with and
              we&apos;ll drop you back in your city&apos;s room.
            </p>

            <ul className="mt-10 space-y-3 font-mono text-[0.78rem] tracking-[0.16em] uppercase text-[color:var(--ink-mute)]">
              <li className="flex items-center gap-3">
                <span className="text-[color:var(--accent)]">01</span>
                <span>Phone we already know</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-[color:var(--accent)]">02</span>
                <span>No OTP, no waiting</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-[color:var(--accent)]">03</span>
                <span>Right back in the room</span>
              </li>
            </ul>
          </div>

          <div
            className="rise relative bg-[color:var(--bg-raised)] border border-[color:var(--line)] p-8 sm:p-10"
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex items-baseline justify-between border-b border-[color:var(--line)] pb-4 mb-8">
              <span className="eyebrow">Form 002</span>
              <span className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
                Encrypted · Direct
              </span>
            </div>
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
