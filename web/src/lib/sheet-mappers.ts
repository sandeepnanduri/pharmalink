/**
 * One pure mapper per curation-template sheet — no DB, no xlsx, no Next.
 *
 * Each takes a plain `Record<header, string>` and returns either a row ready to
 * write or a coded error. That shape is deliberate:
 *
 *  - **Never silently drop a row.** `csv.ts` set this contract and it holds
 *    here: every rejection names the sheet, the row, the column, the real Excel
 *    cell reference and a stable machine code. `'2. API Products'!I47` is what
 *    lets a curator fix the cell rather than re-read the file.
 *  - **Codes, not sentences.** The UI groups by code, the message catalogue
 *    renders it, and a test asserts on it.
 *  - **Pure.** These are unit-tested with object literals and no binary
 *    fixture, which matters because the fixture would be the same misaligned
 *    workbook the mappers exist to survive.
 */

import { parseCas } from './cas';
import { canonicalCountryName } from './countries';
import { parseTemplateDate } from './dates';
import { normaliseToUsdPerKg, type FxProblem } from './fx';
import { parseInteger, parseNumber, parsePercent, type NumberProblem } from './numbers';
import {
  parseColdChain,
  parseLeadTimeDays,
  parseProductType,
  parsePurityPct,
  parseStockStatus,
  resolveFacetFor,
  validFacetFor,
} from './product-fields';
import { serialiseSpec, type SpecValues } from './product-spec';
import type { ProductType } from './taxonomy';
import {
  confidenceWeight,
  joinMulti,
  parseCurationStatus,
  parseDataConfidence,
  parseEmaOutcome,
  parseFdaOutcome,
  parseFilingStatus,
  parseIncoterms,
  parseTriBool,
  splitMulti,
} from './vocab';

export type ErrorCode =
  | 'cas.malformed'
  | 'cas.checkDigit'
  | 'required.missing'
  | 'country.unknown'
  | 'date.unparseable'
  | 'number.unparseable'
  | 'number.range'
  | 'number.outOfRange'
  | 'company.unknown'
  | 'company.ambiguous'
  | 'productType.unknown'
  | 'price.unparseable'
  | 'price.outOfRange'
  | 'unit.notMass'
  | 'unit.unknown'
  | 'fx.rateMissing'
  | 'fx.rateInvalid'
  | 'column.refused';

export interface RowIssue {
  code: ErrorCode;
  /** Normalised header the problem is in, for pointing at a column. */
  column?: string;
  /** Real Excel reference, e.g. `I47`. */
  cellRef?: string;
  value?: string;
  /** Set when the row survives — a warning rather than a rejection. */
  warning?: boolean;
}

export interface MapResult<T> {
  row?: T;
  issues: RowIssue[];
}

/** Reads a cell by normalised header, tolerating the header being absent. */
export type Cells = Record<string, { value: string; ref: string }>;

const get = (c: Cells, key: string): string => c[key]?.value?.trim() ?? '';
const ref = (c: Cells, key: string): string | undefined => c[key]?.ref;

function required(c: Cells, key: string, issues: RowIssue[]): string {
  const v = get(c, key);
  if (!v) issues.push({ code: 'required.missing', column: key, cellRef: ref(c, key) });
  return v;
}

function num(c: Cells, key: string, issues: RowIssue[], parser = parseNumber): number | null {
  const raw = get(c, key);
  if (!raw) return null;
  const r = parser(raw);
  if (r.problem) issues.push({ code: r.problem as NumberProblem, column: key, cellRef: ref(c, key), value: raw, warning: true });
  return r.value;
}

function date(c: Cells, key: string, issues: RowIssue[]): Date | null {
  const raw = get(c, key);
  if (!raw) return null;
  const r = parseTemplateDate(raw);
  if (r.problem) issues.push({ code: 'date.unparseable', column: key, cellRef: ref(c, key), value: raw, warning: true });
  return r.value;
}

function cas(c: Cells, key: string, issues: RowIssue[], isRequired: boolean): string | null {
  const raw = get(c, key);
  if (!raw) {
    if (isRequired) issues.push({ code: 'required.missing', column: key, cellRef: ref(c, key) });
    return null;
  }
  const r = parseCas(raw);
  // A bad CAS is a rejection, not a warning: it is the join key between a
  // product, its price series and every filing that cites it.
  if (r.problem) issues.push({ code: r.problem, column: key, cellRef: ref(c, key), value: raw });
  return r.value;
}

