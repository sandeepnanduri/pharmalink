import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { can, opsLanding } from '@/lib/rbac';
import { requireUser } from '@/lib/session';
import { setPartnerGoodStandingAction } from '@/lib/partner-actions';
import { listPartnersForAdmin } from '@/lib/partner-queries';
import { TIER_BADGE_CLASS } from '@/lib/partner';
import { ActionForm } from '@/components/action-form';
import { ActionSubmit } from '@/components/action-submit';

// Renders per-user data (session) — must never be served from the static/full route cache.
export const dynamic = 'force-dynamic';

/**
 * The only screen that lists already-active Sourcing Partners (the ops
 * verification queue at /admin only shows orgs still pending initial
 * review). Its one job: toggle Partner.goodStanding — the ops-revocable
 * stand-in for the product roadmap's "0 disputes" tier criterion, since
 * this app has no Dispute model. Tier itself is never editable here — it's
 * computed (lib/partner.ts's eligibleTier, via recomputeTier), never
 * hand-set.
 */
export default async function AdminPartnersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireUser(locale);
  if (!can(actor.principal, 'admin:verify')) redirect({ href: opsLanding(actor.role), locale });
  const t = await getTranslations('adminPartners');

  const partners = await listPartnersForAdmin();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t('subtitle')}</p>

      {partners.length === 0 ? (
        <div className="card py-12 text-center text-sm text-muted" data-testid="empty-partners">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">{t('org')}</th>
                <th className="th">{t('tier')}</th>
                <th className="th">{t('mandatesCompleted')}</th>
                <th className="th">{t('standing')}</th>
                <th className="th">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id} data-testid="partner-row">
                  <td className="td text-sm font-semibold">{p.orgName}</td>
                  <td className="td">
                    <span className={TIER_BADGE_CLASS}>{t(`tier_${p.tier}`)}</span>
                  </td>
                  <td className="td text-sm text-muted">{p.mandatesCompleted}</td>
                  <td className="td">
                    <span className={p.goodStanding ? 'badge-verified' : 'badge-rejected'}>
                      {p.goodStanding ? t('goodStanding') : t('flagged')}
                    </span>
                  </td>
                  <td className="td">
                    <ActionForm action={setPartnerGoodStandingAction}>
                      <input type="hidden" name="partnerId" value={p.id} />
                      <input type="hidden" name="goodStanding" value={p.goodStanding ? 'false' : 'true'} />
                      <ActionSubmit
                        label={p.goodStanding ? t('flagAction') : t('restoreAction')}
                        className={p.goodStanding ? 'rounded-control border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger-pale' : 'btn-primary !py-1.5 text-xs'}
                        testId={`standing-toggle-${p.id}`}
                        confirm={p.goodStanding ? t('confirmFlag', { name: p.orgName }) : undefined}
                      />
                    </ActionForm>
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
