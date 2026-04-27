type Props = {
  total: number;
  india: number;
  international: number;
};

export function CounterPlaceholder({ total, india, international }: Props) {
  const fmt = new Intl.NumberFormat('en-IN');
  return (
    <section className="px-6 mt-10 max-w-md mx-auto text-center">
      <div className="text-5xl font-semibold tabular-nums">{fmt.format(total)}</div>
      <div className="text-sm text-gray-500 mt-1">
        {fmt.format(india)} from India · {fmt.format(international)} international
      </div>
    </section>
  );
}
