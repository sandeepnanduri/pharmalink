import { describe, it, expect } from 'vitest';
import { splitCsvLine, parseProductsCsv, productsToCsv } from './csv';
import { normalizeTiers, priceForQty, topDiscountPct } from './tiers';

describe('splitCsvLine', () => {
  it('handles quoted fields with embedded commas and escaped quotes', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(splitCsvLine('"Smith, John",42,"he said ""hi"""')).toEqual(['Smith, John', '42', 'he said "hi"']);
  });
});

describe('parseProductsCsv', () => {
  it('parses a header + rows and coerces numbers', () => {
    const csv = 'name,cas,category,grade,purity,moqKg,leadTime,priceMin,priceMax\nMetformin HCl,1115-70-4,API,USP,99.5%,100,3 weeks,14.5,16.2';
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ name: 'Metformin HCl', cas: '1115-70-4', moqKg: 100, priceMin: 14.5, priceMax: 16.2 });
  });
  it('reports rows missing name or CAS instead of dropping silently', () => {
    const csv = 'name,cas\nGood,123-45-6\n,999-99-9\nNoCas,';
    const { rows, errors } = parseProductsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });
  it('flags an empty file', () => {
    expect(parseProductsCsv('   ').errors).toEqual(['emptyFile']);
  });
  it('works without a header (fixed column order)', () => {
    const { rows } = parseProductsCsv('Paracetamol,103-90-2,API');
    expect(rows[0]).toMatchObject({ name: 'Paracetamol', cas: '103-90-2', category: 'API' });
  });
});

describe('productsToCsv', () => {
  it('round-trips and quotes tricky values', () => {
    const csv = productsToCsv([{ name: 'A, B', cas: '1', category: 'API', grade: null, purity: null, moqKg: 5, leadTime: null, priceMin: 1.2, priceMax: null, status: 'live' }]);
    expect(csv.split('\n')[0]).toContain('name,cas');
    expect(csv).toContain('"A, B"');
  });
});

describe('volume tiers', () => {
  const tiers = [{ minQtyKg: 1000, pricePerKg: 15.5 }, { minQtyKg: 500, pricePerKg: 16.2 }, { minQtyKg: 10000, pricePerKg: 14.8 }];
  it('normalizes: sorts ascending, drops invalid', () => {
    const n = normalizeTiers([...tiers, { minQtyKg: -1, pricePerKg: 9 }, { minQtyKg: 100, pricePerKg: 0 }]);
    expect(n.map((t) => t.minQtyKg)).toEqual([500, 1000, 10000]);
  });
  it('looks up the applicable price for a quantity', () => {
    expect(priceForQty(tiers, 500)).toBe(16.2);
    expect(priceForQty(tiers, 1500)).toBe(15.5);
    expect(priceForQty(tiers, 20000)).toBe(14.8);
    expect(priceForQty(tiers, 100)).toBeNull(); // below the lowest tier
  });
  it('computes the top-tier discount %', () => {
    expect(topDiscountPct(tiers)).toBe(8.6); // (16.2 - 14.8) / 16.2
    expect(topDiscountPct([{ minQtyKg: 1, pricePerKg: 10 }])).toBe(0);
  });
});
