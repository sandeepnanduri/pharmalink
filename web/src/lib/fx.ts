/**
 * Price normalisation to USD per kilogram — pure, no DB/Next imports.
 *
 * `PriceObservation.unitPriceUsdKg` carries a load-bearing promise, written into
 * the schema: *"ALWAYS USD per kilogram… All maths uses this field and only this
 * field."* Every forecast, every median, every driver correlation reads it. One
 * row in the wrong unit or the wrong currency does not look like a bug — it
 * looks like a market movement.
 *
 * Two conversions therefore happen here and nowhere else:
 *
 *  1. **Currency → USD.** The template supplies `FX Rate Used` per row, quoted
 *     the way its own market-context columns are (`USD/INR Rate: 83.5`), i.e.
 *     **units of the foreign currency per one USD**. So `usd = original / rate`.
 *     A non-USD price with no rate is rejected rather than converted at today's
 *     rate: a 2024 observation converted at a 2026 rate is a fabricated number,
 *     and there is no historical FX source on the platform.
 *
 *  2. **Unit → per kilogram.** Only mass units convert. A per-tablet or per-vial
 *     price is refused outright — see `unit.notMass` below, which is the guard
 *     against the single worst failure mode in this import.
 */

import { parseNumber, type NumberResult } from './numbers';

/** The template's stated bounds: `Numeric, ≥0.01, ≤99999.99`. */
export const PRICE_MIN_USD = 0.01;
export const PRICE_MAX_USD = 99_999.99;

/**
 * Recognised units and their factor to one kilogram.
 *
 * `null` marks a unit that is real but **not a mass** — tablets, vials, packs.
 * These are not a conversion failure to be worked around; sheet 3 legitimately
 * prices finished dose forms per unit. They simply must never reach a per-kg
 * column, so they are refused explicitly rather than defaulting to 1.
 */
const UNIT_TO_KG: Record<string, number | null> = {
  kg: 1,
  kgs: 1,
  kilogram: 1,
  kilograms: 1,
  kilo: 1,
  g: 0.001,
  gm: 0.001,
  gram: 0.001,
  grams: 0.001,
  mg: 0.000001,
  milligram: 0.000001,
  mt: 1000,
  ton: 1000,
  tonne: 1000,
  tonnes: 1000,
  tons: 1000,
  't': 1000,
  'metric ton': 1000,
  lb: 0.45359237,
  lbs: 0.45359237,
  pound: 0.45359237,
  pounds: 0.45359237,
  // Non-mass units, recognised so they can be refused by name rather than as
  // "unknown" — the error a curator sees should say what is actually wrong.
  unit: null,
  units: null,
  tablet: null,
  tablets: null,
  tab: null,
  capsule: null,
  capsules: null,
  vial: null,
  vials: null,
  piece: null,
  pieces: null,
  pack: null,
  packs: null,
  bottle: null,
  bottles: null,
  ampoule: null,
  ampoules: null,
  dose: null,
  doses: null,
};

export type FxProblem =
  | 'unit.unknown'
  | 'unit.notMass'
  | 'fx.rateMissing'
  | 'fx.rateInvalid'
  | 'price.unparseable'
  | 'price.outOfRange';

export interface NormalisedPrice {
  /** USD per kilogram — the only value any calculation may use. Null on failure. */
  usdPerKg: number | null;
  /** The number exactly as the sheet stated it, for audit. Never used in maths. */
  rawPrice: number | null;
  rawCurrency: string;
  rawUnit: string;
  /** The rate applied, so the conversion can be re-derived and checked. */
  fxRate: number | null;
  problem?: FxProblem;
}

/** Longest first, so `metric ton` is matched before `ton`. */
const UNIT_KEYS = Object.keys(UNIT_TO_KG).sort((a, b) => b.length - a.length);

