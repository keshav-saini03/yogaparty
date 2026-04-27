type City = { city: string; members: number };

export function CityPreview({ cities }: { cities: City[] }) {
  if (cities.length === 0) return null;
  const fmt = new Intl.NumberFormat('en-IN');
  return (
    <section className="px-6 mt-12 max-w-md mx-auto">
      <h2 className="text-sm uppercase tracking-wide text-gray-500 mb-3">
        Cities watching now
      </h2>
      <ol className="space-y-1">
        {cities.map((c, i) => (
          <li key={c.city} className="flex justify-between text-base">
            <span>
              <span className="text-gray-400 mr-2">{i + 1}.</span>
              {c.city}
            </span>
            <span className="text-gray-600">{fmt.format(c.members)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
