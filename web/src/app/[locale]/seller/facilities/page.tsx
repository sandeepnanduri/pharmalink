import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { can, parseOrgStatus } from '@/lib/rbac';
import { deleteFacilityAction } from '@/lib/supplier-detail-actions';
import { outcomeLevel, type OutcomeLevel } from '@/lib/vocab';
import { FacilityDialog } from '@/components/detail-rows';
import { ActionSubmit } from '@/components/action-submit';
import { VerificationBanner } from '@/components/verification-banner';

/**
 * A supplier's own manufacturing facilities.
 *
 * Sites were previously creatable only inside the onboarding wizard, so a
 * supplier who commissioned a plant in year two had nowhere to record it — and
 * a GMP certificate has to name one specific site to be checkable at all.
 */
export const dynamic = 'force-dynamic';

const OUTCOME_CLASS: Record<OutcomeLevel, string> = {
  ok: 'badge-verified',
  warning: 'badge-pending',
  critical: 'badge-rejected',
  unknown: 'badge-neutral',
};

export default async function SellerFacilitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['seller', 'both']);
  const t = await getTranslations('facilities');
  const format = await getFormatter();

  const [org, sites] = await Promise.all([
    user.orgId
      ? prisma.organization.findUnique({ where: { id: user.orgId }, select: { status: true, rejectedReason: true } })
      : null,
    prisma.site.findMany({
      where: { orgId: user.orgId ?? '' },
      orderBy: { name: 'asc' },
      include: { certifications: { select: { id: true, name: true } } },
    }),
  ]);
  const allowed = can(user.principal, 'product:manage');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('subtitle')}</p>
        </div>
        {allowed && <FacilityDialog trigger={`＋ ${t('addTitle')}`} />}
      </div>

      {org && <VerificationBanner status={parseOrgStatus(org.status)} role={user.role} reason={org.rejectedReason} />}

      {sites.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-sm text-muted">{t('empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr>
                <th className="th">{t('name')}</th>
                <th className="th">{t('fei')}</th>
                <th className="th">{t('gmp')}</th>
                <th className="th">{t('lastFdaInspection')}</th>
                <th className="th">{t('capacity')}</th>
                <th className="th">{t('certificates')}</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id} data-testid="facility-manage-row">
                  <td className="td">
                    <span className="font-semibold">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {[s.city, s.country].filter(Boolean).join(', ')} · {s.siteType}
                    </span>
                  </td>
                  <td className="td font-mono text-xs">{s.regulatoryId ?? '—'}</td>
                  <td className="td text-xs">{s.fdaGmpStatus ?? '—'}</td>
                  <td className="td">
                    {s.fdaInspectionOutcome ? (
                      <span className={OUTCOME_CLASS[outcomeLevel(s.fdaInspectionOutcome)]}>{s.fdaInspectionOutcome}</span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                    {s.lastFdaInspectionAt && (
                      <span className="ml-1.5 font-mono text-xs text-muted">
                        {format.dateTime(s.lastFdaInspectionAt, { year: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </td>
                  <td className="td font-mono text-xs">
                    {s.capacityValue != null ? `${s.capacityValue} ${s.capacityUnit ?? ''}`.trim() : '—'}
                  </td>
                  <td className="td text-xs">
                    {s.certifications.length > 0 ? (
                      <span className="badge-info">{t('certCount', { n: s.certifications.length })}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="td">
                    {allowed && (
                      <div className="flex items-center gap-2">
                        <FacilityDialog trigger={t('edit')} facility={s} />
                        {/* A certificate names one specific site. Deleting the
                            site would leave a GMP claim pointing nowhere, which
                            is worse than a stale row — so the control is absent
                            rather than present and failing silently. */}
                        {s.certifications.length === 0 && (
                          <form action={deleteFacilityAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <ActionSubmit
                              label={t('delete')}
                              className="whitespace-nowrap rounded-control border border-danger/40 px-2.5 py-1 text-xs font-semibold text-danger transition hover:bg-danger-pale disabled:opacity-50"
                              testId={`delete-facility-${s.id}`}
                              confirm={t('confirmDelete', { name: s.name })}
                            />
                          </form>
                        )}
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
