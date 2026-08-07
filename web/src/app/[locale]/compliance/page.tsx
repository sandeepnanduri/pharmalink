import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { Link, redirect } from '@/i18n/routing';
import { canBuy, canSell, isPlatformRole } from '@/lib/rbac';
import { getSellerCompliance, getBuyerCompliance } from '@/lib/compliance-queries';
import { getOrgDocuments } from '@/lib/verify-queries';
import { shortHash } from '@/lib/hash';
import { REGULATORY_FRAMEWORKS, type CertExpiryLevel } from '@/lib/compliance';
import { StatCard } from '@/components/stat-card';

export const dynamic = 'force-dynamic';

const LEVEL_CLS: Record<CertExpiryLevel, string> = {
  expired: 'badge-rejected',
  critical: 'badge-rejected',
  warning: 'badge-pending',
  soon: 'badge-info',
  ok: 'badge-verified',
  unknown: 'badge-neutral',
};

/** Compliance hub — cert-expiry tracking + alerts + a regulatory reference. */
export default async function CompliancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  // Trading roles only — staff have their own verification queue.
  if (isPlatformRole(user.role)) redirect({ href: '/admin', locale });

  const t = await getTranslations('compliance');
  const format = await getFormatter();
  const fmtExpiry = (d: Date | null) => (d ? format.dateTime(d, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
  const LevelBadge = ({ level }: { level: CertExpiryLevel }) => (
    <span className={`${LEVEL_CLS[level]} text-[11px]`}>{t(`level_${level}`)}</span>
  );

  const seller = canSell(user.role) && user.orgId ? await getSellerCompliance(user.orgId) : null;
  const buyer = canBuy(user.role) && user.orgId ? await getBuyerCompliance(user.orgId) : null;
  const documents = user.orgId ? await getOrgDocuments(user.orgId) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('subtitle')}</p>

      {/* Seller: your own certifications */}
      {seller && (
        <section className="mb-10" data-testid="seller-compliance">
          <h2 className="mb-3 text-base font-bold">{t('yourCerts')}</h2>
          <div className="mb-4 grid gap-4 sm:grid-cols-4">
            <StatCard label={t('active')} value={seller.summary.ok} />
            <StatCard label={t('expiringSoon')} value={seller.summary.expiring} testId="seller-expiring" />
            <StatCard label={t('expired')} value={seller.summary.expired} />
            <StatCard label={t('total')} value={seller.summary.total} />
          </div>
          {seller.alerts.length > 0 && (
            <div className="mb-4 rounded-card border border-amber-300 bg-warn-pale px-4 py-3 text-sm text-amber-900" data-testid="seller-alerts">
              <p className="font-bold">⚠ {t('renewalNeeded', { n: seller.alerts.length })}</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {seller.alerts.map((a) => (
                  <li key={a.id}>
                    {a.name} — {t(`level_${a.level}`)} ({fmtExpiry(a.expiresAt)})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <CertTable
            head={[t('certification'), t('site'), t('expiry'), t('statusCol'), t('source')]}
            rows={seller.rows.map((c) => [c.name, c.site?.name ?? '—', fmtExpiry(c.expiresAt), <LevelBadge key="l" level={c.level} />, c.verifiedVia ?? '—'])}
            empty={t('noCerts')}
          />
        </section>
      )}

      {/* Buyer: your suppliers' compliance */}
      {buyer && (
        <section className="mb-10" data-testid="buyer-compliance">
          <h2 className="mb-3 text-base font-bold">{t('supplierCompliance')}</h2>
          {buyer.supplierCount === 0 ? (
            <div className="card py-8 text-center text-sm text-muted" data-testid="no-supplier-compliance">{t('noSuppliers')}</div>
          ) : (
            <>
              <div className="mb-4 grid gap-4 sm:grid-cols-4">
                <StatCard label={t('suppliersTracked')} value={buyer.supplierCount} />
                <StatCard label={t('certsCompliant')} value={buyer.summary.ok} />
                <StatCard label={t('expiringSoon')} value={buyer.summary.expiring} testId="buyer-expiring" />
                <StatCard label={t('expired')} value={buyer.summary.expired} />
              </div>
              {buyer.alerts.length > 0 && (
                <div className="mb-4 rounded-card border border-amber-300 bg-warn-pale px-4 py-3 text-sm text-amber-900" data-testid="buyer-alerts">
                  <p className="font-bold">⚠ {t('supplierAlerts', { n: buyer.alerts.length })}</p>
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {buyer.alerts.map((a) => (
                      <li key={a.id}>
                        {a.org.name}: {a.name} — {t(`level_${a.level}`)} ({fmtExpiry(a.expiresAt)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <CertTable
                head={[t('supplier'), t('certification'), t('expiry'), t('statusCol')]}
                rows={buyer.rows.map((c) => [c.org.name, c.name, fmtExpiry(c.expiresAt), <LevelBadge key="l" level={c.level} />])}
                empty={t('noCerts')}
              />
            </>
          )}
        </section>
      )}

      {/* Document registry — real SHA-256 integrity hashes */}
      {documents.length > 0 && (
        <section className="mb-10" data-testid="document-registry">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-bold">{t('documentRegistry')}</h2>
            <Link href="/verify" className="text-xs font-semibold text-brand hover:underline">{t('verifyTool')} →</Link>
          </div>
          <p className="mb-3 text-xs text-muted">{t('registryNote')}</p>
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">{t('docName')}</th>
                  <th className="th">{t('docType')}</th>
                  <th className="th">SHA-256</th>
                  <th className="th">{t('statusCol')}</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id} data-testid="doc-row">
                    <td className="td font-semibold">{d.filename}</td>
                    <td className="td text-xs">{d.certification?.name ?? d.kind}</td>
                    <td className="td font-mono text-[11px]">
                      {d.sha256 ? (
                        <Link href={{ pathname: '/verify', query: { hash: d.sha256 } }} className="text-brand hover:underline">
                          {shortHash(d.sha256)}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="td">
                      <span className={d.status === 'verified' ? 'badge-verified' : 'badge-pending'}>{d.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Shared regulatory framework reference */}
      <section data-testid="regulatory-frameworks">
        <h2 className="mb-3 text-base font-bold">{t('frameworks')}</h2>
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">{t('authority')}</th>
                <th className="th">{t('regulation')}</th>
                <th className="th">{t('scope')}</th>
                <th className="th">{t('region')}</th>
              </tr>
            </thead>
            <tbody>
              {REGULATORY_FRAMEWORKS.map((f) => (
                <tr key={f.regulation}>
                  <td className="td font-semibold">{f.authority}</td>
                  <td className="td font-mono text-xs">{f.regulation}</td>
                  <td className="td text-xs text-muted">{f.scope}</td>
                  <td className="td text-xs">{f.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CertTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <div className="card py-8 text-center text-sm text-muted">{empty}</div>;
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white">
      <table className="w-full text-sm" data-testid="cert-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="th">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} data-testid="cert-row">
              {r.map((cell, j) => (
                <td key={j} className="td">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
