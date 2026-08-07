import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { Link, redirect } from '@/i18n/routing';
import { canBuy, canSell, isPlatformRole } from '@/lib/rbac';
import { getMarketPriceIndex, getBuyerSpend, getSellerCompetitiveness } from '@/lib/pricing-queries';
import { getForecastOverview, getForecastScoreboard } from '@/lib/forecast-queries';
import { deltaLabel } from '@/lib/pricing';
import { StatCard } from '@/components/stat-card';
import { ConfidenceBadge, RiskBadge } from '@/components/forecast-badges';

export const dynamic = 'force-dynamic';

/** Price intelligence + spend analytics — computed from real quotes and deals. */
export default async function AnalyticsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  if (isPlatformRole(user.role)) redirect({ href: '/admin', locale });

  const t = await getTranslations('analytics');
  const format = await getFormatter();
  const usd = (n: number) => `$${n.toLocaleString()}`;

  const [index, spend, competitiveness, forecasts, scoreboard] = await Promise.all([
    getMarketPriceIndex(),
    canBuy(user.role) && user.orgId ? getBuyerSpend(user.orgId) : null,
    canSell(user.role) && user.orgId ? getSellerCompetitiveness(user.orgId) : null,
    getForecastOverview(),
    getForecastScoreboard(10),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('subtitle')}</p>

      {/* Forecast — the predictive layer, ahead of the descriptive ones. */}
      <section className="mb-10" data-testid="forecast-overview">
        <h2 className="mb-1 text-base font-bold">{t('forecastTitle')}</h2>
        <p className="mb-3 max-w-3xl text-xs text-muted">{t('forecastNote')}</p>
        {forecasts.length === 0 ? (
          <div className="card py-8 text-center text-sm text-muted">{t('noForecastData')}</div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">{t('molecule')}</th>
                  <th className="th">{t('latestPrice')}</th>
                  <th className="th">{t('nextMonth')}</th>
                  <th className="th">{t('range')}</th>
                  <th className="th">{t('change')}</th>
                  <th className="th">{t('confidence')}</th>
                  <th className="th">{t('riskLabel')}</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f) => (
                  <tr key={f.cas} data-testid="forecast-row">
                    <td className="td">
                      <span className="font-semibold">{f.productName}</span>
                      <span className="ml-2 font-mono text-[11px] text-muted">{f.cas}</span>
                    </td>
                    <td className="td font-mono">{f.latest != null ? `$${f.latest}` : '—'}</td>
                    <td className="td font-mono font-bold text-brand">{f.next ? `$${f.next.p50}` : '—'}</td>
                    <td className="td font-mono text-xs text-muted">{f.next ? `$${f.next.p10} – $${f.next.p90}` : '—'}</td>
                    <td className="td font-mono">{f.changePct != null ? deltaLabel(f.changePct) : '—'}</td>
                    <td className="td">
                      <ConfidenceBadge confidence={f.confidence} label={t(`conf_${f.confidence}`)} />
                    </td>
                    <td className="td">
                      <RiskBadge band={f.riskBand} label={`${f.riskScore} ${t(`risk_${f.riskBand}`)}`} />
                    </td>
                    <td className="td">
                      <Link href={`/analytics/${encodeURIComponent(f.cas)}`} className="text-xs font-semibold text-brand hover:underline">
                        {t('viewDetail')} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* The scoreboard: past forecasts vs what actually happened. */}
      <section className="mb-10" data-testid="forecast-scoreboard">
        <h2 className="mb-1 text-base font-bold">{t('scoreboardTitle')}</h2>
        <p className="mb-3 text-xs text-muted">{t('scoreboardNote')}</p>
        {scoreboard.length === 0 ? (
          <div className="card py-6 text-center text-sm text-muted">{t('noScoreboard')}</div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">{t('molecule')}</th>
                  <th className="th">{t('issued')}</th>
                  <th className="th">{t('predicted')}</th>
                  <th className="th">{t('range')}</th>
                  <th className="th">{t('actual')}</th>
                  <th className="th">{t('errorPct')}</th>
                  <th className="th">{t('withinBand')}</th>
                </tr>
              </thead>
              <tbody>
                {scoreboard.map((s) => (
                  <tr key={`${s.cas}-${s.horizonMonth.toISOString()}-${s.issuedAt.toISOString()}`} data-testid="scoreboard-row">
                    <td className="td font-semibold">
                      {s.productName} <span className="text-xs font-normal text-muted">{t('forMonth', { period: s.horizonMonth.toISOString().slice(0, 7) })}</span>
                    </td>
                    <td className="td text-xs text-muted">{format.dateTime(s.issuedAt, { dateStyle: 'medium' })}</td>
                    <td className="td font-mono">${s.p50}</td>
                    <td className="td font-mono text-xs text-muted">
                      ${s.p10} – ${s.p90}
                    </td>
                    <td className="td font-mono">${s.actual}</td>
                    <td className="td font-mono">{deltaLabel(s.errorPct)}</td>
                    <td className="td">
                      <span className={s.withinBand ? 'badge-verified' : 'badge-rejected'}>{s.withinBand ? t('yes') : t('no')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Buyer: real spend */}
      {spend && (
        <section className="mb-10" data-testid="buyer-spend">
          <h2 className="mb-3 text-base font-bold">{t('yourSpend')}</h2>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <StatCard label={t('totalSpend')} value={usd(spend.total)} testId="total-spend" />
            <StatCard label={t('deals')} value={spend.dealCount} />
            <StatCard label={t('products')} value={spend.products.length} />
          </div>
          {spend.products.length > 0 && (
            <div className="overflow-x-auto rounded-card border border-line bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="th">{t('product')}</th>
                    <th className="th">{t('spend')}</th>
                    <th className="th">{t('share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {spend.products.map((p) => (
                    <tr key={p.name}>
                      <td className="td font-semibold">{p.name}</td>
                      <td className="td font-mono">{usd(p.value)}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-surface">
                            <div className="h-full bg-brand" style={{ width: `${Math.round((p.value / spend.total) * 100)}%` }} />
                          </div>
                          <span className="text-xs text-muted">{Math.round((p.value / spend.total) * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Seller: price competitiveness vs the real market */}
      {competitiveness && (
        <section className="mb-10" data-testid="seller-competitiveness">
          <h2 className="mb-3 text-base font-bold">{t('competitiveness')}</h2>
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">{t('product')}</th>
                  <th className="th">{t('yourPrice')}</th>
                  <th className="th">{t('marketAvg')}</th>
                  <th className="th">{t('vsMarket')}</th>
                </tr>
              </thead>
              <tbody>
                {competitiveness.map((p) => (
                  <tr key={p.id} data-testid="competitiveness-row">
                    <td className="td font-semibold">{p.name}</td>
                    <td className="td font-mono">{p.myPrice ? `$${p.myPrice}/kg` : '—'}</td>
                    <td className="td font-mono">{p.band.count > 0 ? `$${p.band.avg}/kg` : '—'}</td>
                    <td className="td">
                      {p.cmp ? (
                        <span
                          className={
                            p.cmp.position === 'below' ? 'badge-verified' : p.cmp.position === 'above' ? 'badge-rejected' : 'badge-neutral'
                          }
                        >
                          {deltaLabel(p.cmp.deltaPct)} {t(`pos_${p.cmp.position}`)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">{t('noMarket')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Shared: market price index (real quotes) */}
      <section data-testid="market-index">
        <h2 className="mb-1 text-base font-bold">{t('marketIndex')}</h2>
        <p className="mb-3 text-xs text-muted">{t('marketIndexNote')}</p>
        {index.length === 0 ? (
          <div className="card py-8 text-center text-sm text-muted">{t('noQuotes')}</div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">{t('product')}</th>
                  <th className="th">CAS</th>
                  <th className="th">{t('quotes')}</th>
                  <th className="th">{t('low')}</th>
                  <th className="th">{t('avg')}</th>
                  <th className="th">{t('high')}</th>
                </tr>
              </thead>
              <tbody>
                {index.map((r) => (
                  <tr key={r.cas} data-testid="index-row">
                    <td className="td font-semibold">{r.productName}</td>
                    <td className="td font-mono text-xs">{r.cas}</td>
                    <td className="td">{r.band.count}</td>
                    <td className="td font-mono">${r.band.min}</td>
                    <td className="td font-mono font-bold text-brand">${r.band.avg}</td>
                    <td className="td font-mono">${r.band.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">{format.dateTime(new Date(), { dateStyle: 'medium' })}</p>
      </section>
    </div>
  );
}
