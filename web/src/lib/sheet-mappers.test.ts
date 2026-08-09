import { describe, expect, it } from 'vitest';
import { normaliseHeader } from './xlsx.server';
import {
  PRODUCT_SHEETS,
  REFUSED_CONTACT_COLUMNS,
  fanOutHistory,
  mapCompany,
  mapContact,
  mapFacility,
  mapFiling,
  mapPrice,
  mapProduct,
  type Cells,
} from './sheet-mappers';

/**
 * Builds the `Cells` shape a mapper receives from raw template header text, so
 * these tests exercise the same normalisation the reader applies. Writing the
 * headers exactly as the workbook spells them — `Price USD FOB / kg *`, star and
 * all — is the point: it is what proves the mappers survive the real file.
 */
const cells = (raw: Record<string, string>): Cells =>
  Object.fromEntries(
    Object.entries(raw).map(([header, value], i) => [normaliseHeader(header), { value, ref: `${String.fromCharCode(65 + (i % 26))}47` }]),
  );

const rejections = (r: { issues: { code: string; warning?: boolean }[] }) => r.issues.filter((i) => !i.warning).map((i) => i.code);

describe('mapCompany', () => {
  it('maps the template example row', () => {
    const r = mapCompany(
      cells({
        'Company_ID *': 'SELL-IND-0001',
        'Legal Entity Name *': 'Sun Pharmaceutical Industries Ltd',
        'Trading / Brand Name': 'Sun Pharma API Division',
        'Entity Type *': 'API Manufacturer',
        'Verification Status': 'Verified',
        'Country (HQ) *': 'India',
        'City (HQ) *': 'Mumbai',
        'Website URL *': 'https://sunpharma.com',
        'DUNS Number': '524-129-422',
        'FDA FEI (Primary) *': '3002808027',
        'Year Founded': '1983',
        'Annual Revenue USD M': '4900',
        'Revenue Source Year': 'FY2025',
        'Total Employees': '36000',
        'Therapeutic Areas': 'Antidiabetic; Cardiovascular; CNS',
        'Export Markets *': 'USA; EU; Japan',
        'Incoterms Offered': 'FOB; CIF; DAP; DDP; EXW',
        'Date Scraped': '01-Jun-2025',
      }),
    );
    expect(rejections(r)).toEqual([]);
    expect(r.row).toMatchObject({
      externalId: 'SELL-IND-0001',
      name: 'Sun Pharmaceutical Industries Ltd',
      country: 'India',
      foundedYear: 1983,
      revenueUsdM: 4900,
      revenueYear: 'FY2025',
      // Semicolons become the comma form the schema stores.
      therapeuticAreas: 'Antidiabetic,Cardiovascular,CNS',
      exportMarkets: 'USA,EU,Japan',
      defaultIncoterm: 'EXW',
    });
    expect(r.row?.curatedAt?.toISOString()).toBe('2025-06-01T00:00:00.000Z');
  });

  it('writes curationStatus, NEVER the ops-approval status', () => {
    // The single most dangerous confusion in this import: `Organization.status`
    // gates catalogue visibility and the whole REQUIRES_VERIFIED permission set.
    const r = mapCompany(cells({ 'Company_ID *': 'X', 'Legal Entity Name *': 'A', 'Country (HQ) *': 'India', 'Verification Status': 'Verified' }));
    expect(r.row?.curationStatus).toBe('verified');
    expect(r.row).not.toHaveProperty('status');
  });

  it('rejects an unresolvable country rather than guessing', () => {
    const r = mapCompany(cells({ 'Company_ID *': 'X', 'Legal Entity Name *': 'A', 'Country (HQ) *': 'Freedonia' }));
    expect(rejections(r)).toContain('country.unknown');
    expect(r.row).toBeUndefined();
  });

  it('names the missing required field by column', () => {
    const r = mapCompany(cells({ 'Company_ID *': 'X' }));
    expect(rejections(r)).toEqual(['required.missing', 'required.missing']);
    expect(r.issues.map((i) => i.column)).toEqual(['legal entity name', 'country hq']);
  });

  it('cites the exact cell when the column exists but the cell is empty', () => {
    // The distinction matters to whoever has to fix it: a missing column is a
    // broken file, an empty cell is a gap in one row. Only the second has a
    // cell reference to quote.
    const withColumn = mapCompany(cells({ 'Company_ID *': 'X', 'Legal Entity Name *': '', 'Country (HQ) *': 'India' }));
    expect(withColumn.issues[0]).toMatchObject({ code: 'required.missing', column: 'legal entity name' });
    expect(withColumn.issues[0].cellRef).toBeTruthy();

    const withoutColumn = mapCompany(cells({ 'Company_ID *': 'X', 'Country (HQ) *': 'India' }));
    expect(withoutColumn.issues[0].cellRef).toBeUndefined();
  });
});

