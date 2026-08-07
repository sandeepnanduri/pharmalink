/**
 * Structured counter-offers on a quote — pure + unit tested. A bilateral thread:
 * buyer proposes a price, the seller accepts / declines / counters back, etc.
 */

export const COUNTER_STATUSES = ['open', 'accepted', 'declined', 'superseded'] as const;
export type CounterStatus = (typeof COUNTER_STATUSES)[number];

export interface CounterLike {
  byOrgId: string;
  status: string;
  createdAt: Date;
}

/** The latest still-open counter in a thread, or null. */
export function activeCounter<T extends CounterLike>(counters: T[]): T | null {
  const open = counters.filter((c) => c.status === 'open');
  if (open.length === 0) return null;
  return open.reduce((a, b) => (a.createdAt.getTime() >= b.createdAt.getTime() ? a : b));
}

/**
 * Whether `viewerOrgId` may respond (accept/decline/counter) to the active
 * counter: it must be open AND proposed by the OTHER party (you don't respond
 * to your own offer).
 */
export function canRespond(active: CounterLike | null, viewerOrgId: string | null | undefined): boolean {
  if (!active || !viewerOrgId) return false;
  return active.status === 'open' && active.byOrgId !== viewerOrgId;
}

/** Whether `viewerOrgId` may open a NEW counter (no open one is awaiting them). */
export function canPropose(active: CounterLike | null, viewerOrgId: string | null | undefined): boolean {
  if (!viewerOrgId) return false;
  if (!active) return true;
  // Can't propose while your own offer is still open (waiting on the other side).
  return active.byOrgId !== viewerOrgId;
}

/** Positive price required; qty optional but positive when present. */
export function validCounter(price: number, qty?: number | null): boolean {
  if (!(price > 0)) return false;
  if (qty != null && !(qty > 0)) return false;
  return true;
}

export interface ThreadRow {
  id: string;
  side: 'you' | 'them';
  proposedPrice: number;
  note: string | null;
  status: string;
}

/** Server-side prep: rows (with viewer-relative side) + what the viewer can do. */
export function prepareThread<T extends CounterLike & { id: string; proposedPrice: number; note: string | null }>(
  counters: T[],
  viewerOrgId: string | null | undefined,
): { rows: ThreadRow[]; canRespondId: string | null; canProposeFlag: boolean } {
  const active = activeCounter(counters);
  return {
    rows: counters.map((c) => ({
      id: c.id,
      side: c.byOrgId === viewerOrgId ? 'you' : 'them',
      proposedPrice: c.proposedPrice,
      note: c.note,
      status: c.status,
    })),
    canRespondId: canRespond(active, viewerOrgId) ? (active as T).id : null,
    canProposeFlag: canPropose(active, viewerOrgId),
  };
}
