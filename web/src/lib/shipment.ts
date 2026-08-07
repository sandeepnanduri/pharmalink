/**
 * Order/shipment fulfilment — pure + unit tested. Tracks a deal from award to
 * confirmed receipt. NO payment/escrow: this is logistics status only.
 */

export const SHIPMENT_STATUSES = ['pending', 'shipped', 'in_transit', 'delivered', 'confirmed'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

const RANK: Record<ShipmentStatus, number> = {
  pending: 0,
  shipped: 1,
  in_transit: 2,
  delivered: 3,
  confirmed: 4,
};

export function statusRank(s: string): number {
  return RANK[s as ShipmentStatus] ?? 0;
}

/**
 * Statuses the SELLER may move to from `current`. The seller drives up to
 * "delivered"; only the buyer flips "confirmed" (a separate action).
 */
export function nextSellerStatuses(current: string): ShipmentStatus[] {
  const r = statusRank(current);
  return (['shipped', 'in_transit', 'delivered'] as ShipmentStatus[]).filter((s) => RANK[s] > r);
}

/** The seller may only advance forward, and never to/past "confirmed". */
export function canSellerSet(current: string, next: string): boolean {
  if (!SHIPMENT_STATUSES.includes(next as ShipmentStatus)) return false;
  if (next === 'confirmed') return false; // buyer-only
  return RANK[next as ShipmentStatus] > statusRank(current);
}

/** The buyer confirms receipt only once the seller marked it delivered. */
export function canBuyerConfirm(current: string): boolean {
  return current === 'delivered';
}

export function isTerminal(status: string): boolean {
  return status === 'confirmed';
}
