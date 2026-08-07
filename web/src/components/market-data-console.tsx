'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { importAssociationsAction, ingestSourceAction, recordForecastsAction, type MarketDataActionState } from '@/lib/market-data-actions';
import { ASSOCIATIONS } from '@/lib/associations';
import { ButtonContent } from '@/components/spinner';
import { ActionFeedback } from '@/components/action-feedback';

/**
 * Operator console for the external data connectors.
 *
 * Every source is listed — including the ones we cannot capture — so the
 * coverage gap is visible on the same screen as the coverage. A source that is
 * blocked by a paywall or bot protection is a fact about the market, and hiding
 * it would make the pipeline look more complete than it is.
 */

export interface SourceRow {
  id: string;
  name: string;
  kind: string;
  status: 'live' | 'manual' | 'blocked';
  licence: string;
  yields: string;
  docsUrl: string;
  ingestible: boolean;
  /**
   * Pre-formatted on the server. `toLocaleString()` in a client component
   * renders with the server's timezone during SSR and the browser's on hydration
   * — a guaranteed React hydration mismatch (#418).
   */
  lastRun: { status: string; startedAt: string; inserted: number; error: string | null } | null;
}

const STATUS_CLASS: Record<SourceRow['status'], string> = {
  live: 'badge-verified',
  manual: 'badge-pending',
  blocked: 'badge-neutral',
};

export function MarketDataConsole({ sources }: { sources: SourceRow[] }) {
  const t = useTranslations('marketData');
  const [state, action, pending] = useActionState<MarketDataActionState, FormData>(ingestSourceAction, {});
  const [recordState, recordAction, recording] = useActionState<MarketDataActionState, FormData>(async () => recordForecastsAction(), {});
  const [impState, impAction, importing] = useActionState<MarketDataActionState, FormData>(importAssociationsAction, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="source" value="all" />
          <button type="submit" className="btn-primary" disabled={pending} data-testid="run-all">
            <ButtonContent pending={pending} label={t('runAll')} busyLabel={t('running')} />
          </button>
              {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Ingestion finished" successDescription="Every run is written to the audit log, including failures." />
</form>
        <form action={recordAction}>
          <button type="submit" className="btn-ghost" disabled={recording} data-testid="record-forecasts">
            <ButtonContent pending={recording} label={t('recordForecasts')} busyLabel={t('running')} />
          </button>
        </form>
      </div>

      {state.summaries && (
        <ul className="space-y-1 text-sm" data-testid="ingest-result">
          {state.summaries.map((s) => (
            <li key={s.source} className={s.status === 'ok' ? 'text-ink' : 'text-danger'}>
              {s.status === 'ok'
                ? t('result', { source: s.source, inserted: s.inserted, fetched: s.fetched, skipped: s.skipped })
                : t('failed', { source: s.source, error: s.error ?? '' })}
            </li>
          ))}
        </ul>
      )}
      {recordState.recorded != null && (
        <p className="text-sm" data-testid="record-result">
          {t('recorded', { count: recordState.recorded })}
        </p>
      )}

      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">{t('source')}</th>
              <th className="th">{t('kind')}</th>
              <th className="th">{t('status')}</th>
              <th className="th">{t('lastRun')}</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} data-testid="source-row">
                <td className="td">
                  <a href={s.docsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
                    {s.name} ↗
                  </a>
                  <p className="mt-0.5 max-w-md text-xs font-normal text-muted">{s.yields}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{s.licence}</p>
                </td>
                <td className="td text-xs">{t(`kind_${s.kind}`)}</td>
                <td className="td">
                  <span className={STATUS_CLASS[s.status]}>{t(`status_${s.status}`)}</span>
                </td>
                <td className="td text-xs">
                  {s.lastRun ? (
                    <>
                      <span className={s.lastRun.status === 'ok' ? 'font-semibold' : 'font-semibold text-danger'}>{s.lastRun.status}</span>
                      <span className="ml-2 text-muted">{s.lastRun.startedAt}</span>
                      {s.lastRun.error && <p className="mt-0.5 max-w-xs text-[11px] text-danger">{s.lastRun.error}</p>}
                      {s.lastRun.status === 'ok' && <p className="mt-0.5 text-[11px] text-muted">{t('inserted')}: {s.lastRun.inserted}</p>}
                    </>
                  ) : (
                    <span className="text-muted">{t('never')}</span>
                  )}
                </td>
                <td className="td">
                  {s.ingestible && (
                    <form action={action}>
                      <input type="hidden" name="source" value={s.id} />
                      <button type="submit" className="btn-ghost !py-1.5 text-xs" disabled={pending}>
                        {t('run')}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Association member registers. Preview first, always — an import that
          silently creates 200 shell organisations is very hard to unpick. */}
      <section className="rounded-card border border-line bg-white" data-testid="association-import">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-sm font-bold">Trade association registers</h3>
            <p className="mt-0.5 text-xs text-muted">
              Imported companies land as drafts in the verification queue. Membership is not a GMP certificate.
            </p>
          </div>
          <div className="flex gap-2">
            <form action={impAction}>
              <input type="hidden" name="association" value="all" />
              <input type="hidden" name="mode" value="preview" />
              <button type="submit" className="btn-ghost !py-2 text-xs" disabled={importing} data-testid="import-preview">
                <ButtonContent pending={importing} label="Preview import" busyLabel="Fetching…" />
              </button>
            </form>
            <form action={impAction}>
              <input type="hidden" name="association" value="all" />
              <input type="hidden" name="mode" value="apply" />
              <button type="submit" className="btn-primary !py-2 text-xs" disabled={importing} data-testid="import-apply">
                Apply import
              </button>
            </form>
          </div>
        </div>

        <div className="divide-y divide-line">
          {ASSOCIATIONS.map((a) => {
            const result = impState.imports?.find((i) => i.association === a.id);
            return (
              <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3" data-testid="association-row">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {a.name} <span className="font-normal text-muted">— {a.fullName}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{a.evidences}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">{a.membersUrl}</p>
                </div>
                <div className="text-right text-xs">
                  {result ? (
                    result.status === 'ok' ? (
                      <>
                        <p className="font-semibold text-ok">
                          {result.found} members found
                        </p>
                        <p className="text-muted">
                          {result.created} new · {result.linked} matched existing · {result.skipped} skipped
                        </p>
                      </>
                    ) : (
                      <p className="font-semibold text-danger">{result.error}</p>
                    )
                  ) : (
                    <span className="text-muted">{a.rendering === 'client' ? 'Needs headless fetch' : 'Not run'}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {impState.imports && (
          <div className="border-t border-line bg-mist px-5 py-3 text-xs" data-testid="import-result">
            {impState.dryRun ? (
              <p className="font-semibold text-warn">
                Preview only — nothing was written. Use “Apply import” to create the draft organisations.
              </p>
            ) : (
              <p className="font-semibold text-ok">Import applied. New organisations are in the verification queue as drafts.</p>
            )}
          </div>
        )}
      </section>

      <div className="space-y-1 text-xs text-muted">
        <p>{t('manualNote')}</p>
        <p>{t('blockedNote')}</p>
      </div>
    </div>
  );
}
