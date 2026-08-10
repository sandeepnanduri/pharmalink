import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  API_COLUMNS,
  COMPANY_COLUMNS,
  CONTACT_COLUMNS,
  EXCIPIENT_COLUMNS,
  FACILITY_COLUMNS,
  FDC_COLUMNS,
  FILING_COLUMNS,
  KSM_COLUMNS,
  PRICE_COLUMNS,
  PRODUCT_SHEET_EXPORTS,
  boolCell,
  dateCell,
  semis,
  type Column,
} from './template-export';
import { normaliseHeader } from './xlsx.server';
import { PRODUCT_TYPES } from './taxonomy';
import {
  PRODUCT_SHEETS,
  REFUSED_CONTACT_COLUMNS,
  mapCompany,
  mapContact,
  mapFacility,
  mapFiling,
  mapPrice,
  mapProduct,
  type Cells,
} from './sheet-mappers';

/**
 * Turns exported rows back into the `Cells` shape a mapper reads, exactly as
 * `readSheet` would: normalised header keys, string values, an A1 reference.
 *
 * This is the round trip. If a header drifts by one character the mapper stops
 * seeing the column and the assertion below fails, which is the whole point of
 * the file.
 */
function roundTrip<T>(columns: Column<T>[], row: T): Cells {
  const cells: Cells = {};
  columns.forEach((col, i) => {
    cells[normaliseHeader(col.header)] = { value: col.value(row), ref: `${String.fromCharCode(65 + i)}2` };
  });
  return cells;
}

describe('cell formatting', () => {
  it('writes dates the importer can read, in English', () => {
    // getFormatter() renders Chinese month names under zh. A workbook whose
    // dates say 1-六月-2025 re-imports as date.unparseable on every row.
    expect(dateCell(new Date(Date.UTC(2025, 5, 1)))).toBe('01-Jun-2025');
    expect(dateCell(null)).toBe('');
  });

  it('converts comma-stored lists back to the template semicolons', () => {
    expect(semis('USA,EU,Japan')).toBe('USA; EU; Japan');
    expect(semis(null)).toBe('');
  });

  it('keeps an unknown tri-state blank rather than answering No', () => {
    // "No halal certification recorded" and "not halal" are different claims.
    expect(boolCell(null)).toBe('');
    expect(boolCell(false)).toBe('No');
    expect(boolCell(true)).toBe('Yes');
  });
});

describe('company round trip', () => {
  const row = {
    externalId: 'SELL-IND-0007',
    name: 'Kaveri Life Sciences Ltd',
    tradingName: 'Kaveri API',
    parentCompany: 'Kaveri Holdings',
    supplierType: 'API Manufacturer',
    curationStatus: 'verified',
    country: 'India',
    state: 'Telangana',
    city: 'Hyderabad',
    addressLine: 'Plot 14, Genome Valley',
    postalCode: '500078',
    website: 'https://kaveri-ls.test',
    generalEmail: 'info@kaveri-ls.test',
    hqPhone: '+91 40 1234 5678',
    linkedinUrl: 'https://linkedin.com/company/kaveri',
    regNumber: 'U24232TG1996PLC012345',
    gstin: '36AABCK1234M1Z5',
    duns: '650123456',
    feiNumber: '3009991111',
    iec: '0996012345',
    foundedYear: 1996,
    revenueUsdM: 410,
    revenueYear: 'FY2025',
    employees: 3400,
    therapeuticAreas: 'Antidiabetic,Cardiovascular',
    exportMarkets: 'USA,EU,Japan',
    defaultPaymentTerms: '30% advance, 70% against BL',
    defaultIncoterm: 'FOB',
    sourceUrl: 'https://kaveri-ls.test/about',
    dataSourceName: 'Company website',
    curatedAt: new Date(Date.UTC(2026, 5, 1)),
    lastVerifiedAt: new Date(Date.UTC(2026, 6, 15)),
    curationNote: 'FEI confirmed against the FDA establishment list.',
  };

  it('survives export → import unchanged', () => {
    const result = mapCompany(roundTrip(COMPANY_COLUMNS, row));
    expect(result.row).not.toBeNull();
    expect(result.row).toMatchObject({
      externalId: 'SELL-IND-0007',
      name: 'Kaveri Life Sciences Ltd',
      country: 'India',
      feiNumber: '3009991111',
      foundedYear: 1996,
      revenueUsdM: 410,
      employees: 3400,
      // Semicolons out, commas back in — the storage convention is restored.
      exportMarkets: 'USA,EU,Japan',
      therapeuticAreas: 'Antidiabetic,Cardiovascular',
      curationStatus: 'verified',
      lastVerifiedAt: new Date(Date.UTC(2026, 6, 15)),
    });
  });

  it('never writes a column that could publish a supplier', () => {
    // Organization.status is ops approval and gates the whole catalogue. A
    // round trip must not be able to set it.
    const headers = COMPANY_COLUMNS.map((c) => normaliseHeader(c.header));
    expect(headers).toContain('verification status'); // curation quality
    expect(headers).not.toContain('status');
    expect(headers).not.toContain('approval status');
  });
});