describe('mapProduct', () => {
  const apiOpts = PRODUCT_SHEETS[0].opts;

  it('maps the API example row', () => {
    const r = mapProduct(
      cells({
        'Product_ID *': 'API-1115704-0001',
        'Company_ID *': 'SELL-IND-0001',
        'IUPAC Name (Full) *': '1,1-Dimethylbiguanide Hydrochloride',
        'Common / Trade Name *': 'Metformin Hydrochloride',
        'CAS Number *': '1115-70-4',
        'Molecular Formula': 'C4H11N5·HCl',
        'Molecular Weight g/mol': '165.62',
        'Therapeutic Category *': 'Antidiabetic',
        'ATC Code (WHO)': 'A10BA02',
        'Pharmacopoeial Grade *': 'USP / BP / Ph.Eur',
        'Purity Specification *': '≥99.5% (USP 2024)',
        'US DMF Number': 'Type II DMF #23412',
        'Annual Capacity MT': '2400',
        'Current Utilization %': '65%',
        'Price USD FOB / kg *': '14.80',
        'MOQ kg *': '500',
        'Standard Lead Wks *': '6',
        'Incoterms Offered': 'FOB; CIF; DAP; DDP; EXW',
        'Stock Status *': 'In Stock',
        'HS Code (Intl 6-dig)': '292690',
        'Loss on Drying %': '≤0.5%',
      }),
      apiOpts,
    );
    expect(rejections(r)).toEqual([]);
    expect(r.row).toMatchObject({
      companyExternalId: 'SELL-IND-0001',
      externalId: 'API-1115704-0001',
      name: 'Metformin Hydrochloride',
      cas: '1115-70-4',
      productType: 'api',
      facet: 'antidiabetic',
      purityPct: 99.5,
      moqKg: 500,
      leadTimeDays: 42, // "6" on this sheet means six weeks
      priceMin: 14.8,
      priceUnit: 'kg',
      incoterms: 'EXW,FOB,CIF,DAP,DDP',
      utilizationPct: 65,
      hsCode: '292690',
    });
    // Unmapped-but-known columns land in the blob, not on the floor.
    expect(r.row?.specJson).toContain('lossOnDrying');
  });

  it('REFUSES to convert a per-unit FDC price into a per-kg column', () => {
    // $0.042 a tablet in a per-kg column wins every "price, low to high" sort
    // forever and drags the market median for any CAS it shares with an API.
    const fdc = PRODUCT_SHEETS.find((s) => s.sheet.includes('FDC'))!;
    const r = mapProduct(
      cells({
        'Company_ID *': 'SELL-IND-0001',
        'INN / Generic Name *': 'Metformin Hydrochloride',
        'CAS Number *': '1115-70-4',
        'Dosage Form *': 'Tablet (IR)',
        'Strength / Dose *': '500 mg',
        'Price USD / Unit (FOB) *': '0.042',
        'MOQ (units) *': '500000',
      }),
      fdc.opts,
    );
    expect(rejections(r)).toEqual([]);
    expect(r.row?.priceUnit).toBe('unit');
    expect(r.row?.moqUnit).toBe('unit');
    // The value is kept verbatim rather than being multiplied into nonsense.
    expect(r.row?.priceMin).toBe(0.042);
    expect(r.row?.productType).toBe('fdf');
    expect(r.row?.facet).toBe('tablet');
  });

  it('maps a KSM to its parent API by CAS', () => {
    const ksm = PRODUCT_SHEETS.find((s) => s.sheet.includes('KSM'))!;
    const r = mapProduct(
      cells({
        'Company_ID *': 'SELL-IND-0001',
        'Common Name': 'DCDA; Cyanoguanidine',
        'CAS Number *': '461-58-5',
        'Product Type *': 'Key Starting Material',
        'Parent API *': 'Metformin Hydrochloride',
        'Parent API CAS': '1115-70-4',
        'Synthesis Step No': 'Step 1 (Early)',
        'ICH Q11 Classification': 'ICH Q11 Starting Material',
        'Price USD FOB / kg *': '2.80',
        'MOQ kg *': '1000',
      }),
      ksm.opts,
    );
    expect(rejections(r)).toEqual([]);
    expect(r.row).toMatchObject({ productType: 'ksm', parentApiCas: '1115-70-4', ichQ11Class: 'ICH Q11 Starting Material' });
    // KSMs have no facet, and a stray one must not be invented.
    expect(r.row?.facet).toBeNull();
  });

  it('maps an excipient with its dietary tri-states', () => {
    const raw = PRODUCT_SHEETS.find((s) => s.sheet.includes('Raw'))!;
    const r = mapProduct(
      cells({
        'Company_ID *': 'SELL-USA-0042',
        'Common / Trade Name': 'Microcrystalline Cellulose PH-102',
        'CAS Number *': '9004-34-6',
        'Product Type *': 'Excipient',
        'Function Category *': 'Diluent / Filler',
        'Halal Certified': 'Yes (Halal certified)',
        'Kosher Certified': 'Yes',
        'BSE/TSE Free': 'Yes (BSE/TSE free declaration)',
        'Organic Certified': 'No',
        'Price USD / kg (FOB) *': '2.80',
        'MOQ kg *': '5000',
      }),
      raw.opts,
    );
    expect(rejections(r)).toEqual([]);
    expect(r.row).toMatchObject({ productType: 'excipient', facet: 'filler', halal: true, kosher: true, bseTseFree: true });
    // Unstated stays null — a buyer filtering for non-GMO must not be shown an
    // uncurated product, nor have it silently excluded.
    expect(r.row?.nonGmo).toBeNull();
  });

  it('rejects a CAS that fails its check digit', () => {
    const r = mapProduct(cells({ 'Company_ID *': 'X', 'Common / Trade Name *': 'Y', 'CAS Number *': '1115-70-5' }), apiOpts);
    expect(rejections(r)).toContain('cas.checkDigit');
    expect(r.row).toBeUndefined();
  });

  it('does not treat "Not Controlled" as a schedule', () => {
    const r = mapProduct(
      cells({ 'Company_ID *': 'X', 'Common / Trade Name *': 'Y', 'CAS Number *': '103-90-2', 'Controlled Status': 'Not Controlled' }),
      apiOpts,
    );
    expect(r.row?.controlledSchedule).toBeNull();
  });
});

