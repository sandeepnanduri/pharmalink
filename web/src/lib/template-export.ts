/**
 * The curation template, written back out.
 *
 * Pure: column definitions and value formatting only, no Prisma and no exceljs,
 * so the round trip can be tested without a database or a binary fixture.
 *
 * The point of this module is that **what it writes, the importer can read**. A
 * curator downloads the current state, edits it in Excel, and uploads it again;
 * if a single header drifts, that row silently becomes a new record instead of
 * an update. So every column carries the template's literal header text, and
 * `template-export.test.ts` asserts that each one normalises to a key the
 * matching mapper actually reads. The two files cannot drift apart in silence.
 *
 * Only round-trippable columns are emitted. A column the importer ignores
 * cannot survive a round trip by definition, and writing it would suggest
 * otherwise.
 */

import { formatTemplateDate } from './dates';
import { splitMulti } from './vocab';

export interface Column<T> {
  /** The template's header text, verbatim — including the `*` required marker. */
  header: string;
  value: (row: T) => string;
}

/**
 * The template writes multi-value cells with semicolons; the database stores
 * them comma-separated (`schema.prisma`'s stated convention). Converting back
 * on the way out is what makes the round trip lossless rather than
 * accumulating a comma-joined blob inside a semicolon-joined field.
 */
export const semis = (v: string | null | undefined): string => splitMulti(v ?? '').join('; ');

export const text = (v: string | null | undefined): string => v ?? '';

export const numberCell = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

/**
 * `DD-MMM-YYYY` in English regardless of the viewer's locale.
 *
 * The app's `getFormatter()` renders Chinese month names under `zh`. A workbook
 * whose dates say `1-六月-2025` re-imports as `date.unparseable` on every row —
 * an export that only works in one locale is a trap, not a feature.
 */
export const dateCell = (v: Date | null | undefined): string => (v ? formatTemplateDate(v) : '');

/**
 * Tri-state booleans stay tri-state. Blank means unknown, and writing "No" for
 * an unrecorded halal status would turn a gap in the data into a claim about
 * the product.
 */
export const boolCell = (v: boolean | null | undefined): string => (v === null || v === undefined ? '' : v ? 'Yes' : 'No');

// ---------------------------------------------------------------------------
// Sheet 1 — Company Master
// ---------------------------------------------------------------------------

export interface CompanyExport {
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
  therapeuticAreas: string | null;
  exportMarkets: string | null;
  defaultPaymentTerms: string | null;
  defaultIncoterm: string | null;
  sourceUrl: string | null;
  dataSourceName: string | null;
  curatedAt: Date | null;
  lastVerifiedAt: Date | null;
  curationNote: string | null;
}

export const COMPANY_COLUMNS: Column<CompanyExport>[] = [
  { header: 'Company_ID *', value: (r) => text(r.externalId) },
  { header: 'Legal Entity Name *', value: (r) => r.name },
  { header: 'Trading / Brand Name', value: (r) => text(r.tradingName) },
  { header: 'Parent Company', value: (r) => text(r.parentCompany) },
  { header: 'Entity Type *', value: (r) => text(r.supplierType) },
  // Curation quality, NOT ops approval. `Organization.status` is deliberately
  // not exported: a round trip must not be able to publish a supplier.
  { header: 'Verification Status', value: (r) => text(r.curationStatus) },
  { header: 'Country (HQ) *', value: (r) => r.country },
  { header: 'State / Province', value: (r) => text(r.state) },
  { header: 'City (HQ) *', value: (r) => text(r.city) },
  { header: 'Full HQ Address', value: (r) => text(r.addressLine) },
  { header: 'Postal Code', value: (r) => text(r.postalCode) },
  { header: 'Website URL *', value: (r) => text(r.website) },
  { header: 'General Email', value: (r) => text(r.generalEmail) },
  { header: 'HQ Phone', value: (r) => text(r.hqPhone) },
  { header: 'LinkedIn Company URL', value: (r) => text(r.linkedinUrl) },
  { header: 'CIN / Company Reg No', value: (r) => text(r.regNumber) },
  { header: 'GSTIN (India)', value: (r) => text(r.gstin) },
  { header: 'DUNS Number', value: (r) => text(r.duns) },
  { header: 'FDA FEI (Primary) *', value: (r) => text(r.feiNumber) },
  { header: 'Import Export Code (IEC)', value: (r) => text(r.iec) },
  { header: 'Year Founded', value: (r) => numberCell(r.foundedYear) },
  { header: 'Annual Revenue USD M', value: (r) => numberCell(r.revenueUsdM) },
  { header: 'Revenue Source Year', value: (r) => text(r.revenueYear) },
  { header: 'Total Employees', value: (r) => numberCell(r.employees) },
  { header: 'Therapeutic Areas', value: (r) => semis(r.therapeuticAreas) },
  { header: 'Export Markets *', value: (r) => semis(r.exportMarkets) },
  { header: 'Payment Terms Offered', value: (r) => text(r.defaultPaymentTerms) },
  { header: 'Incoterms Offered', value: (r) => text(r.defaultIncoterm) },
  { header: 'Data Source URL *', value: (r) => text(r.sourceUrl) },
  { header: 'Scraped By', value: (r) => text(r.dataSourceName) },
  { header: 'Date Scraped', value: (r) => dateCell(r.curatedAt) },
  { header: 'Last Verified', value: (r) => dateCell(r.lastVerifiedAt) },
  { header: 'Verification Notes', value: (r) => text(r.curationNote) },
];