/** Collects declared-but-unrecognised spec values into the blob. */
function spec(c: Cells, mapping: Record<string, string>): SpecValues {
  const values: SpecValues = {};
  for (const [header, key] of Object.entries(mapping)) {
    const v = get(c, header);
    if (v) values[key] = v;
  }
  return values;
}

const ok = <T>(row: T, issues: RowIssue[]): MapResult<T> => ({ row, issues });
const fail = <T>(issues: RowIssue[]): MapResult<T> => ({ issues });
const rejected = (issues: RowIssue[]) => issues.some((i) => !i.warning);

// ---------------------------------------------------------------------------
// Sheet 1 — Company Master
// ---------------------------------------------------------------------------

export interface CompanyRow {
  externalId: string | null;
  name: string;
  tradingName: string | null;
  parentCompany: string | null;
  supplierType: string | null;
  curationStatus: string | null;
  country: string;
  state: string | null;
  city: string | null;
  addressLine: string | null;
  postalCode: string | null;
  website: string | null;
  generalEmail: string | null;
  hqPhone: string | null;
  linkedinUrl: string | null;
  regNumber: string | null;
  gstin: string | null;
  duns: string | null;
  feiNumber: string | null;
  iec: string | null;
  foundedYear: number | null;
  revenueUsdM: number | null;
  revenueYear: string | null;
  employees: number | null;
  listedOn: string | null;
  therapeuticAreas: string | null;
  exportMarkets: string | null;
  defaultPaymentTerms: string | null;
  defaultIncoterm: string | null;
  associations: string | null;
  sourceUrl: string | null;
  dataSourceName: string | null;
  curatedAt: Date | null;
  curatedBy: string | null;
  lastVerifiedAt: Date | null;
  curationNote: string | null;
}

export function mapCompany(c: Cells): MapResult<CompanyRow> {
  const issues: RowIssue[] = [];
  const name = required(c, 'legal entity name', issues);
  const countryRaw = required(c, 'country hq', issues);
  const country = canonicalCountryName(countryRaw);
  if (countryRaw && !country) {
    // Never guess. "IN" beside "India" splits the country facet into two
    // options that each show half the suppliers.
    issues.push({ code: 'country.unknown', column: 'country hq', cellRef: ref(c, 'country hq'), value: countryRaw });
  }
  if (rejected(issues)) return fail(issues);

  return ok(
    {
      externalId: get(c, 'company id') || null,
      name,
      tradingName: get(c, 'trading brand name') || null,
      parentCompany: get(c, 'parent company') || null,
      supplierType: get(c, 'entity type') || null,
      // NOT `status`. See the note on Organization.curationStatus: writing a
      // curator's "Verified" into the ops-approval column would publish an
      // imported company as an RFQ-eligible supplier with no human review.
      curationStatus: parseCurationStatus(get(c, 'verification status')),
      country: country!,
      state: get(c, 'state province') || null,
      city: get(c, 'city hq') || null,
      addressLine: get(c, 'full hq address') || null,
      postalCode: get(c, 'postal code') || null,
      website: get(c, 'website url') || null,
      generalEmail: get(c, 'general email') || null,
      hqPhone: get(c, 'hq phone') || null,
      linkedinUrl: get(c, 'linkedin company url') || null,
      regNumber: get(c, 'cin company reg no') || null,
      gstin: get(c, 'gstin india') || null,
      duns: get(c, 'duns number') || null,
      feiNumber: get(c, 'fda fei primary') || null,
      iec: get(c, 'import export code iec') || null,
      foundedYear: num(c, 'year founded', issues, parseInteger),
      revenueUsdM: num(c, 'annual revenue usd m', issues),
      revenueYear: get(c, 'revenue source year') || null,
      employees: num(c, 'total employees', issues, parseInteger),
      listedOn: [get(c, 'stock exchange'), get(c, 'stock ticker')].filter(Boolean).join(': ') || null,
      therapeuticAreas: joinMulti(splitMulti(get(c, 'therapeutic areas'))),
      exportMarkets: joinMulti(splitMulti(get(c, 'export markets'))),
      defaultPaymentTerms: get(c, 'payment terms offered') || null,
      defaultIncoterm: parseIncoterms(get(c, 'incoterms offered'))[0] ?? null,
      associations: null,
      sourceUrl: get(c, 'data source url') || null,
      dataSourceName: get(c, 'scraped by') || null,
      curatedAt: date(c, 'date scraped', issues),
      curatedBy: get(c, 'scraped by') || null,
      lastVerifiedAt: date(c, 'last verified', issues),
      curationNote: get(c, 'verification notes') || null,
    },
    issues,
  );
}