describe('mapFacility', () => {
  it('maps the example row and keeps capacity with its unit', () => {
    const r = mapFacility(
      cells({
        'Site_ID': 'FAC-IND-3002808027',
        'Company_ID *': 'SELL-IND-0001',
        'Site Name *': 'Halol API Facility (Unit I)',
        'Country *': 'India',
        'City / District *': 'Halol',
        'FDA FEI Number *': '3002808027',
        'FDA Inspection Outcome *': 'NAI (No Action Indicated)',
        'Last FDA Inspection Date': '14-Sep-2025',
        'EU Inspection Outcome': 'Satisfactory',
        'Annual Capacity (MT or Units) *': '2400',
        'Capacity Unit': 'MT/year',
        'Current Utilization %': '65%',
        'No of Production Lines': '8',
      }),
    );
    expect(rejections(r)).toEqual([]);
    expect(r.row).toMatchObject({
      regulatoryId: '3002808027',
      fdaInspectionOutcome: 'NAI',
      euInspectionOutcome: 'Satisfactory',
      capacityValue: 2400,
      capacityUnit: 'MT/year',
      utilizationPct: 65,
      productionLines: 8,
    });
  });

  it('drops an inspection outcome that is not one of the exact terms', () => {
    // The template: "Never use informal descriptions." A badge rendering
    // "went well" is worse than no badge.
    const r = mapFacility(
      cells({ 'Company_ID *': 'X', 'Site Name *': 'Y', 'FDA Inspection Outcome *': 'inspection went well' }),
    );
    expect(r.row?.fdaInspectionOutcome).toBeNull();
  });
});

