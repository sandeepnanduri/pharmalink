import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { verifyDocumentHash } from '@/lib/verify-queries';
import { shortHash } from '@/lib/hash';
import { absoluteUrl, localeAlternates } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'verify' });
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: { canonical: absoluteUrl(locale, '/verify'), languages: localeAlternates('/verify') },
  };
}

/**
 * Public document-integrity check. Paste a SHA-256; we say whether it matches a
 * registered document and what it authenticates — never the file itself.
 */
export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hash?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('verify');
  const format = await getFormatter();

  const raw = (await searchParams).hash ?? '';
  const result = raw.trim() ? await verifyDocumentHash(raw) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('subtitle')}</p>

      <form method="GET" className="mt-6 flex flex-wrap gap-2">
        <input
          name="hash"
          defaultValue={raw}
          placeholder="SHA-256 (64 hex characters)"
          className="input flex-1 font-mono text-xs"
          data-testid="verify-input"
        />
        <button type="submit" className="btn-primary" data-testid="verify-submit">{t('verify')}</button>
      </form>

      {result && (
        <div className="mt-6" data-testid="verify-result">
          {result.status === 'invalid' && (
            <div className="rounded-card border border-amber-300 bg-warn-pale px-4 py-3 text-sm text-amber-900">⚠ {t('invalid')}</div>
          )}
          {result.status === 'notfound' && (
            <div className="rounded-card border border-red-300 bg-danger-pale px-4 py-3 text-sm text-red-900" data-testid="verify-notfound">
              ✗ {t('notfound')}
              <p className="mt-1 font-mono text-xs">{shortHash(result.hash)}</p>
            </div>
          )}
          {result.status === 'found' && (
            <div className="rounded-card border border-green-300 bg-ok-pale px-4 py-4" data-testid="verify-found">
              <p className="text-sm font-bold text-green-900">✓ {t('found')}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted">{t('document')}</dt><dd className="font-semibold">{result.filename}</dd></div>
                <div><dt className="text-xs text-muted">{t('type')}</dt><dd className="font-semibold">{result.certName ?? result.kind}</dd></div>
                <div><dt className="text-xs text-muted">{t('registeredBy')}</dt><dd className="font-semibold">{result.orgName}</dd></div>
                <div><dt className="text-xs text-muted">{t('registeredAt')}</dt><dd className="font-semibold">{format.dateTime(result.registeredAt, { dateStyle: 'medium' })}</dd></div>
              </dl>
              <p className="mt-3 font-mono text-[11px] text-muted">{result.hash}</p>
            </div>
          )}
        </div>
      )}

      <p className="mt-8 text-xs text-muted">{t('how')}</p>
    </div>
  );
}
