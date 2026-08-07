/**
 * RFQ lifecycle (BACKLOG F4.7).
 *
 * An RFQ is a *Request for Quotation*: the buyer publishes a requirement,
 * suppliers respond with priced quotes, and the buyer AWARDS one. The buyer
 * never "approves" their own request — they award a supplier's quote. Naming
 * the awarded state `awarded` (not `accepted`) keeps that clear.
 *
 * Two kinds of transition:
 *   - explicit, stored: open → quoted → awarded | cancelled
 *   - derived from time: an open/quoted RFQ whose required-by date has passed is
 *     EXPIRED. We derive this rather than run a scheduler, so the stored status
 *     stays truthful and there is nothing to keep in sync.
 *
 * Pure logic, no DB/Next imports — every rule below is unit-tested.
 */

export const RFQ_STATUSES = ['open', 'quoted', 'awarded', 'cancelled', 'expired'] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

export function parseRfqStatus(value: string | null | undefined): RfqStatus {
  return (RFQ_STATUSES as readonly string[]).includes(value ?? '') ? (value as RfqStatus) : 'open';
}

/** Terminal states never change again and never derive to "expired". */
export function isTerminalRfq(status: RfqStatus): boolean {
  return status === 'awarded' || status === 'cancelled';
}

export interface RfqTimeInput {
  status: string;
  requiredBy: Date | string;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * The status a user should SEE: stored status, unless an open/quoted RFQ's
 * required-by date has passed, in which case it reads as expired.
 */
export function effectiveRfqStatus(input: RfqTimeInput, now: Date = new Date()): RfqStatus {
  const status = parseRfqStatus(input.status);
  if (isTerminalRfq(status)) return status;
  if (toDate(input.requiredBy).getTime() < now.getTime()) return 'expired';
  return status;
}

/** A supplier may quote only while the RFQ is genuinely open (and not expired). */
export function canReceiveQuotes(input: RfqTimeInput, now: Date = new Date()): boolean {
  const s = effectiveRfqStatus(input, now);
  return s === 'open' || s === 'quoted';
}

/** A buyer may award only while the RFQ is live and not already awarded/cancelled. */
export function canBeAwarded(input: RfqTimeInput, now: Date = new Date()): boolean {
  const s = effectiveRfqStatus(input, now);
  return s === 'open' || s === 'quoted';
}

/** A buyer may withdraw an RFQ any time before it is awarded. */
export function canBeCancelled(input: RfqTimeInput, now: Date = new Date()): boolean {
  const s = effectiveRfqStatus(input, now);
  return s === 'open' || s === 'quoted' || s === 'expired';
}

/** A quote can be awarded only while it is still within its validity window. */
export function isQuoteValid(validUntil: Date | string, now: Date = new Date()): boolean {
  // End of the validity day, not the start — a quote valid "until 20 Jul" is
  // usable through the whole of the 20th.
  const end = toDate(validUntil);
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  return endOfDay.getTime() >= now.getTime();
}
