import Link from 'next/link';
import { cookies } from 'next/headers';
import { listPublicRooms, splitPublicRoomsByCity } from '@/lib/rooms';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDetectedCity } from '@/lib/geo';
import { PublicRoomCard } from '@/components/rooms/PublicRoomCard';
import { CreateRoomForm } from '@/components/rooms/CreateRoomForm';
import { JoinByCodeForm } from '@/components/rooms/JoinByCodeForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getViewerCity(): Promise<string | null> {
  const c = await cookies();
  const session = c.get('yp_session')?.value;
  if (session && UUID_RE.test(session)) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('signups')
      .select('city')
      .eq('id', session)
      .maybeSingle();
    if (data?.city) return data.city;
  }
  return await getDetectedCity();
}

export default async function RoomsDirectoryPage() {
  const [rooms, viewerCity] = await Promise.all([
    listPublicRooms(50),
    getViewerCity(),
  ]);

  const { inYourCity, elsewhere } = splitPublicRoomsByCity(rooms, viewerCity);
  const cityLabel = viewerCity && viewerCity !== 'GLOBAL' ? viewerCity : null;
  const totalCount = rooms.length;

  return (
    <main className="min-h-screen relative overflow-hidden">
      <header className="border-b border-[color:var(--line)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 flex-wrap">
          <span className="pulse-dot" aria-hidden />
          <span className="font-mono text-[0.65rem] sm:text-[0.7rem] tracking-[0.22em] uppercase text-[color:var(--live)]">
            On Air
          </span>
          <span className="text-[color:var(--ink-faint)]">|</span>
          <Link
            href="/"
            className="font-mono text-[0.65rem] sm:text-[0.72rem] tracking-[0.18em] uppercase text-[color:var(--ink)] hover:text-[color:var(--accent)] transition-colors"
          >
            ← Watch · Party
          </Link>
          <span className="ml-auto font-mono text-[0.65rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
            Directory
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="rise" style={{ animationDelay: '120ms' }}>
          <p className="eyebrow">The lobby</p>
          <h1 className="font-display mt-3 text-[clamp(2rem,6vw,4rem)] leading-[0.95] tracking-[-0.02em] font-light">
            Pick a room.
            <span className="block italic" style={{ fontVariationSettings: '"SOFT" 100' }}>
              Or open your own.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[color:var(--ink-soft)] leading-relaxed">
            Got a private invite link? Paste it. Want to drop into a public room?
            Browse below. Want to host? Open a public or private room — your call.
          </p>
        </div>

        {/* Join-by-code lives at the top because it's the most directed action */}
        <div
          className="mt-10 rise border border-[color:var(--line)] bg-[color:var(--bg-raised)] p-5 sm:p-6"
          style={{ animationDelay: '200ms' }}
        >
          <JoinByCodeForm />
        </div>

        <div className="mt-12 grid lg:grid-cols-[1.3fr_1fr] gap-12 items-start">
          {/* Listing */}
          <div className="space-y-10">
            {totalCount === 0 ? (
              <div className="border border-dashed border-[color:var(--line)] p-8 text-center">
                <p className="eyebrow">Quiet on the airwaves</p>
                <p className="mt-3 text-[color:var(--ink-soft)]">
                  No public rooms open right now. Be the first.
                </p>
              </div>
            ) : (
              <>
                {/* Your city section — only if we know the viewer's city */}
                {cityLabel && (
                  <div className="space-y-5">
                    <div className="flex items-baseline justify-between border-b border-[color:var(--line)] pb-3">
                      <p className="eyebrow">In {cityLabel}</p>
                      <span className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
                        {inYourCity.length}{' '}
                        {inYourCity.length === 1 ? 'room' : 'rooms'}
                      </span>
                    </div>
                    {inYourCity.length === 0 ? (
                      <p className="font-mono text-[0.7rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)] py-3">
                        No live rooms in {cityLabel} yet — open the first.
                      </p>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-4">
                        {inYourCity.map((r) => (
                          <PublicRoomCard key={r.id} room={r} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Elsewhere */}
                {elsewhere.length > 0 && (
                  <div className="space-y-5">
                    <div className="flex items-baseline justify-between border-b border-[color:var(--line)] pb-3">
                      <p className="eyebrow">
                        {cityLabel ? 'Around the world' : 'Live now'}
                      </p>
                      <span className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
                        {elsewhere.length}{' '}
                        {elsewhere.length === 1 ? 'room' : 'rooms'}
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {elsewhere.map((r) => (
                        <PublicRoomCard key={r.id} room={r} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Create form */}
          <aside className="border border-[color:var(--line)] bg-[color:var(--bg-raised)] p-6 sm:p-8 lg:sticky lg:top-6">
            <div className="flex items-baseline justify-between border-b border-[color:var(--line)] pb-3 mb-6">
              <p className="eyebrow">Open a room</p>
              <span className="font-mono text-[0.62rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
                {cityLabel ? `${cityLabel}` : 'Anywhere'}
              </span>
            </div>
            <p className="text-[0.95rem] text-[color:var(--ink-soft)] leading-relaxed mb-6">
              Title it, choose visibility, share the link.
              {cityLabel && (
                <span className="block mt-2 text-[color:var(--ink-mute)] text-[0.85rem]">
                  Tagged{' '}
                  <span className="text-[color:var(--accent)] font-mono uppercase tracking-[0.12em]">
                    {cityLabel}
                  </span>{' '}
                  by default.
                </span>
              )}
            </p>
            <CreateRoomForm />
            <p className="mt-6 font-mono text-[0.6rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
              Private rooms aren&apos;t listed — share the link to invite people.
            </p>
          </aside>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 sm:px-6 py-10 border-t border-[color:var(--line)] flex items-center justify-between">
        <span className="font-mono text-[0.65rem] tracking-[0.24em] uppercase text-[color:var(--ink-mute)]">
          Watch · Party · Directory
        </span>
        <Link
          href="/"
          className="font-mono text-[0.65rem] tracking-[0.24em] uppercase text-[color:var(--ink-mute)] hover:text-[color:var(--ink)]"
        >
          Back to landing →
        </Link>
      </footer>
    </main>
  );
}
