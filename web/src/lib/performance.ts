/**
 * Supplier performance metrics — pure, unit tested.
 *
 * The Supplier Profile document calls this the most commercially critical gap,
 * and it is: a profile tells a buyer what a supplier CLAIMS, while these numbers
 * tell them whether the supplier delivers. But that only holds if the numbers
 * are honest, so two rules run through this file:
 *
 *  1. **A rate needs a denominator big enough to mean anything.** One on-time
 *     delivery out of one order is not "100% on-time"; it is one order. Below
 *     `MIN_SAMPLE` the metric returns `insufficient` and the UI says so instead
 *     of printing a flattering percentage.
 *  2. **Platform metrics are labelled as platform metrics.** These measure
 *     behaviour on PharmaLink, not the supplier's whole business, and the label
 *     says which.
 */

export const MIN_SAMPLE = 5;

export interface PerformanceInput {
  /** Deals that reached a terminal state. */
  ordersCompleted: number;
  /** Of those, how many arrived on or before the promised date. */
  ordersOnTime: number;
  /** Requests broadcast to this supplier, and how many drew any response. */
  inquiriesReceived: number;
  inquiriesAnswered: number;
  /** Of the answers, how many landed inside the 24h SLA. */
  answeredWithinSla: number;
  /** Quotes submitted and how many the buyer awarded. */
  quotesSubmitted: number;
  quotesWon: number;
  /** Orders that raised a documented dispute. */
  disputes: number;
  /** Distinct buyers, and how many came back for a second order. */
  distinctBuyers: number;
  repeatBuyers: number;
  /** Sum of awarded deal values, for AOV. */
  totalValue: number;
  /** When the supplier joined, for tenure. */
  joinedAt?: Date | null;
}

export type MetricStatus = 'ok' | 'insufficient' | 'none';

