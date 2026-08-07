import { describe, expect, it } from 'vitest';
import {
  parseDate,
  parseSites,
  parseCredentials,
  summarizeLocation,
  validateOnboarding,
  requiresSite,
  SUPPLIER_TYPES,
  SELLER_CREDENTIALS,
  BUYER_CREDENTIALS,
} from './onboarding';

const NOW = new Date('2026-08-03T00:00:00.000Z');

describe('parseDate', () => {
  it('parses a yyyy-mm-dd form value', () => {
    expect(parseDate('2027-01-31')?.toISOString()).toBe('2027-01-31T00:00:00.000Z');
  });

  it('returns null for empty input', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('   ')).toBeNull();
  });

  // An Invalid Date reaching Prisma throws at write time, far from the cause.
  it('returns null rather than an Invalid Date for junk', () => {
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('2027-13-45')).toBeNull();
  });
});

describe('parseSites', () => {
  it('skips untouched rows (the wizard renders blank spares)', () => {
    const sites = parseSites([
      { name: 'Halol Unit II', city: 'Halol', country: 'India' },
      { name: '', city: '', country: '' },
      { name: '   ' },
    ]);
    expect(sites).toHaveLength(1);
    expect(sites[0].name).toBe('Halol Unit II');
  });

  it('captures the structured address and trims blanks to null', () => {
    const [s] = parseSites([
      {
        name: 'Unit 3',
        addressLine: ' Plot 12, GIDC ',
        city: 'Ankleshwar',
        state: 'Gujarat',
        postalCode: '393002',
        country: 'India',
        regulatoryId: ' 3002807546 ',
        siteType: 'manufacturing',
      },
    ]);
    expect(s.addressLine).toBe('Plot 12, GIDC');
    expect(s.regulatoryId).toBe('3002807546');
    expect(s.postalCode).toBe('393002');
  });

  it('defaults an unknown or missing site type to manufacturing', () => {
    expect(parseSites([{ name: 'A' }])[0].siteType).toBe('manufacturing');
    expect(parseSites([{ name: 'A', siteType: 'wharf' }])[0].siteType).toBe('manufacturing');
    expect(parseSites([{ name: 'A', siteType: 'warehouse' }])[0].siteType).toBe('warehouse');
  });
});

describe('summarizeLocation', () => {
  it('joins the address parts that were supplied', () => {
    expect(summarizeLocation({ city: 'Halol', state: 'Gujarat', country: 'India' })).toBe('Halol, Gujarat, India');
    expect(summarizeLocation({ city: 'Halol', country: 'India' })).toBe('Halol, India');
  });

  it('falls back to free-text location when no parts are given', () => {
    expect(summarizeLocation({ location: 'Halol, GJ' })).toBe('Halol, GJ');
    expect(summarizeLocation({})).toBe('');
  });
});

describe('parseCredentials', () => {
  it('reads number, authority, expiry and the linked document', () => {
    const [c] = parseCredentials([
      {
        name: 'Manufacturing licence (Form 25/28)',
        category: 'licence',
        number: 'MFG/GJ/2019/1183',
        issuingAuthority: 'State FDA',
        expiresAt: '2028-03-31',
        documentId: 'doc_1',
      },
    ]);
    expect(c.category).toBe('licence');
    expect(c.number).toBe('MFG/GJ/2019/1183');
    expect(c.expiresAt?.toISOString()).toBe('2028-03-31T00:00:00.000Z');
    expect(c.documentId).toBe('doc_1');
  });

  it('treats any unrecognised category as a certification', () => {
    expect(parseCredentials([{ name: 'X', category: 'nonsense' }])[0].category).toBe('certification');
    expect(parseCredentials([{ name: 'X' }])[0].category).toBe('certification');
  });

  it('skips rows with no name', () => {
    expect(parseCredentials([{ name: '', number: 'ABC' }])).toHaveLength(0);
  });
});

