import { getTranslations, getFormatter, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/session';
import { getPartnerNetwork } from '@/lib/partner-queries';

// orgKind is 'buyer' | 'seller' | 'both' | 'partner' — 'seller' and 'partner'
// both bucket with "supplier's agent" here (matching getPartnerNetwork's own
// non-buyer treatment of cert lookups), but 'both' gets its own label rather
// than silently falling into either bucket.
const RELATIONSHIP_LABEL: Record<string, string> = {
  buyer: 'representingBuyer',
  both: 'representingBoth',
};

const CERT_BADGE: Record<string, string> = {
  expired: 'badge-rejected',
  critical: 'badge-rejected',
  warning: 'badge-pending',
  soon: 'badge-pending',
  ok: 'badge-verified',
  unknown: 'badge-neutral',
};

// Renders per-user data (session, representations) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';

export default async function PartnerNetworkPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['partner']);
  const t = await getTranslations('partnerNetwork');
  const format = await getFormatter();

  const rows = user.orgId ? await getPartnerNetwork(user.orgId) : [];
  const active = rows.filter((r) => !r.revokedAt);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle', { count: active.length })}</p>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="card py-14 text-center text-sm text-muted" data-testid="no-network">
          <p className="font-semibold text-txt">{t('emptyTitle')}</p>
          <p className="mx-auto mt-1.5 max-w-md">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">{t('colOrg')}</th>
                <th className="th">{t('colRelationship')}</th>
                <th className="th">{t('colCert')}</th>
                <th className="th">{t('colActivity')}</th>
              </tr>
            </thead>
            <tbody>
              {active.map((r) => (
                <tr key={r.representationId} data-testid="network-row">
                  <td className="td">
                    <p className="font-semibold">{r.orgName}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {r.city ? `${r.city}, ${r.country}` : r.country}
                    </p>
                  </td>
                  <td className="td">
                    <span className="badge-violet">{t(RELATIONSHIP_LABEL[r.orgKind] ?? 'representingSupplier')}</span>
                  </td>
                  <td className="td">
                    {r.cert ? (
                      <span className={CERT_BADGE[r.cert.level]}>
                        {r.cert.name}
                        {r.cert.expiresAt ? ` · ${format.dateTime(r.cert.expiresAt, { dateStyle: 'medium' })}` : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">{t('naForBuyer')}</span>
                    )}
                  </td>
                  <td className="td text-xs text-slate2">
                    {r.lastActivityAt ? format.relativeTime(r.lastActivityAt) : t('noActivityYet')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
