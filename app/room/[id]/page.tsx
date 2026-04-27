import Link from 'next/link';

type Params = Promise<{ id: string }>;

export default async function RoomPlaceholder({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const short = id.slice(0, 8);

  return (
    <main className="min-h-screen relative overflow-hidden flex flex-col">
      <header className="border-b border-[color:var(--line)]">
        <div className="mx-auto max-w-6xl w-full px-6 py-4 flex items-center gap-4">
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
        </div>
      </header>

      <section className="flex-1 mx-auto max-w-6xl w-full px-6 flex items-center">
        <div className="rise w-full" style={{ animationDelay: '180ms' }}>
          <p className="eyebrow">Confirmed</p>
          <h1 className="font-display mt-6 text-[clamp(3rem,9vw,7rem)] leading-[0.92] tracking-[-0.02em] font-light">
            You&apos;re
            <span className="block italic" style={{ fontVariationSettings: '"SOFT" 100' }}>
              tuned in.
            </span>
          </h1>
          <p className="mt-8 max-w-md text-[color:var(--ink-soft)] leading-relaxed">
            We&apos;ve saved your seat. The watch room arrives in Phase 3 — sync,
            chat, and the people from your city.
          </p>

          <div className="mt-12 inline-flex items-center gap-4 border border-[color:var(--line)] bg-[color:var(--bg-raised)] px-5 py-3">
            <span className="font-mono text-[0.65rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)]">
              Seat ID
            </span>
            <code className="font-mono text-[color:var(--accent)] tracking-[0.08em]">
              {short}
            </code>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl w-full px-6 py-6 border-t border-[color:var(--line)] flex items-center justify-between">
        <span className="font-mono text-[0.65rem] tracking-[0.24em] uppercase text-[color:var(--ink-mute)]">
          Phase 3 incoming
        </span>
        <Link
          href="/"
          className="font-mono text-[0.65rem] tracking-[0.24em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]"
        >
          Back to broadcast →
        </Link>
      </footer>
    </main>
  );
}
