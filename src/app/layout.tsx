import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  weight: ['400', '700', '800'],
});

const instrument = Instrument_Sans({
  variable: '--font-instrument',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'ReWyse — Sell it before you leave',
  description:
    'A marketplace for verified students across IIIT Delhi, IIT Delhi and DTU. Prices that account for how close you are to move-out day.',
  applicationName: 'ReWyse',
  appleWebApp: { capable: true, title: 'ReWyse', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom stays enabled: disabling it is an accessibility failure, and the 16px
  // input rule in globals.css already prevents iOS's focus-zoom jump.
  maximumScale: 5,
  themeColor: '#0a0a0b',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${instrument.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
