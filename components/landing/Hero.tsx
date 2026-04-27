import Link from 'next/link';

export function Hero() {
  return (
    <section className="px-6 pt-16 pb-10 text-center">
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
        Watch together with people near you
      </h1>
      <p className="mt-4 text-base text-gray-600 max-w-md mx-auto">
        Live sessions with your city. Synced. Together.
      </p>
      <Link
        href="/signup"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-black px-8 text-white font-semibold"
      >
        Join a Watch Party
      </Link>
    </section>
  );
}