export interface Metric {
  key: string;
  label: string;
  /** Formatted for display, or null when there is nothing to show. */
  value: string | null;
  /** Raw 0..1 rate where the metric is a rate, for meters. */
  rate?: number | null;
  status: MetricStatus;
  /** The denominator, always stated — "97%" means nothing without "of 142". */
  basis: string;
  /** Higher is better; drives colour direction. */
  higherIsBetter?: boolean;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function rateMetric(
  key: string,
  label: string,
  numerator: number,
  denominator: number,
  basisNoun: string,
  higherIsBetter = true,
): Metric {
  if (denominator <= 0) {
    return { key, label, value: null, rate: null, status: 'none', basis: `No ${basisNoun} yet`, higherIsBetter };
  }
  if (denominator < MIN_SAMPLE) {
    return {
      key,
      label,
      value: null,
      rate: null,
      status: 'insufficient',
      basis: `Only ${denominator} ${basisNoun} — too few to rate`,
      higherIsBetter,
    };
  }
  const rate = numerator / denominator;
  return { key, label, value: pct(rate), rate, status: 'ok', basis: `${numerator} of ${denominator} ${basisNoun}`, higherIsBetter };
}

export interface PerformanceReport {
  metrics: Metric[];
  /** How many of the metrics could actually be computed. */
  assessable: number;
  total: number;
}

export function performanceReport(input: PerformanceInput, now: Date = new Date()): PerformanceReport {
  const metrics: Metric[] = [
    rateMetric('onTime', 'On-time delivery', input.ordersOnTime, input.ordersCompleted, 'completed orders'),
    rateMetric('response', 'Response rate', input.inquiriesAnswered, input.inquiriesReceived, 'inquiries'),
    rateMetric('sla', 'Answered within 24h', input.answeredWithinSla, input.inquiriesAnswered, 'answered inquiries'),
    rateMetric('winRate', 'Quote win rate', input.quotesWon, input.quotesSubmitted, 'quotes submitted'),
    rateMetric('dispute', 'Dispute rate', input.disputes, input.ordersCompleted, 'completed orders', false),
    rateMetric('repeat', 'Repeat buyer rate', input.repeatBuyers, input.distinctBuyers, 'buyers'),
  ];

  // Counts, not rates — these are honest at any size, so they have no floor.
  metrics.push({
    key: 'orders',
    label: 'Completed orders',
    value: String(input.ordersCompleted),
    status: input.ordersCompleted > 0 ? 'ok' : 'none',
    basis: 'On PharmaLink',
  });

  metrics.push({
    key: 'aov',
    label: 'Average order value',
    value: input.ordersCompleted > 0 ? `$${Math.round(input.totalValue / input.ordersCompleted).toLocaleString()}` : null,
    status: input.ordersCompleted > 0 ? 'ok' : 'none',
    basis: input.ordersCompleted > 0 ? `Across ${input.ordersCompleted} orders` : 'No completed orders yet',
  });

  if (input.joinedAt) {
    const months = Math.max(0, Math.round((now.getTime() - input.joinedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
    metrics.push({
      key: 'tenure',
      label: 'Time on PharmaLink',
      value: months >= 12 ? `${Math.floor(months / 12)}y ${months % 12}m` : `${months}m`,
      status: 'ok',
      basis: `Joined ${input.joinedAt.toISOString().slice(0, 10)}`,
    });
  }

  return { metrics, assessable: metrics.filter((m) => m.status === 'ok').length, total: metrics.length };
}

// ---------------------------------------------------------------------------
// Regulatory action history
// ---------------------------------------------------------------------------

export type ActionKind = 'warning_letter' | 'import_alert' | 'form_483' | 'eu_noncompliance' | 'recall';

export interface RegulatoryActionInput {
  kind: ActionKind;
  status: string;
  issuedAt: Date;
}

export type RegulatorySeverity = 'clear' | 'historic' | 'attention' | 'blocking';

export interface RegulatorySummary {
  severity: RegulatorySeverity;
  /** The single sentence a buyer needs to read. */
  headline: string;
  openCount: number;
  historicCount: number;
}

/** Kinds that stop a purchase outright while they are open. */
const BLOCKING: ActionKind[] = ['import_alert', 'eu_noncompliance'];

/**
 * Reduces an enforcement history to one verdict.
 *
 * The ordering matters: an OPEN import alert outranks everything, because it
 * means the material cannot legally enter the market regardless of how good the
 * rest of the record looks. A closed action from years ago is context, not a
 * warning, and is reported as history rather than colouring the supplier red
 * forever.
 */
export function summariseRegulatory(actions: RegulatoryActionInput[], now: Date = new Date()): RegulatorySummary {
  const open = actions.filter((a) => a.status === 'open');
  const historic = actions.filter((a) => a.status !== 'open');

  const blocking = open.filter((a) => BLOCKING.includes(a.kind));
  if (blocking.length > 0) {
    const kinds = [...new Set(blocking.map((a) => a.kind))];
    return {
      severity: 'blocking',
      headline:
        kinds.includes('import_alert')
          ? 'Active FDA import alert — this material cannot be imported into the US'
          : 'Active EU GMP non-compliance — supply into the EU is restricted',
      openCount: open.length,
      historicCount: historic.length,
    };
  }

  if (open.length > 0) {
    return {
      severity: 'attention',
      headline: `${open.length} open regulatory action${open.length === 1 ? '' : 's'} — review before awarding`,
      openCount: open.length,
      historicCount: historic.length,
    };
  }

  if (historic.length > 0) {
    const newest = historic.reduce((a, b) => (a.issuedAt > b.issuedAt ? a : b));
    const years = Math.floor((now.getTime() - newest.issuedAt.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    return {
      severity: 'historic',
      headline:
        years >= 1
          ? `No open actions. ${historic.length} closed, most recent ${years} year${years === 1 ? '' : 's'} ago`
          : `No open actions. ${historic.length} closed within the last year`,
      openCount: 0,
      historicCount: historic.length,
    };
  }

  return { severity: 'clear', headline: 'No regulatory action on record', openCount: 0, historicCount: 0 };
}