describe('product round trip', () => {
  const base = {
    companyExternalId: 'SELL-IND-0007',
    externalId: 'API-1039020-0001',
    name: 'Paracetamol (Acetaminophen)',
    cas: '103-90-2',
    productType: 'api',
    facet: 'anti-inflammatory',
    grade: 'USP / EP',
    purity: '99.8%',
    moqKg: 25,
    leadTimeDays: 21,
    priceMin: 4.2,
    incoterms: 'FOB,CIF,DAP',
    coldChain: 'ambient',
    stockStatus: 'in_stock',
    sampleAvailable: true,
    iupacName: 'N-(4-hydroxyphenyl)acetamide',
    formula: 'C8H9NO2',
    molecularWeight: 151.16,
    atcCode: 'N02BE01',
    dmfNumber: 'US DMF 23412',
    cepNumber: 'CEP 2019-021-3-0',
    asmfNumber: null,
    controlledSchedule: null,
    capacityMtYr: 1200,
    hsCode: '292429',
    hsnCode: '29242990',
    parentApiName: null,
    parentApiCas: null,
    synthesisStep: null,
    ichQ11Class: null,
    strength: null,
    routeOfAdmin: null,
    origin: null,
    nonGmo: null,
    bseTseFree: null,
    halal: null,
    kosher: null,
    vendorQualStatus: 'Approved',
    sourceUrl: 'https://kaveri-ls.test/products',
  };

  const optsFor = (sheet: string) => PRODUCT_SHEETS.find((s) => s.sheet === sheet)!.opts;

  it('survives export → import unchanged on the API sheet', () => {
    const result = mapProduct(roundTrip(API_COLUMNS, base), optsFor('2. API Products'));
    expect(result.row).toMatchObject({
      companyExternalId: 'SELL-IND-0007',
      externalId: 'API-1039020-0001',
      cas: '103-90-2',
      productType: 'api',
      facet: 'anti-inflammatory',
      grade: 'USP / EP',
      purity: '99.8%',
      purityPct: 99.8,
      moqKg: 25,
      priceMin: 4.2,
      priceUnit: 'kg',
      incoterms: 'FOB,CIF,DAP',
      stockStatus: 'in_stock',
      sampleAvailable: true,
      formula: 'C8H9NO2',
      molecularWeight: 151.16,
      hsCode: '292429',
      capacityMtYr: 1200,
    });
  });

  it('keeps a per-unit FDC price per-unit', () => {
    // $0.042 a tablet landing in a per-kg column wins every price-low sort
    // forever and drags the median for any CAS the API shares.
    const fdc = { ...base, productType: 'fdf', priceMin: 0.042, facet: 'tablet', strength: '500 mg', routeOfAdmin: 'Oral' };
    const result = mapProduct(roundTrip(FDC_COLUMNS, fdc), optsFor('3. FDC & Formulations'));
    expect(result.row).toMatchObject({ priceUnit: 'unit', priceMin: 0.042, strength: '500 mg', routeOfAdmin: 'Oral' });
  });

  it('carries a KSM back to its parent API', () => {
    const ksm = { ...base, productType: 'ksm', parentApiName: 'Paracetamol', parentApiCas: '103-90-2', synthesisStep: 'Step 2 of 3' };
    const result = mapProduct(roundTrip(KSM_COLUMNS, ksm), optsFor('4. KSMs & Intermediates'));
    expect(result.row).toMatchObject({ productType: 'ksm', parentApiName: 'Paracetamol', parentApiCas: '103-90-2', synthesisStep: 'Step 2 of 3' });
  });

  it('round-trips excipient dietary flags without inventing a No', () => {
    const exc = { ...base, productType: 'excipient', facet: 'binder', halal: true, kosher: null, bseTseFree: true, nonGmo: false, origin: 'Plant' };
    const result = mapProduct(roundTrip(EXCIPIENT_COLUMNS, exc), optsFor('5. Raw Materials & Excipients'));
    expect(result.row).toMatchObject({ halal: true, bseTseFree: true, nonGmo: false, origin: 'Plant' });
    expect(result.row!.kosher).toBeNull();
  });

  it('rounds lead time up, never down', () => {
    // 10 days exported as "1 week" would come back promising three days the
    // supplier never offered.
    const result = mapProduct(roundTrip(API_COLUMNS, { ...base, leadTimeDays: 10 }), optsFor('2. API Products'));
    expect(result.row!.leadTimeDays).toBe(14);
  });

  it('writes each sheet price under the header that sheet is read by', () => {
    // The word order differs between sheets — sheet 2 is read as
    // `price usd fob kg`, sheet 5 as `price usd kg fob`. A header that
    // normalises to the other order drops the price silently on re-upload,
    // which is exactly what this caught the first time it ran.
    const exported = new Map([
      ['2. API Products', API_COLUMNS],
      ['3. FDC & Formulations', FDC_COLUMNS],
      ['4. KSMs & Intermediates', KSM_COLUMNS],
      ['5. Raw Materials & Excipients', EXCIPIENT_COLUMNS],
    ]);
    for (const { sheet, opts } of PRODUCT_SHEETS) {
      const keys = (exported.get(sheet) ?? []).map((c) => normaliseHeader(c.header));
      expect(keys, `${sheet} price`).toContain(opts.priceHeader);
      expect(keys, `${sheet} MOQ`).toContain(opts.moqHeader);
      if (opts.facetHeader) expect(keys, `${sheet} facet`).toContain(opts.facetHeader);
    }
  });

  it('covers every product type the catalogue can hold', () => {
    // Read from the vocabulary, not a hand-listed set. A type with no sheet is
    // a listing that disappears from the export silently — which is exactly
    // what happened to `specialty` until this assertion was written this way.
    const covered = PRODUCT_SHEET_EXPORTS.flatMap((s) => s.productTypes);
    expect(new Set(covered).size).toBe(covered.length); // no type on two sheets
    expect([...covered].sort()).toEqual([...PRODUCT_TYPES].sort());
  });
});