// ---------------------------------------------------------------------------
// Sheets 2–5 — Products
// ---------------------------------------------------------------------------

export interface ProductExport {
  companyExternalId: string;
  externalId: string | null;
  name: string;
  cas: string;
  productType: string;
  facet: string | null;
  grade: string | null;
  purity: string | null;
  moqKg: number;
  leadTimeDays: number | null;
  priceMin: number | null;
  incoterms: string | null;
  coldChain: string | null;
  stockStatus: string | null;
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
  sourceUrl: string | null;
}

/**
 * Weeks, because that is the unit the sheets state lead time in and the unit
 * `mapProduct` reads back. Rounded up: a 10-day lead time exported as "1 week"
 * would come back promising three days it cannot keep.
 */
const leadWeeks = (days: number | null): string => (days === null ? '' : String(Math.ceil(days / 7)));

/** Columns every product sheet shares, in template order. */
function productColumns(opts: {
  facetHeader: string | null;
  priceHeader: string;
  moqHeader: string;
}): Column<ProductExport>[] {
  return [
    { header: 'Company_ID *', value: (r) => r.companyExternalId },
    { header: 'Product_ID *', value: (r) => text(r.externalId) },
    { header: 'Common / Trade Name *', value: (r) => r.name },
    { header: 'CAS Number *', value: (r) => r.cas },
    { header: 'Product Type', value: (r) => r.productType },
    ...(opts.facetHeader ? [{ header: opts.facetHeader, value: (r: ProductExport) => text(r.facet) }] : []),
    { header: 'IUPAC Name (Full)', value: (r) => text(r.iupacName) },
    { header: 'Molecular Formula', value: (r) => text(r.formula) },
    { header: 'Molecular Weight (g/mol)', value: (r) => numberCell(r.molecularWeight) },
    { header: 'ATC Code (WHO)', value: (r) => text(r.atcCode) },
    { header: 'Pharmacopoeial Grade', value: (r) => text(r.grade) },
    { header: 'Purity Specification', value: (r) => text(r.purity) },
    { header: 'Controlled Status', value: (r) => (r.controlledSchedule ? r.controlledSchedule : 'Not Controlled') },
    { header: 'US DMF Number', value: (r) => text(r.dmfNumber) },
    { header: 'CEP Number', value: (r) => text(r.cepNumber) },
    { header: 'ASMF Number', value: (r) => text(r.asmfNumber) },
    { header: 'HS Code (Intl 6-dig)', value: (r) => text(r.hsCode) },
    { header: 'HSN Code (India)', value: (r) => text(r.hsnCode) },
    { header: 'Annual Capacity (MT)', value: (r) => numberCell(r.capacityMtYr) },
    { header: opts.moqHeader, value: (r) => numberCell(r.moqKg) },
    { header: opts.priceHeader, value: (r) => numberCell(r.priceMin) },
    { header: 'Standard Lead (wks)', value: (r) => leadWeeks(r.leadTimeDays) },
    { header: 'Incoterms Offered', value: (r) => semis(r.incoterms) },
    { header: 'Cold Chain Required', value: (r) => text(r.coldChain) },
    { header: 'Stock Status', value: (r) => text(r.stockStatus) },
    { header: 'Sample Available', value: (r) => boolCell(r.sampleAvailable) },
    { header: 'Vendor Qual Status', value: (r) => text(r.vendorQualStatus) },
    { header: 'Data Source URL *', value: (r) => text(r.sourceUrl) },
  ];
}

