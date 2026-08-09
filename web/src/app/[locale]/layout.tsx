import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { SITE_URL, SITE_NAME, absoluteUrl, localeAlternates, ogLocale } from '@/lib/seo';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { routing, type Locale } from '@/i18n/routing';
import { SiteHeader } from '@/components/site-header';
import { CompareBar } from '@/components/compare-tray';
import { ChromeGate } from '@/components/chrome-gate';
import { ToastProvider } from '@/components/toaster';
import '../globals.css';

/** Route prefixes that render the ops console shell instead of the marketing chrome. */
const OPS_ROUTES = ['/admin'];

/**
 * Three type roles, matching the approved redesign.
 *
 *  - Space Grotesk carries headings and large figures. Its numerals are wide and
 *    confident at display sizes, which is what a hero price needs.
 *  - Inter carries body copy. It has unambiguous 0/O and 1/l, which matters on a
 *    page full of CAS numbers.
 *  - JetBrains Mono carries every identifier and every number that sits in a
 *    column, with real tabular figures so digits align.
 *
 * Space Grotesk is deliberately NOT used for small figures or table cells — at
 * 12px its geometric numerals read worse than Inter's, and a column of prices is
 * compared, not admired.
 *
 * All three are self-hosted by next/font: no CDN request, no layout shift, and
 * no silent fallback if a font host is blocked.
 */
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  axes: [],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const loc = (routing.locales.includes(locale as Locale) ? locale : routing.defaultLocale) as Locale;
  const t = await getTranslations({ locale: loc, namespace: 'seo' });

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t('defaultTitle'),
      // Per-page titles render as "Paracetamol — PharmaLink Global".
      template: `%s — ${SITE_NAME}`,
    },
    description: t('description'),
    applicationName: SITE_NAME,
    keywords: [
      'pharmaceutical marketplace',
      'API supplier',
      'active pharmaceutical ingredients',
      'GMP verified',
      'CAS number',
      'excipients',
      'KSM',
      'DMF',
      'pharma sourcing',
      'RFQ',
    ],
    alternates: {
      canonical: absoluteUrl(loc),
      languages: localeAlternates(),
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: t('defaultTitle'),
      description: t('description'),
      url: absoluteUrl(loc),
      locale: ogLocale(loc),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('defaultTitle'),
      description: t('description'),
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: '48x48' }],
      apple: '/apple-icon.png',
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${display.variable} ${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          <ToastProvider>
          {/* The ops console brings its own shell — see ChromeGate and
              admin/layout.tsx. The compare tray is a buyer affordance and has
              no place there either. */}
          <ChromeGate hideOn={OPS_ROUTES}>
            <SiteHeader />
          </ChromeGate>
          <main>{children}</main>
          <ChromeGate hideOn={OPS_ROUTES}>
            <CompareBar />
          </ChromeGate>
        </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