describe('filing round trip', () => {
  it('keeps a no-expiry DMF blank rather than inventing a date', () => {
    const row = {
      companyExternalId: 'SELL-IND-0007',
      externalId: 'RF-2026-0001',
      filingType: 'US FDA Type II DMF',
      filingNumber: 'Type II DMF #23412',
      authority: 'US FDA CDER',
      country: 'United States',
      status: 'active',
      cas: '103-90-2',
      productName: 'Paracetamol (Acetaminophen)',
      filedAt: new Date(Date.UTC(2014, 0, 15)),
      approvedAt: new Date(Date.UTC(2014, 5, 1)),
      expiresAt: null,
      renewalDueAt: null,
      holderName: 'Kaveri API Division',
      scope: 'Paracetamol USP, all strengths',
      openToReference: true,
      referencingCount: 48,
      annualFeeUsd: 4867,
      sitesCovered: '3002807546,3002808041',
      sourceUrl: 'https://www.accessdata.fda.gov/scripts/cder/daf/',
      lastVerifiedAt: new Date(Date.UTC(2026, 6, 20)),
      notes: null,
    };
    const result = mapFiling(roundTrip(FILING_COLUMNS, row));
    expect(result.row).toMatchObject({
      filingNumber: 'Type II DMF #23412',
      status: 'active',
      openToReference: true,
      referencingCount: 48,
      annualFeeUsd: 4867,
      sitesCovered: '3002807546,3002808041',
    });
    // Blank, so the register still buckets it as unknown and not as ok.
    expect(result.row!.expiresAt).toBeNull();
  });
});