describe('validateOnboarding', () => {
  const base = { regNumber: '24AAACZ9999Q1ZP', supplierType: null, sites: [], credentials: [] };

  it('accepts a minimal valid submission', () => {
    expect(validateOnboarding(base, NOW)).toEqual([]);
  });

  it('requires a registration number', () => {
    expect(validateOnboarding({ ...base, regNumber: null }, NOW)).toContain('regNumberRequired');
  });

  // The core anti-fraud rule: GMP is issued per site, so a manufacturer with no
  // declared site is making a claim nobody can ever verify.
  it('requires a site when the org claims to manufacture', () => {
    for (const type of ['manufacturer', 'cdmo']) {
      expect(validateOnboarding({ ...base, supplierType: type }, NOW)).toContain('siteRequiredForManufacturer');
    }
  });

  it('does not require a site from traders or distributors', () => {
    for (const type of ['trader', 'distributor']) {
      expect(validateOnboarding({ ...base, supplierType: type }, NOW)).toEqual([]);
    }
  });

  it('is satisfied once a manufacturer declares a site', () => {
    const sites = parseSites([{ name: 'Halol', city: 'Halol', country: 'India' }]);
    expect(validateOnboarding({ ...base, supplierType: 'manufacturer', sites }, NOW)).toEqual([]);
  });

  it('requires a number on a licence but not on a certification', () => {
    const licence = parseCredentials([{ name: 'IEC', category: 'licence' }]);
    expect(validateOnboarding({ ...base, credentials: licence }, NOW)).toContain('licenceNumberRequired');

    const cert = parseCredentials([{ name: 'US FDA GMP', category: 'certification' }]);
    expect(validateOnboarding({ ...base, credentials: cert }, NOW)).toEqual([]);
  });

  it('rejects a credential that already expired', () => {
    const expired = parseCredentials([{ name: 'EU GMP', expiresAt: '2020-01-01' }]);
    expect(validateOnboarding({ ...base, credentials: expired }, NOW)).toContain('credentialExpiryInPast');
  });

  it('reports every problem at once, not just the first', () => {
    const issues = validateOnboarding(
      {
        regNumber: null,
        supplierType: 'manufacturer',
        sites: [],
        credentials: parseCredentials([{ name: 'IEC', category: 'licence', expiresAt: '2019-05-05' }]),
      },
      NOW,
    );
    // That licence row is both unnumbered AND expired, so it trips two checks
    // on its own — four issues total, which is the point of the rule.
    expect(new Set(issues)).toEqual(
      new Set([
        'regNumberRequired',
        'siteRequiredForManufacturer',
        'licenceNumberRequired',
        'credentialExpiryInPast',
      ]),
    );
    expect(issues).toHaveLength(4);
  });
});

describe('requiresSite', () => {
  it('is true only for the types that physically make product', () => {
    expect(requiresSite('manufacturer')).toBe(true);
    expect(requiresSite('cdmo')).toBe(true);
    expect(requiresSite('trader')).toBe(false);
    expect(requiresSite('distributor')).toBe(false);
    expect(requiresSite(null)).toBe(false);
    expect(requiresSite(undefined)).toBe(false);
  });
});

describe('catalogues', () => {
  it('every supplier type is a non-empty slug', () => {
    expect(SUPPLIER_TYPES.length).toBe(4);
    for (const t of SUPPLIER_TYPES) expect(t).toMatch(/^[a-z]+$/);
  });

  it('every offered credential declares a valid category', () => {
    for (const c of [...SELLER_CREDENTIALS, ...BUYER_CREDENTIALS]) {
      expect(['certification', 'licence']).toContain(c.category);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.authority.length).toBeGreaterThan(0);
    }
  });

  it('offers buyers a wholesale drug licence — you cannot sell APIs to an unlicensed buyer', () => {
    expect(BUYER_CREDENTIALS.some((c) => /Form 20B|Form 21B/.test(c.name))).toBe(true);
  });
});
