import Link from 'next/link';
import { Suspense } from 'react';
import { SignupForm } from '@/components/signup/SignupForm';
import { getDetectedCity } from '@/lib/geo';
import { redirectIfSignedIn } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Search = Promise<{ next?: string }>;

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Search;
}) {
  const params = (await searchParams) ?? {};
  await redirectIfSignedIn(params.next);
  const city = await getDetectedCity();

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Broadcast header */}
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
            Step 1 / 1
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-16 items-start">
          {/* Left — pitch */}
          <div className="rise" style={{ animationDelay: '120ms' }}>
            <p className="eyebrow">Tune in</p>
            <h1 className="font-display mt-6 text-[clamp(2.5rem,7vw,5rem)] leading-[0.95] tracking-[-0.02em] font-light">
              Three fields.
              <span className="block italic" style={{ fontVariationSettings: '"SOFT" 100' }}>
                You&apos;re in.
              </span>
            </h1>
            <p className="mt-8 max-w-md text-[color:var(--ink-soft)] leading-relaxed">
              No password. No OTP. No email. Just enough to count you in and
              put you in the same room as people from{' '}
              <span className="font-mono uppercase tracking-[0.12em] text-[color:var(--ink)]">
                {city ?? 'your city'}
              </span>
              .
            </p>

            <ul className="mt-10 space-y-3 font-mono text-[0.78rem] tracking-[0.16em] uppercase text-[color:var(--ink-mute)]">
              <li className="flex items-center gap-3">
                <span className="text-[color:var(--accent)]">01</span>
                <span>Name &amp; phone — kept private</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-[color:var(--accent)]">02</span>
                <span>City auto-detected</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-[color:var(--accent)]">03</span>
                <span>Land in the room with your people</span>
              </li>
            </ul>
          </div>

          {/* Right — form card */}
          <div
            className="rise relative bg-[color:var(--bg-raised)] border border-[color:var(--line)] p-8 sm:p-10"
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex items-baseline justify-between border-b border-[color:var(--line)] pb-4 mb-8">
              <span className="eyebrow">Form 001</span>
              <span className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
                Encrypted · Direct
              </span>
            </div>
            <Suspense fallback={null}>
              <SignupForm detectedCity={city} />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