// ---------------------------------------------------------------------------
// Sheets 2–5 — Products
// ---------------------------------------------------------------------------

export interface ProductRow {
  companyExternalId: string;
  externalId: string | null;
  name: string;
  cas: string;
  productType: ProductType;
  facet: string | null;
  grade: string | null;
  purity: string | null;
  purityPct: number | null;
  moqKg: number;
  moqUnit: string;
  leadTime: string | null;
  leadTimeDays: number | null;
  expediteLeadDays: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: string;
  incoterms: string | null;
  coldChain: string | null;
  stockStatus: string | null;
  packaging: string | null;
  sampleAvailable: boolean;
  iupacName: string | null;
  formula: string | null;
  molecularWeight: number | null;
  atcCode: string | null;
  dmfNumber: string | null;
  cepNumber: string | null;
  asmfNumber: string | null;
  controlledSchedule: string | null;
  capacityMtYr: number | null;
  utilizationPct: number | null;
  hsCode: string | null;
  hsnCode: string | null;
  parentApiName: string | null;
  parentApiCas: string | null;
  synthesisStep: string | null;
  ichQ11Class: string | null;
  strength: string | null;
  routeOfAdmin: string | null;
  origin: string | null;
  nonGmo: boolean | null;
  bseTseFree: boolean | null;
  halal: boolean | null;
  kosher: boolean | null;
  vendorQualStatus: string | null;
  specJson: string | null;
  sourceUrl: string | null;
}

/** Spec-blob columns shared by every product sheet. */
const PRODUCT_SPEC: Record<string, string> = {
  'brand name': 'brandName',
  appearance: 'appearance',
  solubility: 'solubility',
  'ph range': 'phRange',
  'loss on drying': 'lossOnDrying',
  'heavy metals ppm': 'heavyMetals',
  'residual solvents': 'residualSolvents',
  'impurity profile': 'impurityProfile',
  'synthesis route': 'synthesisRoute',
  'starting material': 'startingMaterial',
  'analytical method': 'analyticalMethod',
  'inchi key': 'inchiKey',
  'smiles string': 'smiles',
  'ich stability zones': 'ichStabilityZones',
  'sub therapeutic cat': 'subTherapeuticCategory',
  'drug class': 'drugClass',
  'dmf type': 'dmfType',
  'cep scope': 'cepScope',
  'who pq status': 'whoPqStatus',
  'fda anda nda': 'usFdaStatus',
  'eu maa status': 'euMaaStatus',
  'cdsco status': 'cdscoStatus',
  'pmda japan': 'pmdaStatus',
  'health canada': 'healthCanadaStatus',
  'tga australia': 'tgaStatus',
  'anvisa brazil': 'anvisaStatus',
  'manufacturing site': 'manufacturingSite',
  'site country': 'siteCountry',
  'site fei number': 'siteFeiNumber',
  'scale up capability': 'scaleUpCapability',
  'gmp certs this site': 'siteGmpCerts',
  'containment level': 'containmentLevel',
  'in house testing': 'inHouseTesting',
  'qc methods': 'qcMethods',
  'payment terms': 'paymentTerms',
  'sample size cost': 'sampleSizeCost',
  'pack options': 'packOptions',
  'coa type': 'coaType',
  'sds msds available': 'sdsAvailable',
  'tds available': 'tdsAvailable',
  'stability data': 'stabilityData',
  'audit report': 'auditReport',
  'reach registration': 'reachRegistration',
  'total steps in route': 'totalSteps',
  'role in synthesis': 'roleInSynthesis',
  'downstream operations': 'downstreamOperations',
  'alternative routes': 'alternativeRoutes',
  'genotox concern': 'genotoxConcern',
  'nitrosamine risk': 'nitrosamineRisk',
  'ee if chiral': 'enantiomericExcess',
  'gmp standard': 'gmpStandard',
  'inn generic name': 'innName',
  'fdc combination': 'fdcCombination',
  'innovator reference product': 'referenceProduct',
  'reference listed drug rld': 'rld',
  'pack size': 'packSize',
  'container closure system': 'containerClosure',
  'excipients key': 'keyExcipients',
  'bioequivalence study': 'bioequivalence',
  'be study reference': 'beStudyReference',
  'sterile manufacture': 'sterileManufacture',
  'function in formulation': 'functionInFormulation',
  'compendial grade': 'compendialGrade',
  'pharmacopoeia reference': 'pharmacopoeiaRef',
  'monograph name': 'monographName',
  'functional grade': 'functionalGrade',
  'organic certified': 'organicCertified',
  'vegan status': 'veganStatus',
  'allergen declaration': 'allergenDeclaration',
  'gras status': 'grasStatus',
  'cfr 21 listed': 'cfr21Listed',
  'inci name': 'inciName',
  'fssai approval': 'fssaiApproval',
  'bulk density g ml': 'bulkDensity',
  viscosity: 'viscosity',
  'moisture content': 'moistureContent',
  'microbial limits': 'microbialLimits',
  'color appearance': 'colourAppearance',
  'gst rate india': 'gstRate',
  'price valid until': 'priceValidUntil',
  'price pack size': 'pricePackSize',
  'annual contract': 'annualContract',
};

