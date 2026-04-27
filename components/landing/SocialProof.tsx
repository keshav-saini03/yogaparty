type Props = {
  city: string | null;
  cityCount: number;
  totalCount: number;
};

export function SocialProof({ city, cityCount, totalCount }: Props) {
  const fmt = new Intl.NumberFormat('en-IN');
  let line: React.ReactNode;
  if (city && cityCount > 0) {
    line = (
      <>
        <span className="font-mono text-[color:var(--ink)] tabular-nums">
          {fmt.format(cityCount)}
        </span>{' '}
        people from{' '}
        <span className="font-mono uppercase tracking-[0.12em] text-[color:var(--ink)]">
          {city}
        </span>{' '}
        watching
      </>
    );
  } else if (city && cityCount === 0) {
    line = (
      <>
        Be the first from{' '}
        <span className="font-mono uppercase tracking-[0.12em] text-[color:var(--ink)]">
          {city}
        </span>
      </>
    );
  } else {
    line = (
      <>
        <span className="font-mono text-[color:var(--ink)] tabular-nums">
          {fmt.format(totalCount)}
        </span>{' '}
        people watching
      </>
    );
  }

  return (
    <p
      className="rise mt-12 flex items-center gap-3 text-sm text-[color:var(--ink-soft)]"
      style={{ animationDelay: '700ms' }}
    >
      <span className="pulse-dot" aria-hidden />
      <span className="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[color:var(--live)]">
        Live
      </span>
      <span className="text-[color:var(--ink-faint)]">·</span>
      <span>{line}</span>
    </p>
  );
}
