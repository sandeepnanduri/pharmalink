import { describe, expect, it } from 'vitest';
import { PRICE_MAX_USD, PRICE_MIN_USD, normaliseToUsdPerKg, parseCurrency, parseUnit } from './fx';

describe('parseUnit', () => {
  it('reads the unit out of a column heading or a bare cell', () => {
    expect(parseUnit('kg')).toBe('kg');
    expect(parseUnit('USD / kg')).toBe('kg');
    expect(parseUnit('USD per Kilogram')).toBe('kilogram');
    expect(parseUnit('MT/year')).toBe('mt');
  });

  it('prefers the longer match', () => {
    expect(parseUnit('metric ton')).toBe('metric ton');
  });

  it('recognises non-mass units by name so they can be refused precisely', () => {
    expect(parseUnit('USD / Unit')).toBe('unit');
    expect(parseUnit('tablets')).toBe('tablets');
  });

  it('is null for something unrecognised', () => {
    expect(parseUnit('per widget')).toBeNull();
    expect(parseUnit('')).toBeNull();
  });
});

describe('parseCurrency', () => {
  it('extracts an ISO 4217 code', () => {
    expect(parseCurrency('USD')).toBe('USD');
    expect(parseCurrency('inr')).toBe('INR');
    expect(parseCurrency('Price in EUR')).toBe('EUR');
  });

  it('is null for anything that is not a three-letter code', () => {
    expect(parseCurrency('$')).toBeNull();
    expect(parseCurrency('')).toBeNull();
  });
});

describe('normaliseToUsdPerKg', () => {
  it('passes a USD/kg price through, keeping the raw trio for audit', () => {
    const r = normaliseToUsdPerKg({ price: '14.80', currency: 'USD', unit: 'kg' });
    expect(r).toEqual({ usdPerKg: 14.8, rawPrice: 14.8, rawCurrency: 'USD', rawUnit: 'kg', fxRate: 1 });
  });

  it('defaults a blank currency and unit to USD/kg, as the template does', () => {
    expect(normaliseToUsdPerKg({ price: '2.80' }).usdPerKg).toBe(2.8);
  });

  it('converts mass units to kilograms', () => {
    expect(normaliseToUsdPerKg({ price: '0.0148', unit: 'g' }).usdPerKg).toBe(14.8); // per gram × 1000
    expect(normaliseToUsdPerKg({ price: '14800', unit: 'MT' }).usdPerKg).toBe(14.8); // per tonne ÷ 1000
    expect(normaliseToUsdPerKg({ price: '10', unit: 'lb' }).usdPerKg).toBe(22.0462);
  });

  it('converts currency using the sheet-supplied rate, quoted per one USD', () => {
    // 1235.80 INR/kg at 83.5 INR per USD = 14.80 USD/kg.
    const r = normaliseToUsdPerKg({ price: '1235.80', currency: 'INR', unit: 'kg', fxRate: '83.5' });
    expect(r.usdPerKg).toBe(14.8);
    expect(r.rawPrice).toBe(1235.8);
    expect(r.rawCurrency).toBe('INR');
    expect(r.fxRate).toBe(83.5);
  });

  it('refuses a non-USD price with no rate rather than inventing one', () => {
    // Converting a 2024 observation at today's rate is a fabricated number, and
    // there is no historical FX source on the platform.
    const r = normaliseToUsdPerKg({ price: '1180', currency: 'INR', unit: 'kg' });
    expect(r.usdPerKg).toBeNull();
    expect(r.problem).toBe('fx.rateMissing');
    expect(r.rawPrice).toBe(1180); // still reported, so the curator sees the row
  });

  it('refuses a nonsensical rate', () => {
    expect(normaliseToUsdPerKg({ price: '100', currency: 'INR', fxRate: '0' }).problem).toBe('fx.rateInvalid');
    expect(normaliseToUsdPerKg({ price: '100', currency: 'INR', fxRate: '-5' }).problem).toBe('fx.rateInvalid');
  });

  it('REFUSES a per-unit price outright', () => {
    // Sheet 3 prices tablets at $0.042/unit. In a per-kg column that wins every
    // "price, low to high" sort forever and drags the market median for any CAS
    // shared with an API listing. It must never be converted or guessed at.
    const r = normaliseToUsdPerKg({ price: '0.042', currency: 'USD', unit: 'USD / Unit (FOB)' });
    expect(r.usdPerKg).toBeNull();
    expect(r.problem).toBe('unit.notMass');
    expect(r.rawUnit).toBe('unit');
  });

  it('refuses a stated-but-unrecognised unit rather than assuming kilograms', () => {
    const r = normaliseToUsdPerKg({ price: '10', unit: 'per widget' });
    expect(r.usdPerKg).toBeNull();
    expect(r.problem).toBe('unit.unknown');
    expect(r.rawUnit).toBe('per widget'); // the error names what the curator wrote
  });

  it('treats a blank unit as the column heading having fixed it', () => {
    // The template's price columns are named `Price USD / kg (FOB)`, so an empty
    // unit cell genuinely means kilograms.
    expect(normaliseToUsdPerKg({ price: '10', unit: '' }).usdPerKg).toBe(10);
    expect(normaliseToUsdPerKg({ price: '10' }).usdPerKg).toBe(10);
  });

  it('enforces the template price bounds by rejecting, never clamping', () => {
    expect(normaliseToUsdPerKg({ price: '0.001' }).problem).toBe('price.outOfRange');
    expect(normaliseToUsdPerKg({ price: '100000' }).problem).toBe('price.outOfRange');
    expect(normaliseToUsdPerKg({ price: String(PRICE_MIN_USD) }).usdPerKg).toBe(PRICE_MIN_USD);
    expect(normaliseToUsdPerKg({ price: String(PRICE_MAX_USD) }).usdPerKg).toBe(PRICE_MAX_USD);
  });

  it('reports an unparseable price', () => {
    expect(normaliseToUsdPerKg({ price: 'on request' }).problem).toBe('price.unparseable');
    expect(normaliseToUsdPerKg({ price: '' }).problem).toBe('price.unparseable');
  });

  it('rounds to four decimals, matching the Decimal(12,4) Postgres target', () => {
    const r = normaliseToUsdPerKg({ price: '1000', currency: 'INR', fxRate: '83.5' });
    expect(r.usdPerKg).toBe(11.976); // 11.97604... truncated to 4dp
  });
});
