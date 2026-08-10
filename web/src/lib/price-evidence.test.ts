import { describe, expect, it } from 'vitest';
import { compareSuppliers, partitionObservations, summariseEvidence, type EvidenceInput } from './price-evidence';

const obs = (o: Partial<EvidenceInput> = {}): EvidenceInput => ({
  observedAt: new Date('2026-06-01T00:00:00Z'),
  unitPriceUsdKg: 14.8,
  weight: 1,
  dataConfidence: 'HIGH',
  originCountry: 'India',
  incoterm: 'FOB',
  purityGrade: '≥99.5% USP',
  outlierFlag: false,
  outlierReason: null,
  supplierOrgId: null,
  ...o,
});

describe('partitionObservations', () => {
  it('keeps flagged rows out of the used set but does not discard them', () => {
    const rows = [obs(), obs({ outlierFlag: true }), obs()];
    const { used, excluded } = partitionObservations(rows);
    expect(used).toHaveLength(2);
    expect(excluded).toHaveLength(1);
  });
});

describe('summariseEvidence', () => {
  it('reports what was excluded, grouped by reason', () => {
    // A page that quietly drops a third of its inputs claims more certainty
    // than it has.
    const e = summariseEvidence([
      obs(),
      obs({ outlierFlag: true, outlierReason: 'Typo in source' }),
      obs({ outlierFlag: true, outlierReason: 'Typo in source' }),
      obs({ outlierFlag: true, outlierReason: null }),
    ]);
    expect(e.total).toBe(4);
    expect(e.used).toBe(1);
    expect(e.excluded.count).toBe(3);
    expect(e.excluded.reasons).toEqual([
      { label: 'Typo in source', count: 2 },
      { label: 'Unstated reason', count: 1 },
    ]);
  });

  it('keeps "unstated" confidence separate from LOW', () => {
    // Not knowing how good a number is differs from knowing it is a list price.
    const e = summariseEvidence([obs({ dataConfidence: 'LOW' }), obs({ dataConfidence: null }), obs({ dataConfidence: 'HIGH' })]);
    expect(e.confidence).toEqual({ HIGH: 1, MEDIUM: 0, LOW: 1, unstated: 1 });
  });

  it('averages the weight the maths actually used', () => {
    const e = summariseEvidence([obs({ weight: 1 }), obs({ weight: 0.6 }), obs({ weight: 0.3 })]);
    expect(e.meanWeight).toBeCloseTo(0.63, 2);
  });

  it('ignores excluded rows when averaging weight and counting confidence', () => {
    const e = summariseEvidence([obs({ weight: 1 }), obs({ weight: 0.3, outlierFlag: true, dataConfidence: 'LOW' })]);
    expect(e.meanWeight).toBe(1);
    expect(e.confidence.LOW).toBe(0);
  });

  it('breaks the used set down by origin, incoterm and purity, commonest first', () => {
    const e = summariseEvidence([
      obs({ originCountry: 'India' }),
      obs({ originCountry: 'India' }),
      obs({ originCountry: 'China' }),
      obs({ originCountry: null }),
    ]);
    expect(e.origins).toEqual([
      { label: 'India', count: 2 },
      { label: 'China', count: 1 },
    ]);
  });

  it('survives an empty series', () => {
    const e = summariseEvidence([]);
    expect(e).toMatchObject({ total: 0, used: 0, meanWeight: 0 });
    expect(e.origins).toEqual([]);
  });
});

