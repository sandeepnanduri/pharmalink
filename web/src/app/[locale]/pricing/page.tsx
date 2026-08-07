import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { currentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { changePlanAction } from '@/lib/actions';
import { PLANS, ENTITLEMENTS, parsePlan, type Plan, type Entitlements } from '@/lib/plans';

// Renders per-user data (session, org plan, quotas) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';


const FEATURE_ROWS: { key: keyof Entitlements; label: string }[] = [
  { key: 'rfqsPerMonth', label: 'rfqsPerMonth' },
  { key: 'liveListings', label: 'liveListings' },
  { key: 'seats', label: 'seats' },
  { key: 'verificationSlaHours', label: 'verificationSla' },
  { key: 'featuredPlacement', label: 'featuredPlacement' },
  { key: 'exportComparison', label: 'exportComparison' },
  { key: 'priceBenchmarks', label: 'priceBenchmarks' },
  { key: 'whatsappNotifications', label: 'whatsappNotifications' },
  { key: 'samlSso', label: 'samlSso' },
  { key: 'teamApprovals', label: 'teamApprovals' },
  { key: 'apiAccess', label: 'apiAccess' },
  { key: 'auditExport', label: 'auditExport' },
];

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('plans');

  const user = await currentUser();
  const org = user?.orgId
    ? await prisma.organization.findUnique({ where: { id: user.orgId }, select: { plan: true } })
    : null;
  const current: Plan | null = org ? parsePlan(org.plan) : null;

  function cell(plan: Plan, key: keyof Entitlements) {
    const v = ENTITLEMENTS[plan][key];
    if (key === 'verificationSlaHours') return t('hours', { n: v as number });
    if (v === null) return t('unlimited');
    if (v === true) return <span className="font-bold text-ok">✓</span>;
    if (v === false) return <span className="text-muted">—</span>;
    return String(v);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('subtitle')}</p>
      <p className="mt-3">
        <span className="badge-verified text-xs">✓ {t('noCommission')}</span>
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const e = ENTITLEMENTS[plan];
          const isCurrent = current === plan;
          const highlight = plan === 'growth';
          return (
            <div
              key={plan}
              data-testid={`plan-card-${plan}`}
              className={`card relative flex flex-col ${highlight ? 'border-2 border-brand shadow-lift' : ''}`}
            >
              {isCurrent && (
                <span className="badge-info absolute -top-2.5 left-5" data-testid="current-plan-badge">
                  {t('currentPlan')}
                </span>
              )}
              <h2 className="font-display text-lg font-extrabold">{t(plan)}</h2>
              <p className="mt-1 text-xs text-muted">{t(`${plan}Tag`)}</p>

              <p className="mt-4">
                {e.priceUsd === null ? (
                  <span className="font-display text-3xl font-extrabold">{t('custom')}</span>
                ) : (
                  <>
                    <span className="font-display text-4xl font-extrabold tabular-nums">${e.priceUsd}</span>
                    <span className="text-sm text-muted">{t('perMonth')}</span>
                  </>
                )}
              </p>

              <div className="mt-5 flex-1">
                {isCurrent ? (
                  <button type="button" disabled className="btn-ghost w-full">
                    {t('currentPlan')}
                  </button>
                ) : plan === 'enterprise' ? (
                  <a href="mailto:sales@pharmalink.global" className="btn-ghost w-full">
                    {t('contactSales')}
                  </a>
                ) : user ? (
                  <form action={changePlanAction}>
                    <input type="hidden" name="plan" value={plan} />
                    <button type="submit" className={highlight ? 'btn-primary w-full' : 'btn-ghost w-full'} data-testid={`choose-${plan}`}>
                      {t('choose', { plan: t(plan) })}
                    </button>
                  </form>
                ) : (
                  <Link href="/signup" className={highlight ? 'btn-primary w-full' : 'btn-ghost w-full'}>
                    {t('choose', { plan: t(plan) })}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison matrix */}
      <div className="mt-10 overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr>
              <th className="th">&nbsp;</th>
              {PLANS.map((p) => (
                <th key={p} className="th text-center">
                  {t(p)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_ROWS.map((row) => (
              <tr key={row.key}>
                <td className="td font-semibold text-slate2">{t(row.label)}</td>
                {PLANS.map((p) => (
                  <td key={p} className="td text-center">
                    {cell(p, row.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