/** Sheet 2 — APIs. */
export const API_COLUMNS: Column<ProductExport>[] = productColumns({
  facetHeader: 'Therapeutic Category',
  priceHeader: 'Price USD (FOB) / kg',
  moqHeader: 'MOQ (kg)',
});

/**
 * Sheet 3 — finished dose forms, priced PER UNIT.
 *
 * The header carries the denomination, and only rows whose `priceUnit` is
 * `unit` are written here. A per-tablet price under a per-kg header is the one
 * export mistake that corrupts the market median on re-import.
 */
export const FDC_COLUMNS: Column<ProductExport>[] = [
  ...productColumns({ facetHeader: 'Dosage Form', priceHeader: 'Price USD / Unit (FOB)', moqHeader: 'MOQ (units)' }),
  { header: 'Strength / Dose', value: (r) => text(r.strength) },
  { header: 'Route of Admin', value: (r) => text(r.routeOfAdmin) },
];

/** Sheet 4 — KSMs and intermediates. */
export const KSM_COLUMNS: Column<ProductExport>[] = [
  ...productColumns({ facetHeader: null, priceHeader: 'Price USD (FOB) / kg', moqHeader: 'MOQ (kg)' }),
  { header: 'Parent API', value: (r) => text(r.parentApiName) },
  { header: 'Parent API CAS', value: (r) => text(r.parentApiCas) },
  { header: 'Synthesis Step No', value: (r) => text(r.synthesisStep) },
  { header: 'ICH Q11 Classification', value: (r) => text(r.ichQ11Class) },
];

/** Sheet 5 — raw materials and excipients. */
export const EXCIPIENT_COLUMNS: Column<ProductExport>[] = [
  ...productColumns({ facetHeader: 'Function Category', priceHeader: 'Price USD/kg (FOB)', moqHeader: 'MOQ (kg)' }),
  { header: 'Origin (Plant/Animal/Syn)', value: (r) => text(r.origin) },
  { header: 'Non-GMO Status', value: (r) => boolCell(r.nonGmo) },
  { header: 'BSE/TSE Free', value: (r) => boolCell(r.bseTseFree) },
  { header: 'Halal Certified', value: (r) => boolCell(r.halal) },
  { header: 'Kosher Certified', value: (r) => boolCell(r.kosher) },
];

/**
 * Which product sheet a row belongs on, and the columns it is written with.
 *
 * Every `PRODUCT_TYPES` value must appear exactly once. The template has four
 * product sheets and the catalogue has seven types, so some sheets carry more
 * than one — but a type on no sheet is a listing that vanishes from the export
 * with no error, which is how `specialty` was lost the first time this ran.
 * `template-export.test.ts` reads the vocabulary and holds this exhaustive.
 */
export const PRODUCT_SHEET_EXPORTS: { sheet: string; productTypes: string[]; columns: Column<ProductExport>[] }[] = [
  { sheet: '2. API Products', productTypes: ['api'], columns: API_COLUMNS },
  { sheet: '3. FDC & Formulations', productTypes: ['fdf'], columns: FDC_COLUMNS },
  { sheet: '4. KSMs & Intermediates', productTypes: ['ksm', 'intermediate'], columns: KSM_COLUMNS },
  // Specialty and high-potency materials ride with raw materials: the template
  // has no fifth product sheet, and their shape (origin, grade, function) is
  // the excipient shape rather than the dosage-form or parent-API one.
  {
    sheet: '5. Raw Materials & Excipients',
    productTypes: ['excipient', 'raw_material', 'specialty'],
    columns: EXCIPIENT_COLUMNS,
  },
];

// ---------------------------------------------------------------------------
// Sheet 7 — Regulatory Filings
// ---------------------------------------------------------------------------

export interface FilingExport {
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
  sitesCovered: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: Date | null;
  notes: string | null;
}

