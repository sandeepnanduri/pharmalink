import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { API_SCOPES, WEBHOOK_EVENTS } from '@/lib/integrations.constants';
import { SITE_URL, absoluteUrl, localeAlternates } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const path = '/developers';
  return {
    title: 'Developers — Open API & webhooks',
    description: 'Integrate PharmaLink into your ERP, procurement or supply-chain tools. Read the catalogue over a REST API and subscribe to events via signed webhooks.',
    alternates: { canonical: absoluteUrl(locale, path), languages: localeAlternates(path) },
  };
}

/**
 * Public API documentation — the page you point a partner at. Intentionally a
 * plain, indexable content page (good for SEO too: "PharmaLink API").
 */
export default async function DevelopersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('developers');

  const Code = ({ children }: { children: React.ReactNode }) => (
    <pre className="overflow-x-auto rounded-lg bg-ink p-4 text-xs leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{t('intro')}</p>

      <h2 className="mb-2 mt-8 text-lg font-bold">{t('auth')}</h2>
      <p className="mb-3 text-sm text-muted">{t('authBody')}</p>
      <Code>{`curl ${SITE_URL}/api/v1/products?q=paracetamol \\
  -H "Authorization: Bearer plk_live_xxxxxxxxxxxx"`}</Code>
      <p className="mt-3 text-sm text-muted">
        {t('scopesLabel')}: {API_SCOPES.map((s) => <code key={s} className="mx-1 rounded bg-brand-pale px-1.5 py-0.5 text-xs text-brand">{s}</code>)}
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold">{t('endpoints')}</h2>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">{t('endpoint')}</th>
              <th className="th">{t('scope')}</th>
              <th className="th">{t('returns')}</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['GET /api/v1/products', 'catalog:read', t('epProducts')],
              ['GET /api/v1/products/{id}', 'catalog:read', t('epProduct')],
              ['GET /api/v1/suppliers', 'suppliers:read', t('epSuppliers')],
              ['GET /api/v1/rfqs', 'rfq:read', t('epRfqs')],
            ].map(([ep, sc, ret]) => (
              <tr key={ep}>
                <td className="td font-mono text-xs">{ep}</td>
                <td className="td"><code className="text-xs text-brand">{sc}</code></td>
                <td className="td text-xs text-muted">{ret}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 mt-8 text-lg font-bold">{t('webhooks')}</h2>
      <p className="mb-3 text-sm text-muted">{t('webhooksBody')}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {WEBHOOK_EVENTS.map((e) => (
          <code key={e} className="rounded bg-surface px-2 py-1 text-xs">{e}</code>
        ))}
      </div>
      <p className="mb-2 text-sm text-muted">{t('verifyBody')}</p>
      <Code>{`// Node — verify the signature on your endpoint
import crypto from 'node:crypto';
const sig = req.headers['x-pharmalink-signature'];
const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
  .update(rawBody).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));`}</Code>

      <p className="mt-8 rounded-card border border-brand-mid bg-brand-pale px-4 py-3 text-sm text-indigo-900">
        {t('getKeys')}
      </p>
    </div>
  );
}
