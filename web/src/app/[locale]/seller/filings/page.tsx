import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { can, parseOrgStatus } from '@/lib/rbac';
import { certExpiryLevel, daysUntil, needsAttention } from '@/lib/compliance';
import { deleteFilingAction } from '@/lib/supplier-detail-actions';
import { FilingDialog } from '@/components/detail-rows';
import { ActionSubmit } from '@/components/action-submit';
import { VerificationBanner } from '@/components/verification-banner';

/**
 * A supplier's own regulatory filings.
 *
 * The supplier declares, ops verifies — the same division as certifications.
 * Nothing here can write an ops-controlled field, and `RegulatoryAction` is not
 * reachable from this page at all: an adverse finding is sourced from openFDA
 * and EudraGMDP precisely because a supplier cannot be trusted to disclose
 * their own import alert.
 */
export const dynamic = 'force-dynamic';

const EXPIRY_CLASS: Record<string, string> = {
  expired: 'badge-rejected',
  critical: 'badge-rejected',
  warning: 'badge-pending',
  soon: 'badge-pending',
  ok: 'badge-verified',
  unknown: 'badge-neutral',
};

export default async function SellerFilingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['seller', 'both']);
  const t = await getTranslations('filings');
  const format = await getFormatter();

  const [org, filings] = await Promise.all([
    user.orgId
      ? prisma.organization.findUnique({ where: { id: user.orgId }, select: { status: true, rejectedReason: true } })
      : null,
    prisma.regulatoryFiling.findMany({
      where: { orgId: user.orgId ?? '' },
      orderBy: [{ filingType: 'asc' }, { filingNumber: 'asc' }],
    }),
  ]);
  const allowed = can(user.principal, 'product:manage');

  const rows = filings.map((f) => ({ ...f, level: certExpiryLevel(f.expiresAt) }));
  const attention = rows.filter((r) => needsAttention(r.level));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('subtitle')}</p>
        </div>
        {allowed && <FilingDialog trigger={`＋ ${t('addTitle')}`} />}
      </div>

      {org && <VerificationBanner status={parseOrgStatus(org.status)} role={user.role} reason={org.rejectedReason} />}

      {attention.length > 0 && (
        <div className="mb-5 rounded-card border border-warn/40 bg-warn-pale px-4 py-3 text-sm" data-testid="filings-attention">
          <p className="font-bold">⚠ {t('attention', { n: attention.length })}</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {attention.map((f) => (
              <li key={f.id}>
                {f.filingType} {f.filingNumber} — {f.expiresAt ? t('daysLeft', { n: daysUntil(f.expiresAt) }) : t('noExpiry')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-sm text-muted">{t('empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr>
                <th className="th">{t('type')}</th>
                <th className="th">{t('number')}</th>
                <th className="th">{t('product')}</th>
                <th className="th">{t('status')}</th>
                <th className="th">{t('expires')}</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} data-testid="filing-manage-row">
                  <td className="td text-xs font-semibold">{f.filingType}</td>
                  <td className="td font-mono text-xs">
                    {f.filingNumber}
                    {f.openToReference && <span className="ml-1.5 badge-info">{t('openToReference')}</span>}
                  </td>
                  <td className="td text-xs">{f.productName ?? <span className="text-muted">—</span>}</td>
                  <td className="td text-xs">{f.status}</td>
                  <td className="td">
                    {/* No expiry is a real answer for a DMF, and it reads as
                        unknown rather than as a clean bill of health. */}
                    <span className={EXPIRY_CLASS[f.level] ?? 'badge-neutral'} data-testid={`manage-expiry-${f.level}`}>
                      {f.expiresAt ? format.dateTime(f.expiresAt, { year: 'numeric', month: 'short' }) : t('noExpiry')}
                    </span>
                  </td>
                  <td className="td">
                    {allowed && (
                      <div className="flex items-center gap-2">
                        <FilingDialog trigger={t('edit')} filing={f} />
                        <form action={deleteFilingAction}>
                          <input type="hidden" name="id" value={f.id} />
                          <ActionSubmit
                            label={t('delete')}
                            className="whitespace-nowrap rounded-control border border-danger/40 px-2.5 py-1 text-xs font-semibold text-danger transition hover:bg-danger-pale disabled:opacity-50"
                            testId={`delete-filing-${f.id}`}
                            confirm={t('confirmDelete', { number: f.filingNumber })}
                          />
                        </form>
                      </div>
                    )}
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
