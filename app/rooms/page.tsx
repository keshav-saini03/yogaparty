import Link from 'next/link';
import { listPublicRooms } from '@/lib/rooms';
import { PublicRoomCard } from '@/components/rooms/PublicRoomCard';
import { CreateRoomForm } from '@/components/rooms/CreateRoomForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RoomsDirectoryPage() {
  const rooms = await listPublicRooms(50);

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
          <p className="eyebrow">Open rooms</p>
          <h1 className="font-display mt-3 text-[clamp(2rem,6vw,4rem)] leading-[0.95] tracking-[-0.02em] font-light">
            Drop into someone&apos;s room.
            <span className="block italic" style={{ fontVariationSettings: '"SOFT" 100' }}>
              Or open your own.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[color:var(--ink-soft)] leading-relaxed">
            Public rooms are watch parties anyone can join. Open one, give it a title,
            share the link — your friends and strangers near you can tap in.
          </p>
        </div>

        <div className="mt-12 grid lg:grid-cols-[1.3fr_1fr] gap-12 items-start">
          {/* Listing */}
          <div className="space-y-6">
            <div className="flex items-baseline justify-between border-b border-[color:var(--line)] pb-3">
              <p className="eyebrow">Live now</p>
              <span className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
                {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
              </span>
            </div>

            {rooms.length === 0 ? (
              <div className="border border-dashed border-[color:var(--line)] p-8 text-center">
                <p className="eyebrow">Quiet on the airwaves</p>
                <p className="mt-3 text-[color:var(--ink-soft)]">
                  No public rooms open right now. Be the first.
                </p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {rooms.map((r) => (
                  <PublicRoomCard key={r.id} room={r} />
                ))}
              </div>
            )}
          </div>

          {/* Create form */}
          <aside className="border border-[color:var(--line)] bg-[color:var(--bg-raised)] p-6 sm:p-8 lg:sticky lg:top-6">
            <div className="flex items-baseline justify-between border-b border-[color:var(--line)] pb-3 mb-6">
              <p className="eyebrow">New broadcast</p>
              <span className="font-mono text-[0.62rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
                Public · 7 max
              </span>
            </div>
            <p className="text-[0.95rem] text-[color:var(--ink-soft)] leading-relaxed mb-6">
              Give your room a title. Anyone can join via the link or this directory.
            </p>
            <CreateRoomForm />
            <p className="mt-6 font-mono text-[0.6rem] tracking-[0.18em] uppercase text-[color:var(--ink-mute)]">
              You&apos;ll need to be signed up first.
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
