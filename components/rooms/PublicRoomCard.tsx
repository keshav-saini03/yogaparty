import Link from 'next/link';
import type { PublicRoomListing } from '@/lib/rooms';
import { CURATED_VIDEOS } from '@/lib/videos';

type Props = { room: PublicRoomListing };

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function PublicRoomCard({ room }: Props) {
  const video = room.youtube_video_id
    ? CURATED_VIDEOS.find((v) => v.id === room.youtube_video_id)
    : null;
  const cityLabel = room.city && room.city !== 'GLOBAL' ? room.city : 'Anywhere';

  return (
    <Link
      href={`/room/${room.id}`}
      className="group block border border-[color:var(--line)] bg-[color:var(--bg-raised)] p-5 hover:border-[color:var(--accent)] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">Live · {cityLabel}</p>
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-[color:var(--ink-mute)]">
          {relTime(room.created_at)}
        </span>
      </div>

      <h3 className="mt-3 font-display text-xl sm:text-2xl leading-snug text-[color:var(--ink)] group-hover:text-[color:var(--accent)] transition-colors">
        {room.title}
      </h3>

      <p className="mt-2 font-mono text-[0.7rem] tracking-[0.16em] uppercase text-[color:var(--ink-soft)] line-clamp-2">
        {video ? `Now: ${video.title}` : 'Standing by — host picks the session'}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--ink-faint)] pt-3">
        <span className="font-mono text-[0.62rem] tracking-[0.22em] uppercase text-[color:var(--ink-mute)]">
          Tap to join →
        </span>
        <span className="pulse-dot" aria-hidden />
      </div>
    </Link>
  );
}