describe('facility round trip', () => {
  it('keeps the capacity unit with the capacity value', () => {
    const row = {
      companyExternalId: 'SELL-IND-0007',
      externalId: 'SITE-0001',
      name: 'Genome Valley Unit II',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      addressLine: 'Plot 14',
      postalCode: '500078',
      siteType: 'manufacturing',
      regulatoryId: '3002807546',
      emaSiteRef: null,
      fdaGmpStatus: 'Approved',
      euGmpStatus: 'Approved',
      whoGmpStatus: null,
      lastFdaInspectionAt: new Date(Date.UTC(2025, 2, 11)),
      fdaInspectionOutcome: 'NAI',
      lastEuInspectionAt: null,
      euInspectionOutcome: null,
      form483Count: 0,
      capacityValue: 500000000,
      capacityUnit: 'tablets',
      manufacturingType: 'Oral solids',
      containmentLevel: 'OEB 3',
      sterile: false,
      coldChainCapability: null,
      productionLines: 6,
      qcLabs: 2,
      yearEstablished: 2004,
      employees: 820,
      sourceUrl: 'https://kaveri-ls.test/sites',
      lastVerifiedAt: new Date(Date.UTC(2026, 6, 20)),
    };
    const result = mapFacility(roundTrip(FACILITY_COLUMNS, row));
    expect(result.row).toMatchObject({
      regulatoryId: '3002807546',
      fdaInspectionOutcome: 'NAI',
      capacityValue: 500000000,
      capacityUnit: 'tablets',
      productionLines: 6,
      yearEstablished: 2004,
    });
  });
});

describe('contact round trip', () => {
  const row = {
    companyExternalId: 'SELL-IND-0007',
    externalId: 'CON-0001',
    salutation: 'Dr',
    firstName: 'Meera',
    lastName: 'Raghavan',
    jobTitle: 'VP Business Development',
    department: 'Commercial',
    seniority: 'VP',
    primaryRole: 'Sales',
    businessEmail: 'meera@kaveri-ls.test',
    officePhone: '+91 40 1234 5678',
    mobile: '+91 98765 43210',
    linkedinUrl: 'https://linkedin.com/in/meera',
    city: 'Hyderabad',
    country: 'India',
    territories: 'EU,USA',
    languages: 'English,Hindi,Telugu',
    responseHours: 12,
    bestContactTime: '09:00-17:00',
    lastVerifiedAt: new Date(Date.UTC(2026, 6, 20)),
  };

  it('survives export → import unchanged', () => {
    const result = mapContact(roundTrip(CONTACT_COLUMNS, row));
    expect(result.row).toMatchObject({
      firstName: 'Meera',
      lastName: 'Raghavan',
      seniority: 'VP',
      businessEmail: 'meera@kaveri-ls.test',
      territories: 'EU,USA',
      languages: 'English,Hindi,Telugu',
      responseHours: 12,
    });
  });

  it('emits no column for data the importer refuses', () => {
    // Refusing personal data on the way in and offering a column for it on the
    // way out would invite a curator to fill it in and upload it back.
    const headers = CONTACT_COLUMNS.map((c) => normaliseHeader(c.header));
    for (const refused of REFUSED_CONTACT_COLUMNS) expect(headers).not.toContain(refused);
  });

  it('produces no refusal warnings when re-imported', () => {
    const result = mapContact(roundTrip(CONTACT_COLUMNS, row));
    expect(result.issues.filter((i) => i.code === 'column.refused')).toEqual([]);
  });
});