describe('mapFiling', () => {
  it('maps the example row, treating "no expiry" as genuinely null', () => {
    const r = mapFiling(
      cells({
        'Filing_ID': 'RF-2026-0001',
        'Company_ID *': 'SELL-IND-0001',
        'Filing Type *': 'US FDA Type II DMF (API)',
        'Filing Number *': 'Type II DMF #23412',
        'Regulatory Authority *': 'US FDA CDER',
        'Current Status *': 'Active / Current',
        'CAS Number': '1115-70-4',
        'Date Filed': '15-Mar-2014',
        'Expiry Date': 'N/A (DMF — no expiry)',
        'Open for 3rd Party Reference': 'Yes (Open to reference)',
        'No. ANDAs/MAAs Referencing': '48 ANDAs reference this DMF',
        'Annual Filing Fee USD': '$4,867 annual DMF fee (2024 FDA rate)',
        'Manufacturing Site(s) Covered': 'Halol (FEI 3002808027); Ankleshwar (FEI 3002808041)',
      }),
    );
    expect(rejections(r)).toEqual([]);
    expect(r.row).toMatchObject({
      filingNumber: 'Type II DMF #23412',
      status: 'active',
      openToReference: true,
      referencingCount: 48,
      annualFeeUsd: 4867,
    });
    // Null, not a fabricated date. The register buckets it as unknown.
    expect(r.row?.expiresAt).toBeNull();
    expect(r.row?.sitesCovered).toContain(',');
  });
});

describe('mapContact', () => {
  const base = {
    'Contact_ID': 'CON-IND-0001',
    'Company_ID *': 'SELL-IND-0001',
    'First Name *': 'Suresh',
    'Last Name *': 'Kumar',
    'Designation / Job Title *': 'Vice President — International API Exports',
    'Business Email *': 'suresh.kumar@sunpharma.test',
    'Mobile / WhatsApp *': '+91-98765-43210',
    'LinkedIn Profile URL': 'https://linkedin.com/in/example',
    'Territory / Markets Responsible': 'USA; EU27; UK',
    'Response Avg (hours)': '< 4 hours (business hours)',
  };

  it('maps the business contact', () => {
    const r = mapContact(cells(base));
    expect(rejections(r)).toEqual([]);
    expect(r.row).toMatchObject({
      firstName: 'Suresh',
      businessEmail: 'suresh.kumar@sunpharma.test',
      territories: 'USA,EU27,UK',
      responseHours: 4,
    });
  });

  it('REFUSES the personal-data columns, loudly', () => {
    const r = mapContact(
      cells({
        ...base,
        'Personal Email': 'private@gmail.test',
        'Twitter / X Handle': '@example',
        'Interaction Summary': 'Discussed pricing at CPhI',
        'Relationship Status': 'Active Engagement',
      }),
    );
    // The row still imports; the refused columns are reported as warnings so
    // the curator sees they were ignored on purpose.
    expect(r.row).toBeDefined();
    const refused = r.issues.filter((i) => i.code === 'column.refused');
    expect(refused).toHaveLength(4);
    expect(refused.every((i) => i.warning)).toBe(true);
    // And none of it is anywhere in the mapped row.
    expect(JSON.stringify(r.row)).not.toContain('private@gmail.test');
    expect(JSON.stringify(r.row)).not.toContain('CPhI');
  });

  it('lists every refused column explicitly', () => {
    expect([...REFUSED_CONTACT_COLUMNS]).toEqual([
      'personal email',
      'twitter x handle',
      'last contacted',
      'interaction summary',
      'relationship status',
      'key interests pain points',
    ]);
  });
});