export interface ProductSheetOptions {
  /** Segment when the sheet does not state one — sheet 2 is all APIs. */
  defaultType: ProductType;
  /** Header carrying the facet value for this sheet, if any. */
  facetHeader?: string;
  /** Header carrying the price, and the unit it is denominated in. */
  priceHeader: string;
  priceUnit: 'kg' | 'unit';
  moqHeader: string;
}

export function mapProduct(c: Cells, opts: ProductSheetOptions): MapResult<ProductRow> {
  const issues: RowIssue[] = [];
  const companyExternalId = required(c, 'company id', issues);
  const name = get(c, 'common trade name') || get(c, 'inn generic name') || get(c, 'common name') || required(c, 'iupac name full', issues);
  const casValue = cas(c, 'cas number', issues, true);
  if (rejected(issues) || !casValue) return fail(issues);

  const declaredType = get(c, 'product type');
  const productType = (declaredType ? parseProductType(declaredType) : null) ?? opts.defaultType;

  const facetRaw = opts.facetHeader ? get(c, opts.facetHeader) : '';
  const facet = validFacetFor(productType, facetRaw) ?? resolveFacetFor(productType, facetRaw);

  const purity = get(c, 'purity specification') || get(c, 'purity assay') || null;
  const leadTime = get(c, 'standard lead wks') || get(c, 'standard lead weeks') || get(c, 'lead time weeks') || null;
  // The sheets state lead time as a number of weeks, so a bare "6" means six
  // weeks here — unlike the seller form, where a bare number is refused.
  const leadTimeDays = leadTime ? (parseLeadTimeDays(leadTime) ?? parseLeadTimeDays(`${leadTime} weeks`)) : null;

  const priceRaw = get(c, opts.priceHeader);
  let priceMin: number | null = null;
  if (priceRaw) {
    const p = normaliseToUsdPerKg({ price: priceRaw, currency: 'USD', unit: opts.priceUnit });
    if (p.problem && p.problem !== 'unit.notMass') {
      issues.push({ code: p.problem as FxProblem as ErrorCode, column: opts.priceHeader, cellRef: ref(c, opts.priceHeader), value: priceRaw, warning: true });
    }
    // A per-unit price is kept verbatim, NOT converted: `priceUnit` records the
    // denomination and the catalogue's price sort and range filter exclude
    // anything that is not per-kg. $0.042 a tablet in a per-kg column would win
    // every "price, low to high" sort forever.
    priceMin = opts.priceUnit === 'kg' ? p.usdPerKg : parseNumber(priceRaw).value;
  }

  return ok(
    {
      companyExternalId,
      externalId: get(c, 'product id') || null,
      name,
      cas: casValue,
      productType,
      facet,
      grade: get(c, 'pharmacopoeial grade') || get(c, 'compendial grade') || null,
      purity,
      purityPct: parsePurityPct(purity),
      moqKg: num(c, opts.moqHeader, issues, parseInteger) ?? 1,
      moqUnit: opts.priceUnit,
      leadTime: leadTime ? `${leadTime} weeks`.replace(/weeks weeks$/, 'weeks') : null,
      leadTimeDays,
      expediteLeadDays: (() => {
        const w = num(c, 'expedite lead wks', issues, parseInteger);
        return w == null ? null : w * 7;
      })(),
      priceMin,
      priceMax: null,
      priceUnit: opts.priceUnit,
      incoterms: joinMulti(parseIncoterms(get(c, 'incoterms offered') || get(c, 'incoterms'))),
      coldChain: parseColdChain(get(c, 'cold chain required') || get(c, 'storage conditions')),
      stockStatus: parseStockStatus(get(c, 'stock status')),
      packaging: get(c, 'pack options') || get(c, 'container closure system') || null,
      sampleAvailable: parseTriBool(get(c, 'sample available')) === true,
      iupacName: get(c, 'iupac name full') || get(c, 'iupac chemical name') || null,
      formula: get(c, 'molecular formula') || null,
      molecularWeight: num(c, 'molecular weight g mol', issues) ?? num(c, 'molecular weight', issues),
      atcCode: get(c, 'atc code who') || get(c, 'atc code') || null,
      dmfNumber: get(c, 'us dmf number') || null,
      cepNumber: get(c, 'cep number') || null,
      asmfNumber: get(c, 'asmf number') || null,
      controlledSchedule: (() => {
        const v = get(c, 'controlled status');
        // "Not Controlled" is the common case and is not a schedule.
        return v && !/^not\b/i.test(v) ? v : null;
      })(),
      capacityMtYr: num(c, 'annual capacity mt', issues),
      utilizationPct: num(c, 'current utilization', issues, parsePercent),
      hsCode: get(c, 'hs code intl 6 dig') || get(c, 'hs code intl') || null,
      hsnCode: get(c, 'hsn code india') || null,
      parentApiName: get(c, 'parent api') || null,
      parentApiCas: cas(c, 'parent api cas', issues, false),
      synthesisStep: get(c, 'synthesis step no') || null,
      ichQ11Class: get(c, 'ich q11 classification') || null,
      strength: get(c, 'strength dose') || null,
      routeOfAdmin: get(c, 'route of admin') || null,
      origin: get(c, 'origin plant animal syn') || null,
      nonGmo: parseTriBool(get(c, 'non gmo status')),
      bseTseFree: parseTriBool(get(c, 'bse tse free')),
      halal: parseTriBool(get(c, 'halal certified')),
      kosher: parseTriBool(get(c, 'kosher certified')),
      vendorQualStatus: get(c, 'vendor qual status') || null,
      specJson: serialiseSpec(spec(c, PRODUCT_SPEC)),
      sourceUrl: get(c, 'data source url') || null,
    },
    issues,
  );
}