export const FILING_COLUMNS: Column<FilingExport>[] = [
  { header: 'Company_ID *', value: (r) => r.companyExternalId },
  { header: 'Filing_ID *', value: (r) => text(r.externalId) },
  { header: 'Filing Type *', value: (r) => r.filingType },
  { header: 'Filing Number *', value: (r) => r.filingNumber },
  { header: 'Regulatory Authority', value: (r) => text(r.authority) },
  { header: 'Country / Region', value: (r) => text(r.country) },
  { header: 'Current Status', value: (r) => r.status },
  { header: 'CAS Number', value: (r) => text(r.cas) },
  { header: 'Product Name', value: (r) => text(r.productName) },
  { header: 'Date Filed', value: (r) => dateCell(r.filedAt) },
  { header: 'Date Approved', value: (r) => dateCell(r.approvedAt) },
  // A DMF genuinely has no expiry. Blank re-imports as null and buckets as
  // "unknown" in the register — writing a placeholder date would turn it into
  // a compliance warning that expires on a day nobody chose.
  { header: 'Expiry Date', value: (r) => dateCell(r.expiresAt) },
  { header: 'Renewal Due Date', value: (r) => dateCell(r.renewalDueAt) },
  { header: 'Filing Holder Legal Name', value: (r) => text(r.holderName) },
  { header: 'Product Scope / Specs Covered', value: (r) => text(r.scope) },
  { header: 'Open for 3rd-Party Reference', value: (r) => boolCell(r.openToReference) },
  { header: 'No. ANDAs/MAAs Referencing', value: (r) => numberCell(r.referencingCount) },
  { header: 'Annual Filing Fee USD', value: (r) => numberCell(r.annualFeeUsd) },
  { header: 'Manufacturing Site(s) Covered', value: (r) => semis(r.sitesCovered) },
  { header: 'Source URL', value: (r) => text(r.sourceUrl) },
  { header: 'Last Verified', value: (r) => dateCell(r.lastVerifiedAt) },
  { header: 'Notes', value: (r) => text(r.notes) },
];

// ---------------------------------------------------------------------------
// Sheet 8 — Manufacturing Facilities
// ---------------------------------------------------------------------------