/** Normalises `USD / kg`, `usd/KG`, `per kg`, `USD per Kilogram` to a bare unit token. */
export function parseUnit(raw: string | null | undefined): string | null {
  const text = (raw ?? '')
    .toLowerCase()
    // Drop a leading currency code. The `\b` is load-bearing: without it this
    // strips the first three letters of any word, turning "metric ton" into
    // "ric ton" (which then matches `ton`) and "tablets" into "lets" (which
    // matches nothing, so a per-tablet price would be treated as per-kg).
    .replace(/^(?:price\s+)?(?:in\s+)?[a-z]{3}\b\s*[/-]?\s*/, '')
    .replace(/\bper\b/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .trim();
  if (!text) return null;
  return UNIT_KEYS.find((k) => new RegExp(`\\b${k}\\b`).test(text)) ?? null;
}

/** Currency codes are ISO 4217 three-letter tokens; anything else is refused. */
export function parseCurrency(raw: string | null | undefined): string | null {
  const m = /\b([A-Z]{3})\b/.exec((raw ?? '').toUpperCase());
  return m ? m[1] : null;
}

export interface NormaliseInput {
  /** The price cell, which may carry a symbol or prose. */
  price: string | number | null | undefined;
  /** The currency cell. Defaults to USD when blank, matching the template. */
  currency?: string | null;
  /** The unit cell, or the column's own unit (`Price USD / kg (FOB)` → `kg`). */
  unit?: string | null;
  /** The sheet's `FX Rate Used`: foreign-currency units per one USD. */
  fxRate?: string | number | null;
}

const fail = (problem: FxProblem, partial: Partial<NormalisedPrice>): NormalisedPrice => ({
  usdPerKg: null,
  rawPrice: null,
  rawCurrency: 'USD',
  rawUnit: 'kg',
  fxRate: null,
  ...partial,
  problem,
});

/**
 * The single conversion path into `unitPriceUsdKg`.
 *
 * Returns the converted value **and** the raw inputs, because
 * `PriceObservation` stores both: the raw trio is what makes an FX conversion
 * auditable rather than a number someone has to trust.
 */
export function normaliseToUsdPerKg(input: NormaliseInput): NormalisedPrice {
  const currency = parseCurrency(input.currency) ?? 'USD';

  // A blank unit means the column heading already fixed it — the template's
  // price columns are named `Price USD / kg (FOB)`. A unit that was *stated* and
  // not recognised is different, and must not fall through to kilograms:
  // assuming a mass unit is exactly how a per-unit price ends up in a per-kg
  // column.
  const unitCell = String(input.unit ?? '').trim();
  const parsedUnit = parseUnit(unitCell);
  const unitToken = parsedUnit ?? 'kg';
  // `rawUnit` reports the canonical token when we recognised one, and the cell
  // verbatim when we did not — so an `unit.unknown` error names what the curator
  // actually wrote.
  const base = { rawCurrency: currency, rawUnit: parsedUnit ?? (unitCell || 'kg'), fxRate: null as number | null };

  const priceResult: NumberResult = parseNumber(input.price);
  if (priceResult.value == null) return fail('price.unparseable', base);
  const rawPrice = priceResult.value;

  if (unitCell && parsedUnit === null) return fail('unit.unknown', { ...base, rawPrice });

  const factor = UNIT_TO_KG[unitToken];
  if (factor === null) {
    // Sheet 3's `Price USD / Unit (FOB)` lands here. A $0.042 tablet written
    // into a per-kg column wins every "price, low to high" sort forever and
    // drags the market median for any CAS shared with an API listing.
    return fail('unit.notMass', { ...base, rawPrice });
  }

  let fxRate = 1;
  if (currency !== 'USD') {
    const rateResult = parseNumber(input.fxRate);
    if (rateResult.value == null) return fail('fx.rateMissing', { ...base, rawPrice });
    if (rateResult.value <= 0) return fail('fx.rateInvalid', { ...base, rawPrice, fxRate: rateResult.value });
    fxRate = rateResult.value;
  }

  // price is per `unitToken`; `factor` is kilograms per that unit.
  const usdPerKg = rawPrice / fxRate / factor;

  if (!Number.isFinite(usdPerKg) || usdPerKg < PRICE_MIN_USD || usdPerKg > PRICE_MAX_USD) {
    return fail('price.outOfRange', { ...base, rawPrice, fxRate });
  }

  // Four decimals matches the `Decimal(12,4)` the schema header names as the
  // Postgres target for money, so the value does not change shape on migration.
  return {
    usdPerKg: Math.round(usdPerKg * 10_000) / 10_000,
    rawPrice,
    rawCurrency: currency,
    rawUnit: unitToken,
    fxRate,
  };
}
