import Link from 'next/link';
import { Hero } from '@/components/landing/Hero';
import { SocialProof } from '@/components/landing/SocialProof';
import { CityPreview } from '@/components/landing/CityPreview';
import { CounterPlaceholder } from '@/components/landing/CounterPlaceholder';
import { ReferralCapture } from '@/components/landing/ReferralCapture';
import { SignOutButton } from '@/components/share/SignOutButton';
import { createClient } from '@/lib/supabase/server';
import { getDetectedCity } from '@/lib/geo';
import { resolveSession } from '@/lib/session';

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
  const [stats, session] = await Promise.all([
    getStats(city),
    resolveSession(),
  ]);

  return (
    <main className="min-h-screen relative overflow-hidden">
      <ReferralCapture />

      {/* Broadcast header bar */}
      <header className="border-b border-[color:var(--line)]">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-4">
          <span className="pulse-dot" aria-hidden />
          <span className="font-mono text-[0.7rem] tracking-[0.22em] uppercase text-[color:var(--live)]">
            On Air
          </span>
          <span className="text-[color:var(--ink-faint)]">|</span>
          <span className="font-mono text-[0.72rem] tracking-[0.18em] uppercase text-[color:var(--ink)]">
            Watch · Party
          </span>
          <span className="text-[color:var(--ink-faint)] hidden sm:inline">|</span>
          <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)] tabular-nums">
            <span className="text-[color:var(--accent)]">
              {new Intl.NumberFormat('en-IN').format(stats.total)}
            </span>{' '}
            signups
          </span>
          <div className="ml-auto flex items-center gap-3 sm:gap-5">
            <Link
              href="/rooms"
              className="font-mono text-[0.65rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--accent)] transition-colors"
            >
              Browse rooms →
            </Link>
            {session ? (
              <div className="flex items-center gap-3 sm:gap-4">
                <span className="font-mono text-[0.65rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-[color:var(--accent)] flex items-center gap-2">
                  <span className="hidden sm:inline">Signed in</span>
                  <span className="sm:hidden">In</span>
                  <span className="text-[color:var(--ink-faint)]">·</span>
                  <span className="text-[color:var(--ink)] truncate max-w-[6rem] sm:max-w-[10rem]">
                    {session.name}
                  </span>
                </span>
                <SignOutButton />
              </div>
            ) : (
              <Link
                href="/login"
                className="font-mono text-[0.65rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--accent)] transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero band */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-20 relative">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-12 lg:gap-20 items-start">
          <div>
            <Hero signedIn={!!session} />
            <SocialProof
              city={city}
              cityCount={stats.cityCount}
              totalCount={stats.total}
            />
          </div>
          <div className="lg:pt-4">
            <CounterPlaceholder
              total={stats.total}
              india={stats.india}
              international={stats.international}
            />
          </div>
        </div>
      </section>

      {/* Cities ticker band */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <CityPreview cities={stats.topCities} />
      </section>

      {/* Footer marker */}
      <footer className="mx-auto max-w-6xl px-6 py-10 border-t border-[color:var(--line)] flex items-center justify-between">
        <span className="font-mono text-[0.65rem] tracking-[0.24em] uppercase text-[color:var(--ink-mute)]">
          End of broadcast · Loop in 0:00
        </span>
        <span className="font-mono text-[0.65rem] tracking-[0.24em] uppercase text-[color:var(--ink-mute)]">
          Est. 2026
        </span>
      </footer>
    </main>
  );
}
