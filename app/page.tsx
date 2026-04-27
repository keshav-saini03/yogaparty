import { Hero } from '@/components/landing/Hero';
import { SocialProof } from '@/components/landing/SocialProof';
import { CityPreview } from '@/components/landing/CityPreview';
import { CounterPlaceholder } from '@/components/landing/CounterPlaceholder';
import { ReferralCapture } from '@/components/landing/ReferralCapture';
import { createClient } from '@/lib/supabase/server';
import { getDetectedCity } from '@/lib/geo';

// Defeat any caching — counts must be fresh-ish on every visit.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getStats(city: string | null) {
  const sb = await createClient();
  const [totalRes, indiaRes, intlRes, cityRes, sample] = await Promise.all([
    sb.from('signups').select('*', { count: 'exact', head: true }),
    sb
      .from('signups')
      .select('*', { count: 'exact', head: true })
      .eq('country_code', '+91'),
    sb
      .from('signups')
      .select('*', { count: 'exact', head: true })
      .neq('country_code', '+91'),
    city
      ? sb
          .from('signups')
          .select('*', { count: 'exact', head: true })
          .eq('city', city)
      : Promise.resolve({ count: 0 } as { count: number | null }),
    sb.from('signups').select('city').not('city', 'is', null).limit(1000),
  ]);

  const counts = new Map<string, number>();
  for (const row of (sample.data ?? []) as Array<{ city: string | null }>) {
    if (!row.city) continue;
    counts.set(row.city, (counts.get(row.city) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([city, members]) => ({ city, members }));

  return {
    total: totalRes.count ?? 0,
    india: indiaRes.count ?? 0,
    international: intlRes.count ?? 0,
    cityCount: cityRes.count ?? 0,
    topCities: top,
  };
}

export default async function Landing() {
  const city = await getDetectedCity();
  const stats = await getStats(city);

  return (
    <main className="min-h-screen bg-white">
      <ReferralCapture />
      <Hero />
      <SocialProof
        city={city}
        cityCount={stats.cityCount}
        totalCount={stats.total}
      />
      <CounterPlaceholder
        total={stats.total}
        india={stats.india}
        international={stats.international}
      />
      <CityPreview cities={stats.topCities} />
    </main>
  );
}
