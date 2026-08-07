import { describe, it, expect } from 'vitest';
import {
  matchSuppliers,
  holdsCert,
  listsProduct,
  normalizeCas,
  parseCertList,
  explainMatch,
  type MatchableSeller,
} from './matching';

const NOW = new Date('2026-07-17T00:00:00Z');
const FUTURE = new Date('2027-01-01T00:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');

function seller(overrides: Partial<MatchableSeller> = {}): MatchableSeller {
  return {
    id: 'org_sun',
    name: 'Sun Pharma',
    kind: 'seller',
    status: 'verified',
    country: 'India',
    products: [{ cas: '103-90-2', status: 'live' }],
    certifications: [
      { name: 'US FDA GMP', status: 'verified', expiresAt: FUTURE },
      { name: 'WHO PQ', status: 'verified', expiresAt: FUTURE },
    ],
    ...overrides,
  };
}

describe('normalizeCas', () => {
  it('strips whitespace and is comparison-stable', () => {
    expect(normalizeCas('  103-90-2 ')).toBe('103-90-2');
    expect(normalizeCas('103 - 90 - 2')).toBe('103-90-2');
  });
});

describe('parseCertList', () => {
  it('splits csv and drops blanks', () => {
    expect(parseCertList('US FDA GMP, WHO PQ ,')).toEqual(['US FDA GMP', 'WHO PQ']);
  });
  it('handles null/empty', () => {
    expect(parseCertList(null)).toEqual([]);
    expect(parseCertList('')).toEqual([]);
  });
});

describe('holdsCert', () => {
  it('accepts a verified, unexpired cert', () => {
    expect(holdsCert(seller(), 'US FDA GMP', NOW)).toBe(true);
  });

  it('rejects a cert that is only pending review', () => {
    const s = seller({ certifications: [{ name: 'US FDA GMP', status: 'pending', expiresAt: FUTURE }] });
    expect(holdsCert(s, 'US FDA GMP', NOW)).toBe(false);
  });

  it('rejects an expired cert even if verified', () => {
    const s = seller({ certifications: [{ name: 'US FDA GMP', status: 'verified', expiresAt: PAST }] });
    expect(holdsCert(s, 'US FDA GMP', NOW)).toBe(false);
  });

  it('treats a missing expiry as valid', () => {
    const s = seller({ certifications: [{ name: 'US FDA GMP', status: 'verified', expiresAt: null }] });
    expect(holdsCert(s, 'US FDA GMP', NOW)).toBe(true);
  });
});

describe('listsProduct', () => {
  it('matches a live listing by CAS', () => {
    expect(listsProduct(seller(), '103-90-2')).toBe(true);
  });

  it('ignores draft listings', () => {
    const s = seller({ products: [{ cas: '103-90-2', status: 'draft' }] });
    expect(listsProduct(s, '103-90-2')).toBe(false);
  });

  it('does not match a different CAS', () => {
    expect(listsProduct(seller(), '1115-70-4')).toBe(false);
  });
});

describe('matchSuppliers', () => {
  const criteria = { cas: '103-90-2', requiredCerts: ['US FDA GMP', 'WHO PQ'], now: NOW };

  it('matches a verified seller listing the product with all required certs', () => {
    expect(matchSuppliers([seller()], criteria).map((s) => s.id)).toEqual(['org_sun']);
  });

  it('excludes unverified sellers — only verified suppliers receive RFQs (F2.5)', () => {
    expect(matchSuppliers([seller({ status: 'pending' })], criteria)).toHaveLength(0);
  });

  it('excludes buyer-only accounts', () => {
    expect(matchSuppliers([seller({ kind: 'buyer' })], criteria)).toHaveLength(0);
  });

  it('includes "both" (trader/hybrid) accounts', () => {
    expect(matchSuppliers([seller({ kind: 'both' })], criteria)).toHaveLength(1);
  });

  it('requires ALL mandated certs, not any (AND semantics)', () => {
    const partial = seller({
      certifications: [{ name: 'US FDA GMP', status: 'verified', expiresAt: FUTURE }],
    });
    expect(matchSuppliers([partial], criteria)).toHaveLength(0);
  });

  it('excludes a seller whose mandated cert has expired', () => {
    const expired = seller({
      certifications: [
        { name: 'US FDA GMP', status: 'verified', expiresAt: FUTURE },
        { name: 'WHO PQ', status: 'verified', expiresAt: PAST },
      ],
    });
    expect(matchSuppliers([expired], criteria)).toHaveLength(0);
  });

  it('matches when the buyer mandates no certs', () => {
    const bare = seller({ certifications: [] });
    expect(matchSuppliers([bare], { cas: '103-90-2', requiredCerts: [], now: NOW })).toHaveLength(1);
  });

  it('applies the preferred-origin filter when set', () => {
    const cn = seller({ country: 'China' });
    expect(matchSuppliers([cn], { ...criteria, preferredCountry: 'India' })).toHaveLength(0);
    expect(matchSuppliers([cn], { ...criteria, preferredCountry: 'China' })).toHaveLength(1);
  });

  it('returns only the sellers that qualify from a mixed pool', () => {
    const pool = [
      seller({ id: 'ok' }),
      seller({ id: 'unverified', status: 'pending' }),
      seller({ id: 'wrong-cas', products: [{ cas: '1115-70-4', status: 'live' }] }),
      seller({ id: 'no-certs', certifications: [] }),
    ];
    expect(matchSuppliers(pool, criteria).map((s) => s.id)).toEqual(['ok']);
  });
});

describe('explainMatch', () => {
  it('reports no reasons for a clean match', () => {
    expect(explainMatch(seller(), { cas: '103-90-2', requiredCerts: ['WHO PQ'], now: NOW })).toEqual({
      matched: true,
      reasons: [],
    });
  });

  it('explains every failing rule', () => {
    const bad = seller({ status: 'pending', products: [], certifications: [] });
    const { matched, reasons } = explainMatch(bad, {
      cas: '103-90-2',
      requiredCerts: ['US FDA GMP'],
      now: NOW,
    });
    expect(matched).toBe(false);
    expect(reasons).toContain('supplier not verified');
    expect(reasons).toContain('does not list CAS 103-90-2');
    expect(reasons).toContain('missing valid US FDA GMP');
  });
});
