import { describe, it, expect } from 'vitest';
import {
  ALLOWED_HOSTS,
  EVIDENCE_WEIGHT,
  HS_BY_CAS,
  MARKET_SOURCES,
  PLAUSIBLE_USD_PER_KG,
  comtradeRef,
  comtradeUnitValue,
  customsWeight,
  hsForCas,
  matchMolecule,
  normaliseEnforcement,
  normaliseShortage,
  parseIsoBasic,
  parseUsDate,
  periodToDate,
  sourceById,
  type ComtradeRow,
} from './market-data';

const row = (over: Partial<ComtradeRow> = {}): ComtradeRow => ({
  period: '202401',
  reporterCode: 699,
  flowCode: 'M',
  cmdCode: '292429',
  netWgt: 1000,
  primaryValue: 25_000,
  ...over,
});

describe('source registry', () => {
  it('gives every source a licence and a stated capture status', () => {
    for (const s of MARKET_SOURCES) {
      expect(s.licence.length).toBeGreaterThan(0);
      expect(['live', 'manual', 'blocked']).toContain(s.status);
    }
  });
  it('only allowlists hosts of sources we can actually fetch', () => {
    for (const s of MARKET_SOURCES) {
      if (s.status === 'blocked') expect(s.host).toBeNull();
      if (s.status === 'live') expect(s.host).toBeTruthy();
    }
    expect(ALLOWED_HOSTS).toContain('comtradeapi.un.org');
    expect(ALLOWED_HOSTS).toContain('api.fda.gov');
    // A blocked proprietary source must never end up in the fetch allowlist.
    expect(ALLOWED_HOSTS.some((h) => h.includes('pharmacompass'))).toBe(false);
    expect(ALLOWED_HOSTS.some((h) => h.includes('volza'))).toBe(false);
  });
  it('looks a source up by id', () => {
    expect(sourceById('comtrade')?.kind).toBe('price');
    expect(sourceById('nope')).toBeUndefined();
  });
});

describe('HS map', () => {
  it('has a unique, well-formed HS-6 code per molecule', () => {
    for (const m of HS_BY_CAS) {
      expect(m.hs6).toMatch(/^\d{6}$/);
      expect(m.cas).toMatch(/^\d{2,7}-\d{2}-\d$/);
      expect(m.hsDescription.length).toBeGreaterThan(0);
    }
    expect(new Set(HS_BY_CAS.map((m) => m.cas)).size).toBe(HS_BY_CAS.length);
  });
  it('covers the molecules the demo catalogue actually trades', () => {
    expect(hsForCas('103-90-2')?.hs6).toBe('292429');
    expect(hsForCas('15687-27-1')?.hs6).toBe('291639');
    expect(hsForCas('000-00-0')).toBeUndefined();
  });
  it('marks family-level headings as group, not narrow', () => {
    // "Cyclic amides" covers far more than paracetamol.
    expect(hsForCas('103-90-2')?.specificity).toBe('group');
    // "Vitamin C and its derivatives" is essentially one substance.
    expect(hsForCas('50-81-7')?.specificity).toBe('narrow');
  });
});

describe('evidence weighting', () => {
  it('ranks a closed deal above a quote above a customs aggregate', () => {
    expect(EVIDENCE_WEIGHT.internal_deal).toBeGreaterThan(EVIDENCE_WEIGHT.internal_quote);
    expect(EVIDENCE_WEIGHT.internal_quote).toBeGreaterThan(EVIDENCE_WEIGHT.customs);
    expect(EVIDENCE_WEIGHT.customs).toBeGreaterThan(EVIDENCE_WEIGHT.listing);
  });
  it('halves a customs weight again when the HS line is a whole family', () => {
    expect(customsWeight('group')).toBeLessThan(customsWeight('narrow'));
  });
});

