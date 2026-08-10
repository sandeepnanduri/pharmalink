import { getFormatter, getTranslations } from 'next-intl/server';
import { certExpiryLevel, daysUntil } from '@/lib/compliance';
import { outcomeLevel, type OutcomeLevel } from '@/lib/vocab';

/**
 * Manufacturing facilities and regulatory filings on a supplier profile.
 *
 * Both are new surfaces for data the platform could not previously hold. They
 * share a file because they share a rule: **a claim is shown with the evidence
 * that makes it checkable, or it is not shown as a claim.** A site is shown with
 * its FEI so a buyer can look it up in the FDA's own register; an inspection
 * outcome is shown with its date; a filing with no expiry is marked unknown,
 * never "ok".
 */

const OUTCOME_CLASS: Record<OutcomeLevel, string> = {
  ok: 'badge-verified',
  warning: 'badge-pending',
  critical: 'badge-rejected',
  unknown: 'badge-neutral',
};

function OutcomeBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-muted">—</span>;
  return <span className={OUTCOME_CLASS[outcomeLevel(value)]}>{value}</span>;
}

export interface FacilityRow {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  siteType: string;
  regulatoryId: string | null;
  fdaGmpStatus: string | null;
  euGmpStatus: string | null;
  fdaInspectionOutcome: string | null;
  lastFdaInspectionAt: Date | null;
  capacityValue: number | null;
  capacityUnit: string | null;
  utilizationPct: number | null;
}

export async function SupplierFacilities({ facilities }: { facilities: FacilityRow[] }) {
  const t = await getTranslations('supplier');
  const format = await getFormatter();
  if (facilities.length === 0) return null;

  return (
    <>
      <h2 className="mb-3 mt-8 text-base font-bold">{t('facilities')}</h2>
      <div className="card overflow-x-auto p-0" data-testid="supplier-facilities">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <th className="th">{t('site')}</th>
              <th className="th">{t('fei')}</th>
              <th className="th">{t('gmp')}</th>
              <th className="th">{t('lastInspection')}</th>
              <th className="th">{t('capacity')}</th>
            </tr>
          </thead>
          <tbody>
            {facilities.map((f) => (
              <tr key={f.id} data-testid="facility-row">
                <td className="td">
                  <span className="font-semibold">{f.name}</span>
                  <span className="block text-xs text-muted">
                    {[f.city, f.country].filter(Boolean).join(', ')} · {f.siteType}
                  </span>
                </td>
                {/* The FEI is what makes the rest checkable — it is the handle a
                    buyer types into the FDA's own establishment search. Mono,
                    like every identifying number. */}
                <td className="td font-mono text-xs">{f.regulatoryId ?? '—'}</td>
                <td className="td text-xs">
                  <div className="flex flex-wrap gap-1">
                    {f.fdaGmpStatus && <span className="badge-info">FDA {f.fdaGmpStatus}</span>}
                    {f.euGmpStatus && <span className="badge-info">EU {f.euGmpStatus}</span>}
                    {!f.fdaGmpStatus && !f.euGmpStatus && <span className="text-muted">—</span>}
                  </div>
                </td>
                <td className="td">
                  <OutcomeBadge value={f.fdaInspectionOutcome} />
                  {/* An outcome without its date is not evidence of anything. */}
                  {f.lastFdaInspectionAt && (
                    <span className="ml-1.5 font-mono text-xs text-muted">
                      {format.dateTime(f.lastFdaInspectionAt, { year: 'numeric', month: 'short' })}
                    </span>
                  )}
                </td>
                <td className="td font-mono text-xs">
                  {/* Always with its unit: sheet 8's own heading is "Annual
                      Capacity (MT or Units)", so a bare number is ambiguous. */}
                  {f.capacityValue != null ? `${f.capacityValue} ${f.capacityUnit ?? ''}`.trim() : '—'}
                  {f.utilizationPct != null && <span className="ml-1 text-muted">· {f.utilizationPct}%</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export interface FilingRow {
  id: string;
  filingType: string;
  filingNumber: string;
  authority: string | null;
  status: string;
  productName: string | null;
  expiresAt: Date | null;
  openToReference: boolean | null;
  referencingCount: number | null;
}

const EXPIRY_CLASS: Record<string, string> = {
  expired: 'badge-rejected',
  critical: 'badge-rejected',
  warning: 'badge-pending',
  soon: 'badge-pending',
  ok: 'badge-verified',
  unknown: 'badge-neutral',
};

export async function SupplierFilings({ filings }: { filings: FilingRow[] }) {
  const t = await getTranslations('supplier');
  const format = await getFormatter();
  if (filings.length === 0) return null;

  // Grouped by type, because "does this supplier have a DMF" is the question,
  // and a flat list of eleven filings does not answer it at a glance.
  const byType = new Map<string, FilingRow[]>();
  for (const f of filings) byType.set(f.filingType, [...(byType.get(f.filingType) ?? []), f]);

  return (
    <>
      <h2 className="mb-3 mt-8 text-base font-bold">{t('filings')}</h2>
      <p className="mb-3 -mt-2 text-xs text-muted">{t('filingsHint')}</p>
      <div className="card overflow-x-auto p-0" data-testid="supplier-filings">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="th">{t('filingType')}</th>
              <th className="th">{t('filingNumber')}</th>
              <th className="th">{t('scopeProduct')}</th>
              <th className="th">Status</th>
              <th className="th">{t('expiry')}</th>
            </tr>
          </thead>
          <tbody>
            {[...byType.entries()].map(([type, rows]) =>
              rows.map((f, i) => {
                const level = certExpiryLevel(f.expiresAt);
                return (
                  <tr key={f.id} data-testid="filing-row">
                    <td className="td text-xs font-semibold">{i === 0 ? type : ''}</td>
                    <td className="td font-mono text-xs">
                      {f.filingNumber}
                      {f.openToReference && (
                        <span className="ml-1.5 badge-info" title={t('openToReferenceHint')}>
                          {t('openToReference')}
                        </span>
                      )}
                      {f.referencingCount ? (
                        <span className="ml-1.5 text-muted">{t('referencedBy', { n: f.referencingCount })}</span>
                      ) : null}
                    </td>
                    <td className="td text-xs">{f.productName ?? <span className="text-muted">—</span>}</td>
                    <td className="td text-xs">{f.status}</td>
                    <td className="td">
                      {/* A DMF genuinely has no expiry. That reads as `unknown`,
                          never as `ok` — the same rule compliance.ts applies to a
                          certificate with no date. */}
                      <span className={EXPIRY_CLASS[level] ?? 'badge-neutral'} data-testid={`filing-expiry-${level}`}>
                        {f.expiresAt ? format.dateTime(f.expiresAt, { year: 'numeric', month: 'short' }) : t('noExpiry')}
                      </span>
                      {f.expiresAt && level !== 'ok' && (
                        <span className="ml-1.5 font-mono text-xs text-muted">{t('daysLeft', { n: daysUntil(f.expiresAt) })}</span>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
