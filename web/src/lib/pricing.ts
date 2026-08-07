/**
 * Price-intelligence domain — pure + unit tested. Every number here is derived
 * from REAL quotes/deals; there are no forecasts or invented "AI midpoints".
 */

export interface PriceBand {
  min: number;
  avg: number;
  max: number;
  count: number;
}

/** Aggregates real quote unit-prices into a market band (0-count when empty). */
export function aggregatePrices(prices: number[]): PriceBand {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (valid.length === 0) return { min: 0, avg: 0, max: 0, count: 0 };
  const sum = valid.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...valid),
    max: Math.max(...valid),
    avg: Math.round((sum / valid.length) * 100) / 100,
    count: valid.length,
  };
}

export type PricePosition = 'below' | 'at' | 'above';

export interface VsMarket {
  deltaPct: number; // signed % vs market average (negative = cheaper)
  position: PricePosition;
}

/**
 * Compares a price to a market average. Within ±1% counts as "at market".
 * Returns delta 0 when there is no market reference (avg <= 0).
 */
export function vsMarket(price: number, marketAvg: number): VsMarket {
  if (!(marketAvg > 0) || !(price > 0)) return { deltaPct: 0, position: 'at' };
  const deltaPct = Math.round(((price - marketAvg) / marketAvg) * 1000) / 10;
  const position: PricePosition = deltaPct < -1 ? 'below' : deltaPct > 1 ? 'above' : 'at';
  return { deltaPct, position };
}

/** Human "-9.5%" / "+4.5%" / "0%" label from a signed delta. */
export function deltaLabel(deltaPct: number): string {
  if (deltaPct === 0) return '0%';
  return `${deltaPct > 0 ? '+' : ''}${deltaPct}%`;
}
