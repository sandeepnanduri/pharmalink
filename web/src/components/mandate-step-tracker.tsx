import { getFormatter, getTranslations } from 'next-intl/server';
import type { MandateStep } from '@/lib/partner-queries';

const DOT_CLASS: Record<MandateStep['status'], string> = {
  done: 'bg-ok text-white',
  current: 'bg-brand text-white',
  pending: 'bg-slate-200 text-slate2',
  na: 'bg-slate-100 text-muted',
};

/**
 * The product roadmap's 8-step mandate workflow, rendered as a horizontal
 * strip — read-only, same discipline as the rest of this page (see the
 * PARTNER BOUNDARY note on the page itself). Steps read 'na' rather than
 * 'pending forever' when the underlying event legitimately never happened
 * (introduction/negotiation/shipped/confirmed are all optional in this
 * app) — see lib/partner-queries.ts's getMandateWorkflowSteps doc comment.
 */
export async function MandateStepTracker({ steps }: { steps: MandateStep[] }) {
  const t = await getTranslations('partnerMandate');
  const format = await getFormatter();

  return (
    <div className="mb-6 overflow-x-auto rounded-card border border-line bg-white px-4 py-4" data-testid="mandate-step-tracker">
      <ol className="flex min-w-max items-start gap-1">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1.5 px-2" data-testid={`step-${s.key}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${DOT_CLASS[s.status]}`}>
                {s.status === 'done' ? '✓' : i + 1}
              </span>
              <span className="whitespace-nowrap text-center text-[11px] font-semibold text-ink">{t(`step_${s.key}`)}</span>
              <span className="whitespace-nowrap text-[10px] text-muted">
                {s.at ? format.dateTime(s.at, { dateStyle: 'medium' }) : t(`stepStatus_${s.status}`)}
              </span>
            </div>
            {i < steps.length - 1 && <span className="mb-6 h-px w-6 shrink-0 bg-line" aria-hidden />}
          </li>
        ))}
      </ol>
    </div>
  );
}
