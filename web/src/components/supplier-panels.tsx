import type { SupplierProfileExtras } from '@/lib/supplier-queries';

/**
 * The three panels the buyer-side review flagged as the critical gaps.
 *
 * A theme runs through all of them: a metric with no data says so, in words,
 * and never renders as a zero or a dash that a reader could mistake for a
 * measured value. "No completed orders yet" and "0% on-time" are opposite
 * claims, and only one of them is true for a new supplier.
 */

const SEVERITY = {
  clear: { cls: 'border-l-ok bg-ok-pale/40', dot: 'bg-ok', text: 'text-ok' },
  historic: { cls: 'border-l-line bg-mist', dot: 'bg-muted', text: 'text-slate2' },
  attention: { cls: 'border-l-warn bg-warn-pale/50', dot: 'bg-warn', text: 'text-warn' },
  blocking: { cls: 'border-l-danger bg-danger-pale/60', dot: 'bg-danger', text: 'text-danger' },
} as const;

const ACTION_LABEL: Record<string, string> = {
  warning_letter: 'FDA warning letter',
  import_alert: 'FDA import alert',
  form_483: 'FDA Form 483 observation',
  eu_noncompliance: 'EU GMP non-compliance',
  recall: 'Product recall',
};

export function RegulatoryPanel({ regulatory }: { regulatory: SupplierProfileExtras['regulatory'] }) {
  const s = SEVERITY[regulatory.summary.severity];
  return (
    <section data-testid="regulatory-panel" data-severity={regulatory.summary.severity}>
      <h2 className="mb-3 font-display text-base font-bold">Regulatory history</h2>

      {/* The verdict first. A buyer must not have to read a table to learn that
          the material cannot legally be imported. */}
      <div className={`mb-4 rounded-card border border-line border-l-4 p-4 ${s.cls}`}>
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
          <div>
            <p className={`text-sm font-semibold ${s.text}`}>{regulatory.summary.headline}</p>
            <p className="mt-1 text-xs text-slate2">
              Sourced from openFDA and the EudraGMDP register — not self-declared by the supplier.
            </p>
          </div>
        </div>
      </div>

      {regulatory.actions.length === 0 ? (
        <p className="text-sm text-muted">Nothing on record for this organisation.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Action</th>
                <th className="th">Reference</th>
                <th className="th">Site</th>
                <th className="th">Issued</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {regulatory.actions.map((a) => (
                <tr key={a.id} data-testid="regulatory-row">
                  <td className="td">
                    <span className="font-semibold">{ACTION_LABEL[a.kind] ?? a.kind}</span>
                    {a.summary && <span className="block max-w-md text-xs text-muted">{a.summary}</span>}
                  </td>
                  <td className="td font-mono text-xs">{a.reference ?? '—'}</td>
                  <td className="td text-xs text-slate2">{a.site ?? '—'}</td>
                  <td className="td font-mono text-xs">{a.issuedAt.toISOString().slice(0, 10)}</td>
                  <td className="td">
                    <span
                      className={`rounded-pill px-2 py-0.5 text-[11px] font-bold ${
                        a.status === 'open' ? 'bg-danger-pale text-danger' : 'bg-ok-pale text-ok'
                      }`}
                    >
                      {a.status === 'open' ? 'Open' : `Closed ${a.closedAt ? a.closedAt.toISOString().slice(0, 10) : ''}`.trim()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function PerformancePanel({ performance }: { performance: SupplierProfileExtras['performance'] }) {
  return (
    <section data-testid="performance-panel">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-bold">Performance on PharmaLink</h2>
        <p className="text-xs text-muted">
          {performance.assessable} of {performance.total} metrics have enough data
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {performance.metrics.map((m) => (
          <div key={m.key} className="card" data-testid="performance-metric" data-status={m.status}>
            <p className="text-xs font-semibold text-slate2">{m.label}</p>

            {m.value == null ? (
              <>
                <p className="mt-1.5 text-sm font-semibold text-muted">Not enough data</p>
                <p className="mt-0.5 text-[11px] text-muted">{m.basis}</p>
              </>
            ) : (
              <>
                <p className="fig mt-1 text-2xl">{m.value}</p>
                <p className="mt-0.5 text-[11px] text-muted">{m.basis}</p>
                {m.rate != null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-brand-pale">
                    <div
                      className={`h-full rounded-pill ${m.higherIsBetter === false ? 'bg-warn' : 'bg-ok'}`}
                      style={{ width: `${Math.round(m.rate * 100)}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        These measure activity on PharmaLink only, not the supplier&rsquo;s whole business. Rates are withheld below five
        samples — one delivery on time is one delivery, not a 100% record.
      </p>
    </section>
  );
}

export function CommercialPanel({ commercial }: { commercial: SupplierProfileExtras['commercial'] }) {
  const rows: { label: string; value: React.ReactNode; note?: string }[] = [
    {
      label: 'Incoterms offered',
      value: commercial.incoterms.length ? commercial.incoterms.join(' · ') : <span className="text-muted">Not stated</span>,
      note: commercial.observedIncoterms.length ? `Used on closed deals: ${commercial.observedIncoterms.join(', ')}` : undefined,
    },
    { label: 'Payment terms', value: commercial.paymentTerms ?? <span className="text-muted">Not stated</span> },
    { label: 'Standard lead time', value: commercial.leadTime ?? <span className="text-muted">Not stated</span> },
    {
      label: 'Lowest minimum order',
      value: commercial.minMoqKg != null ? `${commercial.minMoqKg} kg` : <span className="text-muted">No live listings</span>,
      note: 'Across live listings; per-product MOQ may be higher.',
    },
    {
      label: 'Samples',
      value: commercial.sampleProducts > 0 ? `Available on ${commercial.sampleProducts} listing(s)` : <span className="text-muted">Not offered</span>,
    },
    {
      label: 'Cold chain',
      value: commercial.coldChain.length ? commercial.coldChain.join(' · ') : <span className="text-muted">Ambient only</span>,
    },
  ];

  return (
    <section data-testid="commercial-panel">
      <h2 className="mb-3 font-display text-base font-bold">Commercial terms</h2>
      <dl className="overflow-hidden rounded-card border border-line bg-white">
        {rows.map((r, i) => (
          <div key={r.label} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${i ? 'border-t border-line' : ''}`}>
            <dt className="text-xs font-semibold text-slate2">{r.label}</dt>
            <dd className="text-right">
              <span className="text-sm">{r.value}</span>
              {r.note && <span className="mt-0.5 block text-[11px] text-muted">{r.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-muted">
        Terms are supplier-stated defaults. The binding terms are the ones on a quote you accept.
      </p>
    </section>
  );
}
