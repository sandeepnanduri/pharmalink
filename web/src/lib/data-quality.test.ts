import { describe, expect, it } from 'vitest';
import { combineCoverage, coverage, findDuplicates, freshness, rankByQuality, type OrgQuality } from './data-quality';

const NOW = new Date('2026-08-10T00:00:00Z');

describe('freshness', () => {
  it('uses the template’s own six-month line for "outdated"', () => {
    expect(freshness(new Date('2026-07-01T00:00:00Z'), NOW)).toBe('fresh');
    expect(freshness(new Date('2026-04-01T00:00:00Z'), NOW)).toBe('ageing');
    expect(freshness(new Date('2025-12-01T00:00:00Z'), NOW)).toBe('outdated');
  });

  it('keeps "never verified" distinct from "verified long ago"', () => {
    // They call for different work: one needs a first check, the other a recheck.
    expect(freshness(null, NOW)).toBe('never');
  });

  it('puts the boundaries where the labels claim they are', () => {
    const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
    expect(freshness(daysAgo(90), NOW)).toBe('fresh');
    expect(freshness(daysAgo(91), NOW)).toBe('ageing');
    expect(freshness(daysAgo(180), NOW)).toBe('ageing');
    expect(freshness(daysAgo(181), NOW)).toBe('outdated');
  });
});

describe('coverage', () => {
  it('counts false as an answer, not as a gap', () => {
    // "Not sterile" is data. Treating it as missing would penalise the
    // suppliers who filled the form in honestly.
    expect(coverage([false, false, 0]).pct).toBe(100);
  });

  it('counts blank and whitespace-only strings as missing', () => {
    expect(coverage(['x', '', '   ', null]).filled).toBe(1);
  });

  it('is 0 rather than NaN with nothing to measure', () => {
    expect(coverage([])).toEqual({ filled: 0, total: 0, pct: 0 });
  });

  it('weights the roll-up by field count, not by record count', () => {
    // A company with 40 well-filled products should not be dragged to 50% by
    // one empty one.
    const combined = combineCoverage([
      { filled: 80, total: 100, pct: 80 },
      { filled: 0, total: 2, pct: 0 },
    ]);
    expect(combined.pct).toBe(78);
  });
});

describe('rankByQuality', () => {
  const org = (o: Partial<OrgQuality>): OrgQuality => ({
    orgId: 'o',
    name: 'Org',
    country: 'India',
    status: 'verified',
    externalId: null,
    coverage: { filled: 5, total: 10, pct: 50 },
    products: 0,
    sites: 0,
    filings: 0,
    contacts: 0,
    freshness: 'fresh',
    lastVerifiedAt: null,
    missingSource: 0,
    ...o,
  });

  it('puts the worst-covered organisation first — it is a work queue', () => {
    const out = rankByQuality([
      org({ name: 'Good', coverage: { filled: 9, total: 10, pct: 90 } }),
      org({ name: 'Bad', coverage: { filled: 1, total: 10, pct: 10 } }),
    ]);
    expect(out.map((o) => o.name)).toEqual(['Bad', 'Good']);
  });

  it('breaks a coverage tie on staleness, then on unsourced records', () => {
    const out = rankByQuality([
      org({ name: 'Fresh', freshness: 'fresh' }),
      org({ name: 'Never', freshness: 'never' }),
      org({ name: 'Old', freshness: 'outdated' }),
    ]);
    expect(out.map((o) => o.name)).toEqual(['Never', 'Old', 'Fresh']);
  });
});

describe('findDuplicates', () => {
  const never = () => false;
  const orgs = [
    { id: '1', name: 'Sun Pharmaceutical Industries', feiNumber: '3002807546', gstin: null },
    { id: '2', name: 'Sun Pharma Industries Ltd', feiNumber: null, gstin: null },
    { id: '3', name: 'Huahai', feiNumber: '3002807546', gstin: null },
  ];

  it('reports a shared registration number ahead of a similar name', () => {
    // Two companies cannot share an FDA FEI. A similar name is a guess; this
    // is close to proof, so it is reported as its own reason.
    const out = findDuplicates(orgs, never);
    expect(out).toEqual([{ a: { id: '1', name: 'Sun Pharmaceutical Industries' }, b: { id: '3', name: 'Huahai' }, reason: 'fei' }]);
  });

  it('uses the injected name matcher rather than its own idea of similarity', () => {
    const out = findDuplicates(orgs.slice(0, 2), (a, b) => a.startsWith('Sun') && b.startsWith('Sun'));
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe('name');
  });

  it('reports a pair once, not once per direction', () => {
    const out = findDuplicates(orgs.slice(0, 2), () => true);
    expect(out).toHaveLength(1);
  });

  it('does not pair a company with itself on a null identifier', () => {
    // Two companies with no FEI both have `null`, and `null === null`.
    const out = findDuplicates(
      [
        { id: '1', name: 'A', feiNumber: null, gstin: null },
        { id: '2', name: 'B', feiNumber: null, gstin: null },
      ],
      never,
    );
    expect(out).toEqual([]);
  });
});