/** Per-sheet options. The unit is the load-bearing part — see `mapProduct`. */
export const PRODUCT_SHEETS: { sheet: string; opts: ProductSheetOptions }[] = [
  {
    sheet: '2. API Products',
    opts: { defaultType: 'api', facetHeader: 'therapeutic category', priceHeader: 'price usd fob kg', priceUnit: 'kg', moqHeader: 'moq kg' },
  },
  {
    // Finished dose forms are priced PER UNIT. Everything downstream of
    // `priceMin` is kg-denominated, so the unit travels with the value.
    sheet: '3. FDC & Formulations',
    opts: { defaultType: 'fdf', facetHeader: 'dosage form', priceHeader: 'price usd unit fob', priceUnit: 'unit', moqHeader: 'moq units' },
  },
  {
    sheet: '4. KSMs & Intermediates',
    opts: { defaultType: 'ksm', priceHeader: 'price usd fob kg', priceUnit: 'kg', moqHeader: 'moq kg' },
  },
  {
    sheet: '5. Raw Materials & Excipients',
    opts: { defaultType: 'excipient', facetHeader: 'function category', priceHeader: 'price usd kg fob', priceUnit: 'kg', moqHeader: 'moq kg' },
  },
];

// ---------------------------------------------------------------------------
// Sheet 8 — Manufacturing Facilities
// ---------------------------------------------------------------------------

export interface FacilityRow {
  companyExternalId: string;
  externalId: string | null;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  addressLine: string | null;
  postalCode: string | null;
  siteType: string;
  regulatoryId: string | null;
  emaSiteRef: string | null;
  fdaGmpStatus: string | null;
  euGmpStatus: string | null;
  whoGmpStatus: string | null;
  lastFdaInspectionAt: Date | null;
  fdaInspectionOutcome: string | null;
  lastEuInspectionAt: Date | null;
  euInspectionOutcome: string | null;
  form483Count: number | null;
  capacityValue: number | null;
  capacityUnit: string | null;
  utilizationPct: number | null;
  manufacturingType: string | null;
  containmentLevel: string | null;
  sterile: boolean | null;
  coldChainCapability: string | null;
  productionLines: number | null;
  qcLabs: number | null;
  yearEstablished: number | null;
  employees: number | null;
  sourceUrl: string | null;
  lastVerifiedAt: Date | null;
}