export interface FacilityExport {
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

export const FACILITY_COLUMNS: Column<FacilityExport>[] = [
  { header: 'Company_ID *', value: (r) => r.companyExternalId },
  { header: 'Site_ID *', value: (r) => text(r.externalId) },
  { header: 'Site Name *', value: (r) => r.name },
  { header: 'Site Type', value: (r) => r.siteType },
  { header: 'City / District', value: (r) => text(r.city) },
  { header: 'State / Province', value: (r) => text(r.state) },
  { header: 'Country', value: (r) => text(r.country) },
  { header: 'Full Site Address', value: (r) => text(r.addressLine) },
  { header: 'Postal Code', value: (r) => text(r.postalCode) },
  { header: 'FDA FEI Number', value: (r) => text(r.regulatoryId) },
  { header: 'EMA Site Registration', value: (r) => text(r.emaSiteRef) },
  { header: 'FDA GMP Status', value: (r) => text(r.fdaGmpStatus) },
  { header: 'EU GMP Status', value: (r) => text(r.euGmpStatus) },
  { header: 'WHO GMP Status', value: (r) => text(r.whoGmpStatus) },
  { header: 'Last FDA Inspection Date', value: (r) => dateCell(r.lastFdaInspectionAt) },
  { header: 'FDA Inspection Outcome', value: (r) => text(r.fdaInspectionOutcome) },
  { header: 'Last EU Inspection Date', value: (r) => dateCell(r.lastEuInspectionAt) },
  { header: 'EU Inspection Outcome', value: (r) => text(r.euInspectionOutcome) },
  { header: 'FDA 483 Count (Last Insp)', value: (r) => numberCell(r.form483Count) },
  // Value and unit travel together — sheet 8 has the same per-unit hazard as
  // sheet 3, and a capacity of "500000000" means nothing without "tablets".
  { header: 'Annual Capacity (MT or Units)', value: (r) => numberCell(r.capacityValue) },
  { header: 'Capacity Unit', value: (r) => text(r.capacityUnit) },
  { header: 'Manufacturing Type', value: (r) => text(r.manufacturingType) },
  { header: 'Containment Level', value: (r) => text(r.containmentLevel) },
  { header: 'Sterile Facility', value: (r) => boolCell(r.sterile) },
  { header: 'Cold Chain Capability', value: (r) => text(r.coldChainCapability) },
  { header: 'No. of Production Lines', value: (r) => numberCell(r.productionLines) },
  { header: 'No. of QC Labs', value: (r) => numberCell(r.qcLabs) },
  { header: 'Year Established', value: (r) => numberCell(r.yearEstablished) },
  { header: 'No. of Employees (This Site)', value: (r) => numberCell(r.employees) },
  { header: 'Data Source URL *', value: (r) => text(r.sourceUrl) },
  { header: 'Last Verified', value: (r) => dateCell(r.lastVerifiedAt) },
];

// ---------------------------------------------------------------------------
// Sheet 9 — Key Contacts
// ---------------------------------------------------------------------------

export interface ContactExport {
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
  lastVerifiedAt: Date | null;
}

/**
 * The six personal-data columns the importer refuses (`REFUSED_CONTACT_COLUMNS`)
 * are absent here too, and `template-export.test.ts` holds them absent.
 *
 * Refusing data on the way in and then emitting a column for it on the way out
 * would invite a curator to fill it in and re-upload — the refusal has to hold
 * in both directions to mean anything.
 */
export const CONTACT_COLUMNS: Column<ContactExport>[] = [
  { header: 'Company_ID *', value: (r) => r.companyExternalId },
  { header: 'Contact_ID *', value: (r) => text(r.externalId) },
  { header: 'Salutation', value: (r) => text(r.salutation) },
  { header: 'First Name *', value: (r) => r.firstName },
  { header: 'Last Name *', value: (r) => r.lastName },
  { header: 'Designation / Job Title', value: (r) => text(r.jobTitle) },
  { header: 'Department', value: (r) => text(r.department) },
  { header: 'Seniority Level', value: (r) => text(r.seniority) },
  { header: 'Primary Role', value: (r) => text(r.primaryRole) },
  { header: 'Business Email', value: (r) => text(r.businessEmail) },
  { header: 'Office Phone', value: (r) => text(r.officePhone) },
  { header: 'Mobile / WhatsApp', value: (r) => text(r.mobile) },
  { header: 'LinkedIn Profile URL', value: (r) => text(r.linkedinUrl) },
  { header: 'City', value: (r) => text(r.city) },
  { header: 'Country', value: (r) => text(r.country) },
  { header: 'Territory / Markets Responsible', value: (r) => semis(r.territories) },
  { header: 'Languages Spoken', value: (r) => semis(r.languages) },
  { header: 'Response Avg (Hours)', value: (r) => numberCell(r.responseHours) },
  { header: 'Best Contact Time (UTC)', value: (r) => text(r.bestContactTime) },
  { header: 'Last Verified', value: (r) => dateCell(r.lastVerifiedAt) },
];

// ---------------------------------------------------------------------------
// Sheet 6 — Price Intelligence
// ---------------------------------------------------------------------------

export interface PriceExport {
  sourceRef: string;
  companyExternalId: string | null;
  cas: string;
  productName: string;
  observedAt: Date;
  rawPrice: number;
  rawCurrency: string;
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
  outlierFlag: boolean;
  outlierReason: string | null;
}

export const PRICE_COLUMNS: Column<PriceExport>[] = [
  { header: 'Price_Obs_ID *', value: (r) => r.sourceRef },
  { header: 'Company_ID', value: (r) => text(r.companyExternalId) },
  { header: 'CAS Number *', value: (r) => r.cas },
  { header: 'Product Name *', value: (r) => r.productName },
  { header: 'Date Observed *', value: (r) => dateCell(r.observedAt) },
  // The ORIGINAL price and its currency, with the rate used. An FX-converted
  // figure whose inputs are gone cannot be audited, and re-importing a
  // USD-converted number as if it were the original loses the source forever.
  { header: 'Price (Original Currency) *', value: (r) => numberCell(r.rawPrice) },
  { header: 'Currency *', value: (r) => r.rawCurrency },
  { header: 'FX Rate Used', value: (r) => numberCell(r.fxRate) },
  { header: 'Quantity Range (kg)', value: (r) => numberCell(r.quantityKg) },
  { header: 'Incoterm', value: (r) => text(r.incoterm) },
  { header: 'Destination Country', value: (r) => r.region },
  { header: 'Supplier Country', value: (r) => text(r.originCountry) },
  { header: 'Purity Grade (for price)', value: (r) => text(r.purityGrade) },
  { header: 'Price Valid Until', value: (r) => dateCell(r.validUntil) },
  { header: 'Source Type', value: (r) => r.sourceType },
  { header: 'Source Name', value: (r) => r.sourceName },
  { header: 'Source URL', value: (r) => text(r.sourceUrl) },
  { header: 'Data Confidence', value: (r) => text(r.dataConfidence) },
  { header: 'Outlier Flag', value: (r) => boolCell(r.outlierFlag) },
  { header: 'Outlier Reason', value: (r) => text(r.outlierReason) },
];
