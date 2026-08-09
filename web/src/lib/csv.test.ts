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

  it('derives the filter-backing columns from what the seller already typed', () => {
    // The catalogue filters on segment, facet, purity, lead time, incoterms and
    // cold chain. Before this the CSV path had nowhere to put any of them, so a
    // bulk-imported listing could never appear under those filters.
    const csv = [
      'name,cas,category,purity,leadTime,productType,facet,incoterms,storage,stockStatus',
      'Microcrystalline Cellulose,9004-34-6,Excipient,≥97.0% (NF),2–3 weeks,excipient,Diluent / Filler,FOB; CIF; DDP,15-25C dry,In Stock',
    ].join('\n');
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      productType: 'excipient',
      facet: 'filler',
      purityPct: 97,
      leadTimeDays: 21, // upper bound of the range
      incoterms: 'FOB,CIF,DDP', // semicolons normalised to the comma form the schema stores
      coldChain: 'ambient',
      stockStatus: 'in_stock',
    });
  });

  it('derives the segment from the legacy category when none is given', () => {
    const { rows } = parseProductsCsv('name,cas,category\nMCC,9004-34-6,Excipient');
    expect(rows[0].productType).toBe('excipient');
  });

  it('refuses a facet that belongs to a different segment', () => {
    const { rows } = parseProductsCsv('name,cas,productType,facet\nMetformin,1115-70-4,api,tablet');
    expect(rows[0].facet).toBeNull();
  });

  it('reports rows missing name or CAS instead of dropping silently', () => {
    const csv = 'name,cas\nGood,103-90-2\n,1115-70-4\nNoCas,';
    const { rows, errors } = parseProductsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });

  it('rejects a CAS that fails its check digit, naming the row', () => {
    // 1115-70-5 is a one-digit typo of metformin. Accepting it would create a
    // second product that no filter and no price series ever joins to the real
    // one.
    const { rows, errors } = parseProductsCsv('name,cas\nMetformin,1115-70-5');
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('row 2');
    expect(errors[0]).toContain('check digit');
  });

  it('flags an empty file', () => {
    expect(parseProductsCsv('   ').errors).toEqual(['emptyFile']);
  });

  it('works without a header, keeping the original column order', () => {
    // The first nine columns are unchanged from the original format, so a
    // headerless file a seller already has keeps parsing the same way.
    const { rows } = parseProductsCsv('Paracetamol,103-90-2,API,USP,99.8%,25,2 weeks,4.2,5.1');
    expect(rows[0]).toMatchObject({ name: 'Paracetamol', cas: '103-90-2', category: 'API', moqKg: 25, priceMin: 4.2 });
  });
});

describe('productsToCsv', () => {
  it('quotes tricky values', () => {
    const csv = productsToCsv([{ name: 'A, B', cas: '103-90-2', category: 'API', moqKg: 5, priceMin: 1.2, status: 'live' }]);
    expect(csv.split('\n')[0]).toContain('name,cas');
    expect(csv).toContain('"A, B"');
  });

  it('round-trips every importable column through the parser', () => {
    // Export previously emitted nine columns and import read a different nine,
    // so edit-in-a-spreadsheet-and-re-upload silently discarded everything.
    const csv = productsToCsv([
      {
        name: 'Metformin HCl',
        cas: '1115-70-4',
        category: 'API',
        grade: 'USP',
        purity: '99.5%',
        moqKg: 100,
        leadTime: '3 weeks',
        priceMin: 3.8,
        priceMax: 4.6,
        productType: 'api',
        facet: 'antidiabetic',
        incoterms: 'FOB,CIF',
        coldChain: 'ambient',
        stockStatus: 'in_stock',
        packaging: '25 kg drum',
        sampleAvailable: true,
        status: 'live',
      },
    ]);
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      name: 'Metformin HCl',
      cas: '1115-70-4',
      productType: 'api',
      facet: 'antidiabetic',
      incoterms: 'FOB,CIF',
      coldChain: 'ambient',
      stockStatus: 'in_stock',
      packaging: '25 kg drum',
      sampleAvailable: true,
      leadTimeDays: 21,
      purityPct: 99.5,
    });
  });

  it('exports status but never imports it', () => {
    // importProductsAction has no live-listing quota check and creates
    // everything as draft. Reading status back would be a one-paste way past
    // the plan limit.
    const csv = productsToCsv([{ name: 'X', cas: '103-90-2', status: 'live' }]);
    expect(csv.split('\n')[0]).toContain('status');
    expect(parseProductsCsv(csv).rows[0]).not.toHaveProperty('status');
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
