import Link from 'next/link';

type Props = {
  signedIn?: boolean;
};

export function Hero({ signedIn = false }: Props) {
  const ctaHref = signedIn ? '/rooms' : '/signup';
  const ctaLabel = signedIn ? 'Open the lobby' : 'Join a Watch Party';

  return (
    <div className="relative">
      <div className="rise" style={{ animationDelay: '120ms' }}>
        <p className="eyebrow">Broadcast 001 · Live</p>
      </div>

      <h1
        className="font-display rise mt-6 text-[clamp(3rem,9vw,7.25rem)] leading-[0.92] tracking-[-0.02em] font-light"
        style={{ animationDelay: '200ms' }}
      >
        Watch
        <span className="block italic" style={{ fontVariationSettings: '"SOFT" 100' }}>
          together
        </span>
        <span className="block">
          with people <span className="text-[color:var(--ink-mute)]">near</span> you.
        </span>
      </h1>

      <p
        className="rise mt-8 max-w-md text-base sm:text-lg text-[color:var(--ink-soft)] leading-relaxed"
        style={{ animationDelay: '420ms' }}
      >
        Live sessions with your city.{' '}
        <span className="text-[color:var(--ink)]">Synced.</span> Together.
      </p>

      <div
        className="rise mt-10 flex items-center gap-6"
        style={{ animationDelay: '560ms' }}
      >
        <Link href={ctaHref} className="cta">
          {ctaLabel}
          <span className="arrow" aria-hidden />
        </Link>
        <span className="font-mono text-[0.7rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)] hidden sm:inline">
          {signedIn
            ? 'Pick a public room or paste a private code'
            : 'No OTP · 3 fields · 30 sec'}
        </span>
      </div>
    </div>
  );
}