export function mapFacility(c: Cells): MapResult<FacilityRow> {
  const issues: RowIssue[] = [];
  const companyExternalId = required(c, 'company id', issues);
  const name = required(c, 'site name', issues);
  if (rejected(issues)) return fail(issues);

  return ok(
    {
      companyExternalId,
      externalId: get(c, 'site id') || null,
      name,
      city: get(c, 'city district') || null,
      state: get(c, 'state province') || null,
      country: canonicalCountryName(get(c, 'country')),
      addressLine: get(c, 'full site address') || null,
      postalCode: get(c, 'postal code') || null,
      siteType: (get(c, 'site type') || 'manufacturing').toLowerCase().includes('pack') ? 'packaging' : 'manufacturing',
      regulatoryId: get(c, 'fda fei number') || null,
      emaSiteRef: get(c, 'ema site registration') || null,
      fdaGmpStatus: get(c, 'fda gmp status') || null,
      euGmpStatus: get(c, 'eu gmp status') || null,
      whoGmpStatus: get(c, 'who gmp status') || null,
      lastFdaInspectionAt: date(c, 'last fda inspection date', issues),
      // The template is emphatic that the exact terms are used. An unrecognised
      // outcome is dropped rather than stored — a badge that renders an
      // informal description is worse than an absent one.
      fdaInspectionOutcome: parseFdaOutcome(get(c, 'fda inspection outcome')),
      lastEuInspectionAt: date(c, 'last eu inspection date', issues),
      euInspectionOutcome: parseEmaOutcome(get(c, 'eu inspection outcome')),
      form483Count: num(c, 'fda 483 count last insp', issues, parseInteger),
      capacityValue: num(c, 'annual capacity mt or units', issues),
      capacityUnit: get(c, 'capacity unit') || null,
      utilizationPct: num(c, 'current utilization', issues, parsePercent),
      manufacturingType: get(c, 'manufacturing type') || null,
      containmentLevel: get(c, 'containment level') || null,
      sterile: parseTriBool(get(c, 'sterile facility')),
      coldChainCapability: get(c, 'cold chain capability') || null,
      productionLines: num(c, 'no of production lines', issues, parseInteger),
      qcLabs: num(c, 'no of qc labs', issues, parseInteger),
      yearEstablished: num(c, 'year established', issues, parseInteger),
      employees: num(c, 'no of employees this site', issues, parseInteger),
      sourceUrl: get(c, 'data source url') || null,
      lastVerifiedAt: date(c, 'last verified', issues),
    },
    issues,
  );
}

// ---------------------------------------------------------------------------
// Sheet 7 — Regulatory Filings
// ---------------------------------------------------------------------------

export interface FilingRow {
  companyExternalId: string;
  externalId: string | null;
  filingType: string;
  filingNumber: string;
  authority: string | null;
  country: string | null;
  status: string;
  cas: string | null;
  productName: string | null;
  filedAt: Date | null;
  approvedAt: Date | null;
  expiresAt: Date | null;
  renewalDueAt: Date | null;
  holderName: string | null;
  scope: string | null;
  openToReference: boolean | null;
  referencingCount: number | null;
  annualFeeUsd: number | null;
  lastInspectionAt: Date | null;
  lastInspectionOutcome: string | null;
  form483Count: number | null;
  capaStatus: string | null;
  sitesCovered: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: Date | null;
  verifiedBy: string | null;
  notes: string | null;
}

export function mapFiling(c: Cells): MapResult<FilingRow> {
  const issues: RowIssue[] = [];
  const companyExternalId = required(c, 'company id', issues);
  const filingType = required(c, 'filing type', issues);
  const filingNumber = required(c, 'filing number', issues);
  if (rejected(issues)) return fail(issues);

  return ok(
    {
      companyExternalId,
      externalId: get(c, 'filing id') || null,
      filingType,
      filingNumber,
      authority: get(c, 'regulatory authority') || null,
      country: get(c, 'country region') || null,
      status: parseFilingStatus(get(c, 'current status')) ?? 'active',
      cas: cas(c, 'cas number', issues, false),
      productName: get(c, 'product name') || null,
      filedAt: date(c, 'date filed', issues),
      approvedAt: date(c, 'date approved', issues),
      // "N/A (DMF — no expiry)" parses to null, which is the correct answer and
      // buckets as `unknown` in the register rather than as `ok`.
      expiresAt: date(c, 'expiry date', issues),
      renewalDueAt: date(c, 'renewal due date', issues),
      holderName: get(c, 'filing holder legal name') || null,
      scope: get(c, 'product scope specs covered') || null,
      openToReference: parseTriBool(get(c, 'open for 3rd party reference')),
      referencingCount: num(c, 'no andas maas referencing', issues, parseInteger),
      annualFeeUsd: num(c, 'annual filing fee usd', issues),
      lastInspectionAt: date(c, 'last inspection date', issues),
      lastInspectionOutcome: parseFdaOutcome(get(c, 'last inspection outcome')) ?? parseEmaOutcome(get(c, 'last inspection outcome')),
      form483Count: num(c, 'no of 483 observations', issues, parseInteger),
      capaStatus: get(c, 'capa status') || null,
      sitesCovered: joinMulti(splitMulti(get(c, 'manufacturing site s covered'))),
      sourceUrl: get(c, 'source url') || null,
      lastVerifiedAt: date(c, 'last verified', issues),
      verifiedBy: get(c, 'verified by') || null,
      notes: get(c, 'notes') || null,
    },
    issues,
  );
}

