type Props = {
  size?: 'sm' | 'md';
  title?: string;
};

export function HostBadge({ size = 'sm', title = 'Controls playback for the room.' }: Props) {
  const sizeCls = size === 'sm' ? 'text-[0.55rem] px-1.5 py-0.5' : 'text-[0.65rem] px-2 py-1';
  return (
    <span
      title={title}
      aria-label="Host"
      className={`inline-flex items-center gap-1 font-mono uppercase tracking-[0.2em] border border-[color:var(--accent)] text-[color:var(--accent)] ${sizeCls}`}
    >
      <span aria-hidden>◆</span>
      Host
    </span>
  );
}
