import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/session';
import { getPartnerIncentives, type IncentiveMilestone } from '@/lib/partner-queries';

// Renders per-user data (session, milestone progress) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';

function titleKey(m: IncentiveMilestone): string {
  if (m.key === 'breadth_bonus') return `breadthTitle${m.tier}`;
  return `${m.key.replace('_bonus', '')}Title`;
}

function descKey(m: IncentiveMilestone): string {
  if (m.key === 'breadth_bonus') return `breadthDesc${m.tier}`;
  return `${m.key.replace('_bonus', '')}Desc`;
}

export default async function PartnerRewardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['partner']);
  const t = await getTranslations('partnerRewards');

  const milestones = user.orgId ? await getPartnerIncentives(user.orgId) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('subtitle')}</p>

      <div className="mb-6 flex items-center gap-2.5 rounded-panel border border-line bg-white px-4 py-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.5h.01" strokeLinecap="round" />
        </svg>
        <p className="text-xs text-slate2">{t('boundaryNote')}</p>
      </div>

      {!milestones ? (
        <div className="card py-12 text-center text-sm text-muted" data-testid="no-partner-record">
          {t('noPartnerRecord')}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {milestones.map((m) => (
            <div key={`${m.key}-${m.tier ?? ''}`} className="card" data-testid="incentive-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{t(titleKey(m))}</p>
                  <p className="mt-0.5 text-xs text-muted">{t(descKey(m))}</p>
                </div>
                {m.earned ? (
                  <span className="badge-verified shrink-0">{t('earned')}</span>
                ) : (
                  <span className="badge-neutral shrink-0">
                    {m.current}/{m.target}
                  </span>
                )}
              </div>
              <p className="mt-3 font-mono text-sm font-extrabold text-violet-deep">
                ${m.rewardUsd}
                <span className="ml-1 font-sans text-[11px] font-semibold text-muted">{t('rewardSuffix')}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