describe('price round trip', () => {
  it('preserves the original currency and the rate used', () => {
    // A converted figure whose inputs are gone cannot be audited, and
    // re-importing the USD number as the original loses the source for good.
    const row = {
      sourceRef: 'PRICE-2026-0001',
      companyExternalId: 'SELL-IND-0007',
      cas: '103-90-2',
      productName: 'Paracetamol (Acetaminophen)',
      observedAt: new Date(Date.UTC(2026, 5, 1)),
      rawPrice: 371.5,
      rawCurrency: 'INR',
      fxRate: 83.4,
      quantityKg: 1000,
      incoterm: 'FOB',
      region: 'United States',
      originCountry: 'India',
      purityGrade: '99.5%',
      validUntil: new Date(Date.UTC(2026, 8, 30)),
      sourceType: 'listing',
      sourceName: 'Supplier catalogue',
      sourceUrl: 'https://kaveri-ls.test/pricing',
      dataConfidence: 'MEDIUM',
      outlierFlag: false,
      outlierReason: null,
    };
    const result = mapPrice(roundTrip(PRICE_COLUMNS, row));
    expect(result.row).toMatchObject({
      sourceRef: 'PRICE-2026-0001',
      cas: '103-90-2',
      rawPrice: 371.5,
      rawCurrency: 'INR',
      fxRate: 83.4,
      originCountry: 'India',
      dataConfidence: 'MEDIUM',
      outlierFlag: false,
    });
    expect(result.row!.unitPriceUsdKg).toBeCloseTo(4.454, 3);
  });

  it('carries an outlier flag and its reason back out and in', () => {
    const row = {
      sourceRef: 'PRICE-2026-0002',
      companyExternalId: null,
      cas: '103-90-2',
      productName: 'Paracetamol (Acetaminophen)',
      observedAt: new Date(Date.UTC(2026, 5, 1)),
      rawPrice: 980,
      rawCurrency: 'USD',
      fxRate: null,
      quantityKg: null,
      incoterm: null,
      region: 'WLD',
      originCountry: null,
      purityGrade: null,
      validUntil: null,
      sourceType: 'listing',
      sourceName: 'Supplier catalogue',
      sourceUrl: null,
      dataConfidence: 'LOW',
      outlierFlag: true,
      outlierReason: 'Decimal point error in source',
    };
    const result = mapPrice(roundTrip(PRICE_COLUMNS, row));
    // An exclusion that does not survive the round trip gets silently
    // reinstated on the next upload.
    expect(result.row).toMatchObject({ outlierFlag: true, outlierReason: 'Decimal point error in source' });
  });
});

describe('every exported header is one the importer reads', () => {
  /**
   * The structural guarantee, and the reason this file is worth its length.
   *
   * A mapper looks columns up by normalised header text. A header that
   * normalises to a key no mapper looks up is a column that silently vanishes
   * on re-upload — no error, no warning, just data quietly not coming back. The
   * round-trip fixtures above catch that for the fields they happen to set;
   * this catches it for every column, including ones no fixture populates.
   *
   * The mapper's read set is extracted from its own source rather than
   * duplicated here, because a hand-copied list is one more thing to drift.
   */
  const source = readFileSync(new URL('./sheet-mappers.ts', import.meta.url), 'utf8');
  const readKeys = new Set(
    // get(c, 'x') / required(c, 'x', …) / num(c, 'x', …) / date(…) / cas(…) /
    // spec map keys / PRODUCT_SHEETS option headers all appear as quoted
    // lowercase strings; taking every one of them over-accepts slightly, which
    // is the safe direction for an assertion about absence.
    [...source.matchAll(/'([a-z0-9][a-z0-9 ]*)'/g)].map((m) => m[1]),
  );

  const sheets: [string, Column<never>[]][] = [
    ['company', COMPANY_COLUMNS as Column<never>[]],
    ['api', API_COLUMNS as Column<never>[]],
    ['fdc', FDC_COLUMNS as Column<never>[]],
    ['ksm', KSM_COLUMNS as Column<never>[]],
    ['excipient', EXCIPIENT_COLUMNS as Column<never>[]],
    ['filing', FILING_COLUMNS as Column<never>[]],
    ['facility', FACILITY_COLUMNS as Column<never>[]],
    ['contact', CONTACT_COLUMNS as Column<never>[]],
    ['price', PRICE_COLUMNS as Column<never>[]],
  ];

  for (const [name, columns] of sheets) {
    it(`${name}: no duplicate headers`, () => {
      const keys = columns.map((c) => normaliseHeader(c.header));
      expect(new Set(keys).size).toBe(keys.length);
    });

    it(`${name}: every header is looked up by a mapper`, () => {
      const orphans = columns.map((c) => normaliseHeader(c.header)).filter((k) => k === '' || !readKeys.has(k));
      expect(orphans).toEqual([]);
    });
  }
});