describe('compareSuppliers', () => {
  const names = new Map([
    ['org-a', 'Sun Pharma'],
    ['org-b', 'Huahai'],
  ]);

  it('compares each supplier to the median of everyone else that month', () => {
    const rows = [
      obs({ supplierOrgId: 'org-a', unitPriceUsdKg: 16 }),
      obs({ supplierOrgId: 'org-b', unitPriceUsdKg: 12 }),
      obs({ unitPriceUsdKg: 13 }),
      obs({ unitPriceUsdKg: 14 }),
      obs({ unitPriceUsdKg: 15 }),
    ];
    const out = compareSuppliers(rows, names);
    expect(out).toHaveLength(2);
    // org-b measured against [16, 13, 14, 15] → 14.5; org-a against [12, 13, 14, 15] → 13.5.
    expect(out[0]).toMatchObject({ name: 'Huahai', benchmarkUsdKg: 14.5, windowMonths: 0, vsMarketPct: -17.2 });
    expect(out[1]).toMatchObject({ name: 'Sun Pharma', benchmarkUsdKg: 13.5, windowMonths: 0, vsMarketPct: 18.5 });
  });

  it('leaves a supplier out of its own benchmark', () => {
    // Otherwise a supplier holding most of the observations is compared against
    // itself and reads as exactly on-market whatever it charges.
    const rows = [
      obs({ supplierOrgId: 'org-a', unitPriceUsdKg: 30 }),
      obs({ supplierOrgId: 'org-a', unitPriceUsdKg: 30 }),
      obs({ supplierOrgId: 'org-a', unitPriceUsdKg: 30 }),
      obs({ unitPriceUsdKg: 10 }),
      obs({ unitPriceUsdKg: 10 }),
      obs({ unitPriceUsdKg: 10 }),
    ];
    const [a] = compareSuppliers(rows, names);
    expect(a.benchmarkUsdKg).toBe(10);
    expect(a.vsMarketPct).toBe(200);
  });

  it('uses the median, not the mean, so one bad number does not skew everyone', () => {
    // A mis-keyed 1000 would drag the mean of [15, 16, 1000] to 343 and report
    // this supplier as 96% below market.
    const rows = [
      obs({ supplierOrgId: 'org-a', unitPriceUsdKg: 14 }),
      obs({ unitPriceUsdKg: 15 }),
      obs({ unitPriceUsdKg: 16 }),
      obs({ unitPriceUsdKg: 1000 }),
    ];
    const [a] = compareSuppliers(rows, names);
    expect(a.benchmarkUsdKg).toBe(16);
    expect(a.vsMarketPct).toBeCloseTo(-12.5, 1);
  });

  it('widens the window a month at a time and reports how far it went', () => {
    const rows = [
      obs({ supplierOrgId: 'org-a', unitPriceUsdKg: 20, observedAt: new Date('2026-06-15T00:00:00Z') }),
      obs({ unitPriceUsdKg: 16, observedAt: new Date('2026-05-01T00:00:00Z') }),
      obs({ unitPriceUsdKg: 15, observedAt: new Date('2026-05-02T00:00:00Z') }),
      obs({ unitPriceUsdKg: 14, observedAt: new Date('2026-07-01T00:00:00Z') }),
    ];
    const [a] = compareSuppliers(rows, names);
    expect(a.windowMonths).toBe(1);
    expect(a.benchmarkUsdKg).toBe(15);
    expect(a.vsMarketPct).toBeCloseTo(33.3, 1);
  });

  it('reports no comparison rather than reaching past the window', () => {
    // The bug this replaced: an August quote measured against two years of
    // broad-HS customs unit values, announced as "67% below market".
    const rows = [
      obs({ supplierOrgId: 'org-a', unitPriceUsdKg: 4.35, observedAt: new Date('2026-08-01T00:00:00Z') }),
      obs({ unitPriceUsdKg: 13, observedAt: new Date('2025-01-01T00:00:00Z') }),
      obs({ unitPriceUsdKg: 13, observedAt: new Date('2025-02-01T00:00:00Z') }),
      obs({ unitPriceUsdKg: 13, observedAt: new Date('2025-03-01T00:00:00Z') }),
    ];
    const [a] = compareSuppliers(rows, names);
    expect(a.vsMarketPct).toBeNull();
    expect(a.benchmarkUsdKg).toBeNull();
    expect(a.windowMonths).toBeNull();
    // Still listed — the supplier and its price are real, only the comparison
    // is missing.
    expect(a.latestUsdKg).toBe(4.35);
  });

  it('will not call two observations a market', () => {
    // The median of a pair is their mean, so at two rows the outlier resistance
    // the median was chosen for is gone.
    const rows = [obs({ supplierOrgId: 'org-a', unitPriceUsdKg: 20 }), obs({ unitPriceUsdKg: 10 }), obs({ unitPriceUsdKg: 1000 })];
    expect(compareSuppliers(rows, names)[0].vsMarketPct).toBeNull();
  });

  it('sorts suppliers with no comparable market last', () => {
    const rows = [
      obs({ supplierOrgId: 'org-a', unitPriceUsdKg: 12, observedAt: new Date('2026-06-01T00:00:00Z') }),
      obs({ supplierOrgId: 'org-b', unitPriceUsdKg: 99, observedAt: new Date('2020-01-01T00:00:00Z') }),
      obs({ unitPriceUsdKg: 14, observedAt: new Date('2026-06-01T00:00:00Z') }),
      obs({ unitPriceUsdKg: 15, observedAt: new Date('2026-06-01T00:00:00Z') }),
      obs({ unitPriceUsdKg: 16, observedAt: new Date('2026-06-01T00:00:00Z') }),
    ];
    const out = compareSuppliers(rows, names);
    expect(out.map((s) => s.name)).toEqual(['Sun Pharma', 'Huahai']);
    expect(out[1].vsMarketPct).toBeNull();
  });

  it('excludes flagged observations from both sides of the comparison', () => {
    const rows = [
      obs({ supplierOrgId: 'org-a', unitPriceUsdKg: 14 }),
      obs({ unitPriceUsdKg: 15 }),
      obs({ unitPriceUsdKg: 16 }),
      obs({ unitPriceUsdKg: 17 }),
      obs({ unitPriceUsdKg: 999, outlierFlag: true }),
    ];
    const [a] = compareSuppliers(rows, names);
    // 999 would have been the top of four; excluded, the market median is 16.
    expect(a.benchmarkUsdKg).toBe(16);
  });

  it('returns nothing when no observation names a supplier', () => {
    expect(compareSuppliers([obs(), obs()], names)).toEqual([]);
    expect(compareSuppliers([], names)).toEqual([]);
  });

  it('falls back to the id when a name is unknown', () => {
    const [a] = compareSuppliers([obs({ supplierOrgId: 'org-z' }), obs(), obs(), obs()], names);
    expect(a.name).toBe('org-z');
  });
});
