import type { Metadata, Viewport } from 'next';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  axes: ['SOFT', 'opsz'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Watch · Party — Watch together with people near you',
  description:
    'Live sessions with your city. Synced. Together. Join a watch party from anywhere.',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0c',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
