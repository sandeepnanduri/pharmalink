import { useTranslations } from 'next-intl';
import type { MatchResult } from '@/lib/match-score';

/**
 * The score's working shown in full.
 *
 * This component is the reason the platform can display a match score at all.
 * A bare "96/100" is a claim the buyer has to take on trust; the same number
 * beside its five components, each with the points it earned and a sentence
 * saying why, is something a procurement head can paste into a justification.
 *
 * Components with no data are listed as unknown rather than omitted — what the
 * score does NOT account for is as important as what it does.
 */
export function MatchBreakdown({ supplier, result }: { supplier: string; result: MatchResult }) {
  const t = useTranslations('compareQuotes');

  if (result.disqualified) {
    return (
      <div className="card border-l-2 border-l-danger" data-testid="match-breakdown">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-bold">{supplier}</h3>
          <span className="rounded-pill bg-danger-pale px-2 py-0.5 text-[10px] font-bold text-danger">{t('notEligible')}</span>
        </div>
        <p className="mt-2 text-xs text-slate2">{result.disqualifiedReason}</p>
        <p className="mt-2 text-[11px] text-muted">{t('disqualifiedNote')}</p>
      </div>
    );
  }

  return (
    <div className="card" data-testid="match-breakdown">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold">{supplier}</h3>
        <span className="fig text-xl text-ok">{result.score}</span>
      </div>

      <dl className="mt-3 space-y-2">
        {result.components.map((c) => (
          <div key={c.key}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs font-semibold text-slate2">{c.label}</dt>
              <dd className="font-mono text-[11px] tabular-nums text-muted">
                {c.points == null ? t('noData') : `${c.points}/${c.max}`}
              </dd>
            </div>
            {/* Track is a lighter step of the same ramp, so the unfilled part
                still reads as part of the measure rather than empty space. */}
            <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-teal-pale">
              <div
                className={c.points == null ? 'h-full bg-line' : 'h-full bg-ok'}
                style={{ width: c.points == null ? '100%' : `${(c.points / c.max) * 100}%`, opacity: c.points == null ? 0.5 : 1 }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">{c.detail}</p>
          </div>
        ))}
      </dl>

      <p className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
        {result.coverage >= 1
          ? t('coverageFull')
          : t('coveragePartial', { pct: Math.round(result.coverage * 100), count: result.unknown.length })}
      </p>
    </div>
  );
}
