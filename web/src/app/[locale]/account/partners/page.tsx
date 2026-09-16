import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/session';
import { getRepresentingPartners } from '@/lib/partner-queries';
import { revokeRepresentationAction } from '@/lib/partner-actions';
import { TIER_BADGE_CLASS } from '@/lib/partner';
import { GrantPartnerForm } from '@/components/grant-partner-form';
import { ActionForm } from '@/components/action-form';
import { ActionSubmit } from '@/components/action-submit';

// Renders per-user data (session, representations) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';

export default async function AccountPartnersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['buyer', 'seller', 'both']);
  const t = await getTranslations('partnerHub');

  const reps = user.orgId ? await getRepresentingPartners(user.orgId) : [];
  const active = reps.filter((r) => !r.revokedAt);
  const past = reps.filter((r) => r.revokedAt);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('subtitle')}</p>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-bold">{t('grantTitle')}</h2>
        <GrantPartnerForm />
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold">{t('activeTitle')}</h2>
        {active.length === 0 ? (
          <div className="card py-10 text-center text-sm text-muted" data-testid="no-active-partners">
            {t('noActivePartners')}
          </div>
        ) : (
          <ul className="space-y-2">
            {active.map((r) => (
              <li key={r.representationId} className="card flex flex-wrap items-center justify-between gap-3" data-testid="active-partner-row">
                <div>
                  <p className="text-sm font-bold">
                    {r.partnerName} <span className={`${TIER_BADGE_CLASS} ml-1.5`}>{t(`tier_${r.tier}`)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {r.partnerCountry} · {t('scopesLabel')}: {r.scopes.split(',').map((s) => t(`scope_${s}`)).join(', ')}
                  </p>
                </div>
                <ActionForm action={revokeRepresentationAction}>
                  <input type="hidden" name="representationId" value={r.representationId} />
                  <ActionSubmit
                    label={t('revoke')}
                    className="whitespace-nowrap rounded-control border border-danger/40 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger-pale disabled:opacity-50"
                    testId={`revoke-${r.representationId}`}
                    confirm={t('confirmRevoke', { name: r.partnerName })}
                  />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-bold">{t('pastTitle')}</h2>
          <ul className="space-y-2">
            {past.map((r) => (
              <li key={r.representationId} className="card flex items-center justify-between gap-3 opacity-60" data-testid="past-partner-row">
                <p className="text-sm font-semibold">{r.partnerName}</p>
                <span className="badge-neutral">{t('revoked')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