describe('mapPrice', () => {
  const base = {
    'Price_Obs_ID': 'PO-20260601-0001',
    'Company_ID': 'SELL-IND-0001',
    'CAS Number *': '1115-70-4',
    'Product Name *': 'Metformin Hydrochloride',
    'Price (Original Currency) *': '14.80',
    'Currency *': 'USD',
    'FX Rate Used': '1.0000',
    'Incoterm *': 'FOB',
    'Supplier Country *': 'India',
    'Destination Country *': 'Germany',
    'Data Confidence *': 'HIGH (PharmaLink Verified)',
    'Date Observed *': '01-Jun-2026',
    'Source Name': 'PharmaLink Escrow Transaction',
  };

  it('maps an observation and derives the weight from the confidence label', () => {
    const r = mapPrice(cells(base));
    expect(rejections(r)).toEqual([]);
    expect(r.row).toMatchObject({
      sourceRef: 'PO-20260601-0001',
      cas: '1115-70-4',
      unitPriceUsdKg: 14.8,
      rawPrice: 14.8,
      dataConfidence: 'HIGH',
      weight: 1,
      originCountry: 'India',
      region: 'Germany',
      incoterm: 'FOB',
    });
  });

  it('rejects a non-USD price with no rate rather than inventing one', () => {
    const r = mapPrice(cells({ ...base, 'Price (Original Currency) *': '1180', 'Currency *': 'INR', 'FX Rate Used': '' }));
    expect(rejections(r)).toContain('fx.rateMissing');
    expect(r.row).toBeUndefined();
  });

  it('fans the 24-month history out into month-anchored rows', () => {
    const r = mapPrice(cells(base));
    const history = fanOutHistory(cells({ ...base, 'M-1 (Most Recent)': '14.80', 'M-2': '15.20', 'M-3': '', 'M-24 (Price USD/kg)': '14.20' }), r.row!);

    // Blank months are skipped, never zero-filled.
    expect(history).toHaveLength(3);
    // Keyed on the absolute month: an M-offset is relative, so an offset-keyed
    // ref would duplicate every row on next month's re-upload.
    expect(history.map((h) => h.sourceRef)).toEqual([
      'PO-20260601-0001#2026-05',
      'PO-20260601-0001#2026-04',
      'PO-20260601-0001#2024-06',
    ]);
    expect(history[0].observedAt.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    // A summarised series never outweighs an evidenced observation.
    expect(history.every((h) => h.sourceType === 'curated' && h.weight <= 0.5)).toBe(true);
  });

  it('produces stable refs across re-upload', () => {
    const r = mapPrice(cells(base));
    const a = fanOutHistory(cells({ ...base, 'M-1 (Most Recent)': '14.80' }), r.row!);
    const b = fanOutHistory(cells({ ...base, 'M-1 (Most Recent)': '14.90' }), r.row!);
    expect(a[0].sourceRef).toBe(b[0].sourceRef);
  });
});

describe('sheet configuration', () => {
  it('declares a unit for every product sheet', () => {
    for (const { sheet, opts } of PRODUCT_SHEETS) {
      expect(['kg', 'unit'], sheet).toContain(opts.priceUnit);
    }
  });

  it('is the FDC sheet, and only the FDC sheet, that is per-unit', () => {
    const perUnit = PRODUCT_SHEETS.filter((s) => s.opts.priceUnit === 'unit').map((s) => s.sheet);
    expect(perUnit).toEqual(['3. FDC & Formulations']);
  });
});