describe('comtradeUnitValue', () => {
  it('derives USD/kg from value ÷ net weight', () => {
    expect(comtradeUnitValue(row())).toMatchObject({ unitPriceUsdKg: 25, quantityKg: 1000 });
  });

  it('dates the observation to the first of the reported month, UTC', () => {
    const r = comtradeUnitValue(row());
    expect('observedAt' in r && r.observedAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('refuses a value with no quantity instead of inventing one', () => {
    expect(comtradeUnitValue(row({ netWgt: 0 }))).toEqual({ rejected: expect.stringContaining('no net weight') });
    expect(comtradeUnitValue(row({ netWgt: null }))).toHaveProperty('rejected');
  });

  it('refuses a row with no trade value', () => {
    expect(comtradeUnitValue(row({ primaryValue: 0 }))).toEqual({ rejected: 'no trade value' });
  });

  it('falls back to qty only when its unit really is kilograms', () => {
    expect(comtradeUnitValue(row({ netWgt: 0, qty: 500, qtyUnitCode: 8 }))).toMatchObject({ quantityKg: 500 });
    // Unit code 5 is "number of items" — dividing by it would be nonsense.
    expect(comtradeUnitValue(row({ netWgt: 0, qty: 500, qtyUnitCode: 5 }))).toHaveProperty('rejected');
  });

  it('rejects implausible unit values on both sides', () => {
    expect(comtradeUnitValue(row({ primaryValue: 1, netWgt: 1_000_000 }))).toHaveProperty('rejected');
    expect(comtradeUnitValue(row({ primaryValue: 1_000_000_000, netWgt: 1 }))).toHaveProperty('rejected');
    // ...and accepts values just inside the band.
    expect(comtradeUnitValue(row({ primaryValue: PLAUSIBLE_USD_PER_KG.min * 10, netWgt: 10 }))).toHaveProperty('unitPriceUsdKg');
  });

  it('rejects an unparseable period', () => {
    expect(comtradeUnitValue(row({ period: '2024-1' }))).toHaveProperty('rejected');
    expect(comtradeUnitValue(row({ period: '202413' }))).toHaveProperty('rejected');
  });

  it('builds a natural key that is stable per reporter/flow/commodity/period', () => {
    expect(comtradeRef(row())).toBe('comtrade:699:M:292429:202401');
    expect(comtradeRef(row({ flowCode: 'X' }))).not.toBe(comtradeRef(row()));
  });
});

describe('date parsing', () => {
  it('reads openFDA shortage dates (MM/DD/YYYY)', () => {
    expect(parseUsDate('03/25/2026')?.toISOString()).toBe('2026-03-25T00:00:00.000Z');
  });
  it('reads enforcement dates (YYYYMMDD)', () => {
    expect(parseIsoBasic('20260325')?.toISOString()).toBe('2026-03-25T00:00:00.000Z');
  });
  it('returns null rather than an Invalid Date', () => {
    expect(parseUsDate(undefined)).toBeNull();
    expect(parseUsDate('not a date')).toBeNull();
    expect(parseIsoBasic('2026-03-25')).toBeNull();
  });
  it('parses Comtrade annual and monthly periods', () => {
    expect(periodToDate('2024')?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(periodToDate('202412')?.toISOString()).toBe('2024-12-01T00:00:00.000Z');
    expect(periodToDate('abc')).toBeNull();
  });
});

describe('normaliseShortage', () => {
  const base = { generic_name: 'Amoxicillin Capsule', company_name: 'Acme Ltd', update_date: '03/25/2026', package_ndc: '1-2-3' };

  it('separates a live shortage from a discontinuation', () => {
    expect(normaliseShortage({ ...base, status: 'Currently in Shortage' })).toMatchObject({ eventType: 'shortage', severity: 'high' });
    expect(normaliseShortage({ ...base, status: 'To Be Discontinued' })).toMatchObject({ eventType: 'discontinuation', severity: 'medium' });
    expect(normaliseShortage({ ...base, status: 'Resolved' })).toMatchObject({ eventType: 'shortage', severity: 'low' });
  });
  it('keys on the NDC and update date so re-ingesting is idempotent', () => {
    expect(normaliseShortage({ ...base, status: 'Resolved' })?.sourceRef).toBe('openfda-shortage:1-2-3:03/25/2026');
  });
  it('drops records with no name or no usable date', () => {
    expect(normaliseShortage({ ...base, generic_name: '  ' })).toBeNull();
    expect(normaliseShortage({ generic_name: 'X', update_date: 'garbage' })).toBeNull();
  });
});

describe('normaliseEnforcement', () => {
  const base = {
    recall_number: 'D-123-2026',
    classification: 'Class I',
    recalling_firm: 'Acme Ltd',
    product_description: 'Paracetamol Tablets USP 500 mg',
    reason_for_recall: 'Failed dissolution',
    recall_initiation_date: '20260110',
  };

  it('maps FDA recall classes onto severity', () => {
    expect(normaliseEnforcement(base)?.severity).toBe('high');
    expect(normaliseEnforcement({ ...base, classification: 'Class II' })?.severity).toBe('medium');
    expect(normaliseEnforcement({ ...base, classification: 'Class III' })?.severity).toBe('low');
  });
  it('keys on the recall number', () => {
    expect(normaliseEnforcement(base)?.sourceRef).toBe('openfda-recall:D-123-2026');
  });
  it('drops records with no recall number or no date', () => {
    expect(normaliseEnforcement({ ...base, recall_number: undefined })).toBeNull();
    expect(normaliseEnforcement({ ...base, recall_initiation_date: undefined })).toBeNull();
  });
});

describe('matchMolecule', () => {
  it('matches a molecule named inside a product string', () => {
    expect(matchMolecule('Paracetamol Tablets USP 500 mg')).toBe('103-90-2');
    expect(matchMolecule('AMOXICILLIN and Clavulanate Potassium')).toBe('26787-78-0');
  });
  it('does NOT match a different molecule that merely contains the name', () => {
    // Oxytetracycline is not Tetracycline — different substance, different supply base.
    expect(matchMolecule('Oxytetracycline injection')).toBeNull();
  });
  it('returns null rather than guessing when nothing matches', () => {
    expect(matchMolecule('Sodium chloride 0.9% injection')).toBeNull();
    expect(matchMolecule('')).toBeNull();
  });
});
