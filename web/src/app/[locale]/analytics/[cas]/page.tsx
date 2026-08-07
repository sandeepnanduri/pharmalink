import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { Link, redirect } from '@/i18n/routing';
import { isPlatformRole } from '@/lib/rbac';
import { getMoleculeIntelligence } from '@/lib/forecast-queries';
import { deltaLabel } from '@/lib/pricing';
import { StatCard } from '@/components/stat-card';
import { PriceChart } from '@/components/price-chart';
import { ConfidenceBadge, RiskBadge } from '@/components/forecast-badges';

export const dynamic = 'force-dynamic';

/**
 * Per-molecule prediction detail: the chart, why the model was chosen, what
 * correlates with the price, the supply-side risk, and where every number came
 * from.
 *
 * An unknown CAS renders an empty state rather than a 404. A molecule we hold
 * no observations for is a real molecule we do not cover yet — which is exactly
 * what the page should say — and this segment sits under `analytics/loading.tsx`,
 * where `notFound()` would only produce a soft 404 anyway.
 */
export default async function MoleculeForecastPage({ params }: { params: Promise<{ locale: string; cas: string }> }) {
  const { locale, cas: rawCas } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  if (isPlatformRole(user.role)) redirect({ href: '/admin', locale });

  const t = await getTranslations('analytics');
  const cas = decodeURIComponent(rawCas);
  const intel = await getMoleculeIntelligence(cas);

  if (!intel) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/analytics" className="text-xs font-semibold text-brand hover:underline">
          ← {t('backToAnalytics')}
        </Link>
        <h1 className="mt-3 text-2xl font-extrabold">{cas}</h1>
        <div className="card mt-5 py-10 text-center" data-testid="no-observations">
          <p className="text-sm font-semibold">{t('noObservationsTitle')}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">{t('noObservationsBody')}</p>
        </div>
      </div>
    );
  }

  const format = await getFormatter();
  const f = intel.forecast;
  const last = f.history.at(-1) ?? null;
  const next = f.points[0] ?? null;
  const changePct = next && last && last.value > 0 ? Math.round(((next.p50 - last.value) / last.value) * 1000) / 10 : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/analytics" className="text-xs font-semibold text-brand hover:underline">
        ← {t('backToAnalytics')}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">{intel.productName}</h1>
        <span className="font-mono text-sm text-muted">{cas}</span>
        <ConfidenceBadge confidence={f.confidence} label={t(`conf_${f.confidence}`)} />
        <RiskBadge band={intel.risk.band} label={`${intel.risk.score}/100 ${t(`risk_${intel.risk.band}`)}`} />
      </div>

      {/* Headline numbers */}
      <div className="mb-6 mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('latestPrice')} value={last ? `$${last.value}` : '—'} hint={last?.period} testId="latest-price" />
        <StatCard
          label={t('nextMonth')}
          value={next ? `$${next.p50}` : '—'}
          hint={next ? `${t('range')}: $${next.p10} – $${next.p90}` : undefined}
          testId="next-price"
        />
        <StatCard label={t('change')} value={changePct != null ? deltaLabel(changePct) : '—'} hint={next?.period} />
        <StatCard
          label={t('accuracy')}
          value={f.accuracy ? `${f.accuracy.mape}%` : '—'}
          hint={f.accuracy ? `${f.accuracy.folds} folds · ${Math.round(f.accuracy.coverage * 100)}% ${t('withinBand').toLowerCase()}` : undefined}
          testId="backtest-mape"
        />
      </div>

      {/* Chart + method */}
      <section className="card mb-8" data-testid="forecast-chart">
        {f.status === 'insufficient_data' ? (
          <div className="py-6 text-center">
            <p className="text-sm font-semibold">{t('insufficientTitle')}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">{t('insufficientBody')}</p>
          </div>
        ) : (
          <PriceChart history={f.history} forecast={f.points} logAxisLabel={t('logScale')} />
        )}

        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('methodology')}</p>
          <dl className="mb-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('modelLabel')}</dt>
              <dd className="font-semibold">{f.model ? t(`model_${f.model}`) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted" title={t('smoothingHint')}>
                {t('smoothing')}
              </dt>
              <dd className="font-semibold tabular-nums">{f.alpha != null ? f.alpha.toFixed(2) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('monthsOfHistory')}</dt>
              <dd className="font-semibold tabular-nums">{f.history.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('dataPoints')}</dt>
              <dd className="font-semibold tabular-nums">{f.observations}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('volatility')}</dt>
              <dd className="font-semibold tabular-nums">{f.volatilityPct}%</dd>
            </div>
          </dl>
          <ul className="space-y-1 text-xs text-muted">
            {f.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
            {intel.hs && (
              <li>
                ·{' '}
                {t(intel.hs.specificity === 'narrow' ? 'hsNoteNarrow' : 'hsNoteGroup', {
                  code: intel.hs.code,
                  description: intel.hs.description,
                })}
              </li>
            )}
          </ul>
        </div>
      </section>

      {/* Drivers */}
      <section className="mb-8" data-testid="price-drivers">
        <h2 className="mb-1 text-base font-bold">{t('driversTitle')}</h2>
        <p className="mb-3 max-w-3xl text-xs text-muted">{t('driversNote')}</p>
        {intel.drivers.length === 0 ? (
          <div className="card py-6 text-center text-sm text-muted">{t('noDrivers')}</div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">{t('driver')}</th>
                  <th className="th">{t('correlation')}</th>
                  <th className="th">{t('lag')}</th>
                  <th className="th">{t('overlap')}</th>
                  <th className="th">{t('latestValue')}</th>
                </tr>
              </thead>
              <tbody>
                {intel.drivers.map((d) => (
                  <tr key={d.key} data-testid="driver-row">
                    <td className="td font-semibold">{d.label}</td>
                    <td className="td font-mono">
                      {d.r > 0 ? '+' : ''}
                      {d.r}
                      <span className="ml-2 text-[11px] font-normal text-muted">{d.strength}</span>
                    </td>
                    <td className="td text-xs">{d.lag === 0 ? t('sameMonth') : t('lagMonths', { count: d.lag })}</td>
                    <td className="td tabular-nums">{d.n}</td>
                    <td className="td font-mono text-xs">
                      {d.latest != null ? d.latest.toFixed(2) : '—'}
                      {d.changePct != null && <span className="ml-2 text-muted">{deltaLabel(d.changePct)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Supply risk */}
      <section className="mb-8" data-testid="supply-risk">
        <h2 className="mb-1 text-base font-bold">{t('supplyRiskTitle')}</h2>
        <p className="mb-3 max-w-3xl text-xs text-muted">{t('supplyRiskNote')}</p>
        <div className="card">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('riskLabel')}</p>
              <p className="font-display text-3xl font-extrabold tabular-nums">{intel.risk.score}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('concentration')}</p>
              <p className="mt-1 text-sm font-semibold">{t(`conc_${intel.risk.concentration}`)}</p>
              <p className="text-xs text-muted">HHI {intel.risk.hhi}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('knownSuppliers')}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{intel.risk.supplierCount}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('eventPressure')}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{intel.risk.eventPressure}/100</p>
            </div>
          </div>
          <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-muted">
            {intel.risk.reasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Supply events */}
      <section className="mb-8" data-testid="supply-events">
        <h2 className="mb-3 text-base font-bold">{t('eventsTitle')}</h2>
        {intel.events.length === 0 ? (
          <div className="card py-6 text-center text-sm text-muted">{t('noEvents')}</div>
        ) : (
          <ul className="space-y-2">
            {intel.events.map((e) => (
              <li key={`${e.eventType}-${e.subject}-${e.occurredAt.toISOString()}`} className="card flex flex-wrap items-start gap-3 py-3">
                <span className={e.severity === 'high' ? 'badge-rejected' : e.severity === 'medium' ? 'badge-pending' : 'badge-neutral'}>
                  {t(`eventType_${e.eventType}`)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{e.subject}</p>
                  <p className="text-xs text-muted">
                    {e.company ? `${e.company} · ` : ''}
                    {format.dateTime(e.occurredAt, { dateStyle: 'medium' })}
                  </p>
                </div>
                {e.sourceUrl && (
                  <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand hover:underline">
                    {t('source')} ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Provenance */}
      <section data-testid="provenance">
        <h2 className="mb-1 text-base font-bold">{t('provenanceTitle')}</h2>
        <p className="mb-3 text-xs text-muted">{t('provenanceNote')}</p>
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">{t('source')}</th>
                <th className="th">{t('observations')}</th>
                <th className="th">{t('coverage')}</th>
              </tr>
            </thead>
            <tbody>
              {intel.provenance.map((p) => (
                <tr key={p.sourceName} data-testid="provenance-row">
                  <td className="td">
                    {p.sourceUrl ? (
                      <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
                        {p.sourceName} ↗
                      </a>
                    ) : (
                      <span className="font-semibold">{p.sourceName}</span>
                    )}
                  </td>
                  <td className="td tabular-nums">{p.observations}</td>
                  <td className="td text-xs text-muted">
                    {format.dateTime(p.firstSeen, { dateStyle: 'medium' })} – {format.dateTime(p.lastSeen, { dateStyle: 'medium' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