// ---------------------------------------------------------------------------
// Sheet 9 — Key Contacts
// ---------------------------------------------------------------------------

/**
 * Columns refused outright.
 *
 * CRM notes on a named natural person, scraped from LinkedIn, with no lawful
 * basis captured. This platform carries `DsarRequest` and explicit GDPR
 * Art. 15/17 + DPDP commitments, so importing them would make them
 * subject-access-exportable and erasure-obligated for data we cannot justify
 * holding. The sheet's own header says "Business email only (not personal)".
 *
 * Refused loudly rather than quietly dropped: the curator should see that the
 * columns were ignored on purpose, not wonder why the data vanished.
 */
export const REFUSED_CONTACT_COLUMNS = [
  'personal email',
  'twitter x handle',
  'last contacted',
  'interaction summary',
  'relationship status',
  'key interests pain points',
] as const;

export interface ContactRow {
  companyExternalId: string;
  externalId: string | null;
  salutation: string | null;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  seniority: string | null;
  primaryRole: string | null;
  businessEmail: string | null;
  officePhone: string | null;
  mobile: string | null;
  linkedinUrl: string | null;
  city: string | null;
  country: string | null;
  territories: string | null;
  languages: string | null;
  responseHours: number | null;
  bestContactTime: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: Date | null;
}

export function mapContact(c: Cells): MapResult<ContactRow> {
  const issues: RowIssue[] = [];
  const companyExternalId = required(c, 'company id', issues);
  const firstName = required(c, 'first name', issues);
  const lastName = required(c, 'last name', issues);

  for (const col of REFUSED_CONTACT_COLUMNS) {
    if (get(c, col)) issues.push({ code: 'column.refused', column: col, cellRef: ref(c, col), warning: true });
  }
  if (rejected(issues)) return fail(issues);

  return ok(
    {
      companyExternalId,
      externalId: get(c, 'contact id') || null,
      salutation: get(c, 'salutation') || null,
      firstName,
      lastName,
      jobTitle: get(c, 'designation job title') || null,
      department: get(c, 'department') || null,
      seniority: get(c, 'seniority level') || null,
      primaryRole: get(c, 'primary role') || null,
      businessEmail: get(c, 'business email') || null,
      officePhone: get(c, 'office phone') || null,
      mobile: get(c, 'mobile whatsapp') || null,
      linkedinUrl: get(c, 'linkedin profile url') || null,
      city: get(c, 'city') || null,
      country: canonicalCountryName(get(c, 'country')),
      territories: joinMulti(splitMulti(get(c, 'territory markets responsible'))),
      languages: joinMulti(splitMulti(get(c, 'languages spoken'))),
      responseHours: num(c, 'response avg hours', issues),
      bestContactTime: get(c, 'best contact time utc') || null,
      sourceUrl: null,
      lastVerifiedAt: date(c, 'last verified', issues),
    },
    issues,
  );
}

// ---------------------------------------------------------------------------
// Sheet 6 — Price Intelligence
// ---------------------------------------------------------------------------

export interface PriceRow {
  sourceRef: string;
  cas: string;
  productName: string;
  observedAt: Date;
  unitPriceUsdKg: number;
  rawPrice: number;
  rawCurrency: string;
  rawUnit: string;
  fxRate: number | null;
  quantityKg: number | null;
  incoterm: string | null;
  region: string;
  originCountry: string | null;
  purityGrade: string | null;
  validUntil: Date | null;
  sourceType: string;
  sourceName: string;
  sourceUrl: string | null;
  dataConfidence: string | null;
  weight: number;
  outlierFlag: boolean;
  outlierReason: string | null;
  companyExternalId: string | null;
}

