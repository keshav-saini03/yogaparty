type Props = {
  total: number;
  india: number;
  international: number;
};

export function CounterPlaceholder({ total, india, international }: Props) {
  const fmt = new Intl.NumberFormat('en-IN');

  return (
    <div className="rise relative" style={{ animationDelay: '320ms' }}>
      <div className="flex items-baseline gap-3 pb-3 border-b border-[color:var(--line)]">
        <span className="eyebrow">Total signups</span>
        <span className="ml-auto font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
          ↻ Real-time
        </span>
      </div>

      <div
        className="font-mono ticker-glow tabular-nums text-[clamp(4.5rem,14vw,10rem)] leading-[0.9] tracking-[-0.05em] text-[color:var(--accent)] mt-6"
      >
        {fmt.format(total).padStart(4, '0')}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-px bg-[color:var(--line)]">
        <div className="bg-[color:var(--bg)] p-5">
          <div className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
            From India
          </div>
          <div className="font-mono tabular-nums text-3xl mt-2 text-[color:var(--ink)]">
            {fmt.format(india)}
          </div>
        </div>
        <div className="bg-[color:var(--bg)] p-5">
          <div className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
            International
          </div>
          <div className="font-mono tabular-nums text-3xl mt-2 text-[color:var(--ink)]">
            {fmt.format(international)}
          </div>
        </div>
      </div>
    </div>
  );
}
