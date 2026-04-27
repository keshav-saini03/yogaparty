type City = { city: string; members: number };

export function CityPreview({ cities }: { cities: City[] }) {
  if (cities.length === 0) return null;
  const fmt = new Intl.NumberFormat('en-IN');
  const max = cities[0]?.members ?? 1;

  return (
    <section className="rise mt-24 sm:mt-32" style={{ animationDelay: '900ms' }}>
      <div className="flex items-baseline gap-4 mb-8">
        <span className="eyebrow">Cities tuned in</span>
        <span className="flex-1 h-px bg-[color:var(--line)]" />
        <span className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
          Top {cities.length}
        </span>
      </div>

      <ol className="divide-y divide-[color:var(--line)]">
        {cities.map((c, i) => {
          const pct = Math.max(8, Math.round((c.members / max) * 100));
          return (
            <li
              key={c.city}
              className="grid grid-cols-[3rem_1fr_auto] items-center gap-4 sm:gap-6 py-4 group"
            >
              <span className="font-mono tabular-nums text-[color:var(--ink-mute)] text-sm">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <div className="font-mono uppercase tracking-[0.14em] text-base sm:text-lg text-[color:var(--ink)] truncate">
                  {c.city}
                </div>
                <div className="mt-2 h-px relative overflow-hidden bg-[color:var(--ink-faint)]">
                  <span
                    className="absolute inset-y-0 left-0 bg-[color:var(--accent)] transition-[width] duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className="font-mono tabular-nums text-base sm:text-lg text-[color:var(--ink)]">
                {fmt.format(c.members)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