/** How far back the M-24…M-1 history columns reach. */
export const HISTORY_MONTHS = 24;

export function mapPrice(c: Cells): MapResult<PriceRow> {
  const issues: RowIssue[] = [];
  const casValue = cas(c, 'cas number', issues, true);
  const productName = required(c, 'product name', issues);
  const observed = date(c, 'date observed', issues);
  if (!observed) issues.push({ code: 'required.missing', column: 'date observed', cellRef: ref(c, 'date observed') });
  if (rejected(issues) || !casValue || !observed) return fail(issues);

  const price = normaliseToUsdPerKg({
    price: get(c, 'price original currency'),
    currency: get(c, 'currency'),
    unit: 'kg',
    fxRate: get(c, 'fx rate used'),
  });
  if (price.problem) {
    issues.push({ code: price.problem as ErrorCode, column: 'price original currency', cellRef: ref(c, 'price original currency'), value: get(c, 'price original currency') });
    return fail(issues);
  }

  const confidence = parseDataConfidence(get(c, 'data confidence'));
  const obsId = get(c, 'price obs id') || `${casValue}-${observed.toISOString().slice(0, 10)}`;

  return ok(
    {
      // `sourceRef` is already `@unique` on PriceObservation — the natural key
      // that makes re-ingest idempotent. No separate externalId is needed.
      sourceRef: obsId,
      cas: casValue,
      productName,
      observedAt: observed,
      unitPriceUsdKg: price.usdPerKg!,
      rawPrice: price.rawPrice!,
      rawCurrency: price.rawCurrency,
      rawUnit: price.rawUnit,
      fxRate: price.fxRate,
      quantityKg: num(c, 'quantity range kg', issues),
      incoterm: parseIncoterms(get(c, 'incoterm'))[0] ?? null,
      region: canonicalCountryName(get(c, 'destination country')) ?? 'WLD',
      originCountry: canonicalCountryName(get(c, 'supplier country')),
      purityGrade: get(c, 'purity grade for price') || null,
      validUntil: date(c, 'price valid until', issues),
      sourceType: (get(c, 'source type') || 'listing').toLowerCase().includes('pharmalink') ? 'internal_deal' : 'listing',
      sourceName: get(c, 'source name') || 'Curated upload',
      sourceUrl: get(c, 'source url') || null,
      dataConfidence: confidence,
      // The label never sets the weight directly — one exported table maps them,
      // so a spreadsheet cannot outvote a platform transaction.
      weight: confidenceWeight(get(c, 'data confidence')),
      outlierFlag: parseTriBool(get(c, 'outlier flag')) === true,
      outlierReason: get(c, 'outlier reason') || null,
      companyExternalId: get(c, 'company id') || null,
    },
    issues,
  );
}

/**
 * Fans the M-24…M-1 history columns out into observations.
 *
 * `getMoleculeIntelligence` and `forecast()` read a time series from ROWS —
 * twenty-four columns are invisible to them. Three details that bite:
 *
 *  - **Keyed on the absolute month, not the M-offset.** An offset is relative,
 *    so the same calendar month carries a different M-label next month and an
 *    offset-keyed ref would duplicate every row on every re-upload.
 *  - Blank cells are skipped, never zero-filled. A missing month is missing.
 *  - History is a summarised series, not evidenced transactions, so it is
 *    `curated` and its weight is capped below a real observation's.
 */
export function fanOutHistory(c: Cells, base: PriceRow): PriceRow[] {
  const out: PriceRow[] = [];
  for (let m = 1; m <= HISTORY_MONTHS; m += 1) {
    const header = m === 1 ? 'm 1 most recent' : `m ${m}`;
    const raw = get(c, header) || get(c, `m ${m} price usd kg`);
    if (!raw) continue;
    const value = parseNumber(raw).value;
    if (value == null || value <= 0) continue;

    const month = new Date(Date.UTC(base.observedAt.getUTCFullYear(), base.observedAt.getUTCMonth() - m, 1));
    const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`;

    out.push({
      ...base,
      sourceRef: `${base.sourceRef}#${key}`,
      observedAt: month,
      unitPriceUsdKg: value,
      rawPrice: value,
      rawCurrency: 'USD',
      rawUnit: 'kg',
      fxRate: null,
      sourceType: 'curated',
      weight: Math.min(base.weight, 0.5),
      validUntil: null,
      quantityKg: null,
    });
  }
  return out;
}
