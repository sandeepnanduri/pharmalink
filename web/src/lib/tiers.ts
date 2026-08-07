/**
 * Volume price tiers — pure + unit tested. A tier gives a lower per-kg price
 * above a quantity threshold. Real data: the effective price for a quantity is
 * looked up from the supplier's own tiers, never interpolated or guessed.
 */

export interface Tier {
  minQtyKg: number;
  pricePerKg: number;
}

/** Normalizes raw tier inputs: drop invalid, sort ascending by threshold, dedupe. */
export function normalizeTiers(raw: { minQtyKg: number; pricePerKg: number }[]): Tier[] {
  const valid = raw.filter((t) => Number.isFinite(t.minQtyKg) && t.minQtyKg > 0 && Number.isFinite(t.pricePerKg) && t.pricePerKg > 0);
  const byQty = new Map<number, number>();
  for (const t of valid) byQty.set(Math.round(t.minQtyKg), t.pricePerKg);
  return [...byQty.entries()].map(([minQtyKg, pricePerKg]) => ({ minQtyKg, pricePerKg })).sort((a, b) => a.minQtyKg - b.minQtyKg);
}

/** The applicable per-kg price for a quantity (highest threshold ≤ qty), or null. */
export function priceForQty(tiers: Tier[], qtyKg: number): number | null {
  const applicable = normalizeTiers(tiers).filter((t) => t.minQtyKg <= qtyKg);
  if (applicable.length === 0) return null;
  return applicable[applicable.length - 1].pricePerKg;
}

/** Discount % of the top tier vs the base (first) tier, for display. */
export function topDiscountPct(tiers: Tier[]): number {
  const sorted = normalizeTiers(tiers);
  if (sorted.length < 2) return 0;
  const base = sorted[0].pricePerKg;
  const top = sorted[sorted.length - 1].pricePerKg;
  if (!(base > 0)) return 0;
  return Math.round(((base - top) / base) * 1000) / 10;
}
