/**
 * Builds the e2e curation-workbook fixture.
 *
 *   node e2e/fixtures/make-workbook.mjs
 *
 * Generated rather than committed as a binary, and deliberately NOT the real
 * 125 KB template: a fixture nobody can read in a diff is a fixture nobody
 * maintains. This one is small, and every quirk in it is there on purpose.
 *
 * It reproduces the three things about the real workbook that break naive
 * readers:
 *
 *  1. **The header row moves.** Sheets 1, 2 and 6 carry an extra merged
 *     group-band row, so their headers are on row 5 while every other sheet's
 *     are on row 4. A reader that assumes a fixed offset reads the band as
 *     headers on three sheets.
 *  2. **Headers carry the `*` required marker** and inconsistent punctuation.
 *  3. **Multi-value cells use semicolons**, not commas.
 *
 * Plus deliberate failures the importer has to catch: a bad CAS check digit, an
 * unknown Company_ID, a per-unit FDC price, and a personal-data column.
 */
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), 'curation-template.xlsx');
const wb = new ExcelJS.Workbook();

/** Adds a sheet with `banner` filler rows before the header, as the template does. */
function sheet(name, bannerRows, headers, rows) {
  const ws = wb.addWorksheet(name);
  ws.addRow([`${name.toUpperCase()} — generated e2e fixture`]);
  ws.addRow(['One row per record. See make-workbook.mjs.']);
  ws.addRow(['Notes row.']);
  for (let i = 0; i < bannerRows; i += 1) ws.addRow(['A — GROUP BAND', 'B — ANOTHER BAND']);
  ws.addRow(headers);
  for (const r of rows) ws.addRow(headers.map((h) => r[h] ?? ''));
  return ws;
}

// --- 1. Company Master: header on row 5 (one group band) --------------------
sheet(
  '1. Company Master',
  1,
  ['Company_ID *', 'Legal Entity Name *', 'Trading / Brand Name', 'Entity Type *', 'Verification Status',
   'Country (HQ) *', 'City (HQ) *', 'Website URL *', 'FDA FEI (Primary) *', 'Year Founded',
   'Annual Revenue USD M', 'Revenue Source Year', 'Total Employees', 'Therapeutic Areas', 'Export Markets *',
   'Incoterms Offered', 'Data Source URL *', 'Date Scraped', 'Last Verified'],
  [
    {
      'Company_ID *': 'SELL-IND-9001', 'Legal Entity Name *': 'Kaveri Life Sciences Ltd',
      'Trading / Brand Name': 'Kaveri API', 'Entity Type *': 'API Manufacturer', 'Verification Status': 'Verified',
      'Country (HQ) *': 'India', 'City (HQ) *': 'Hyderabad', 'Website URL *': 'https://kaveri-ls.test',
      'FDA FEI (Primary) *': '3009991111', 'Year Founded': '1996', 'Annual Revenue USD M': '410',
      'Revenue Source Year': 'FY2025', 'Total Employees': '3400',
      'Therapeutic Areas': 'Antidiabetic; Cardiovascular', 'Export Markets *': 'USA; EU; Japan',
      'Incoterms Offered': 'FOB; CIF; DAP', 'Data Source URL *': 'https://kaveri-ls.test/about',
      'Date Scraped': '01-Jun-2026', 'Last Verified': '01-Jun-2026',
    },
    {
      // Rejected: the country cannot be resolved, and guessing would split the
      // country facet into two options each showing half the suppliers.
      'Company_ID *': 'SELL-XXX-9002', 'Legal Entity Name *': 'Freedonia Chemicals',
      'Entity Type *': 'Trader', 'Country (HQ) *': 'Freedonia', 'Website URL *': 'https://nowhere.test',
      'Data Source URL *': 'https://nowhere.test',
    },
  ],
);

// --- 8. Manufacturing Facilities: header on row 4 ---------------------------
sheet(
  '8. Manufacturing Facilities',
  0,
  ['Site_ID', 'Company_ID *', 'Site Name *', 'Site Type *', 'Country *', 'City / District *',
   'FDA FEI Number *', 'FDA GMP Status *', 'Last FDA Inspection Date', 'FDA Inspection Outcome *',
   'EU Inspection Outcome', 'Annual Capacity (MT or Units) *', 'Capacity Unit', 'Current Utilization %',
   'No of Production Lines', 'Data Source URL *'],
  [
    {
      'Site_ID': 'FAC-IND-3009991111', 'Company_ID *': 'SELL-IND-9001',
      'Site Name *': 'Medak API Plant', 'Site Type *': 'API Manufacturing', 'Country *': 'India',
      'City / District *': 'Medak', 'FDA FEI Number *': '3009991111', 'FDA GMP Status *': 'Current (Active)',
      'Last FDA Inspection Date': '12-Mar-2026', 'FDA Inspection Outcome *': 'NAI (No Action Indicated)',
      'EU Inspection Outcome': 'Satisfactory', 'Annual Capacity (MT or Units) *': '1800',
      'Capacity Unit': 'MT/year', 'Current Utilization %': '58%', 'No of Production Lines': '5',
      'Data Source URL *': 'https://accessdata.fda.gov/',
    },
  ],
);

// --- 2. API Products: header on row 5 (one group band) ----------------------
sheet(
  '2. API Products',
  1,
  ['Product_ID *', 'Company_ID *', 'IUPAC Name (Full) *', 'Common / Trade Name *', 'CAS Number *',
   'Molecular Formula', 'Molecular Weight g/mol', 'Therapeutic Category *', 'ATC Code (WHO)',
   'Pharmacopoeial Grade *', 'Purity Specification *', 'Loss on Drying %', 'US DMF Number',
   'Annual Capacity MT', 'Current Utilization %', 'Price USD FOB / kg *', 'MOQ kg *',
   'Standard Lead Wks *', 'Incoterms Offered', 'Stock Status *', 'HS Code (Intl 6-dig)', 'Data Source URL *'],
  [
    {
      'Product_ID *': 'API-1115704-0001', 'Company_ID *': 'SELL-IND-9001',
      'IUPAC Name (Full) *': '1,1-Dimethylbiguanide Hydrochloride', 'Common / Trade Name *': 'Metformin HCl (Kaveri)',
      'CAS Number *': '1115-70-4', 'Molecular Formula': 'C4H11N5·HCl', 'Molecular Weight g/mol': '165.62',
      'Therapeutic Category *': 'Antidiabetic', 'ATC Code (WHO)': 'A10BA02',
      'Pharmacopoeial Grade *': 'USP / BP / Ph.Eur', 'Purity Specification *': '≥99.5% (USP 2024)',
      'Loss on Drying %': '≤0.5%', 'US DMF Number': 'Type II DMF #99001', 'Annual Capacity MT': '1800',
      'Current Utilization %': '58%', 'Price USD FOB / kg *': '13.90', 'MOQ kg *': '250',
      'Standard Lead Wks *': '5', 'Incoterms Offered': 'FOB; CIF; DAP', 'Stock Status *': 'In Stock',
      'HS Code (Intl 6-dig)': '292690', 'Data Source URL *': 'https://kaveri-ls.test/metformin',
    },
    {
      // Rejected: one-digit CAS typo. Accepting it would create a product that
      // no filter and no price series ever joins to the real molecule.
      'Product_ID *': 'API-1115704-0002', 'Company_ID *': 'SELL-IND-9001',
      'Common / Trade Name *': 'Metformin HCl (typo row)', 'CAS Number *': '1115-70-5',
      'Price USD FOB / kg *': '13.90', 'MOQ kg *': '250', 'Data Source URL *': 'https://kaveri-ls.test',
    },
    {
      // Rejected: Company_ID is in no sheet and on no platform record. A shell
      // organisation is never minted from a product sheet.
      'Product_ID *': 'API-1039020-0001', 'Company_ID *': 'SELL-DEU-0042',
      'Common / Trade Name *': 'Orphan Paracetamol', 'CAS Number *': '103-90-2',
      'Price USD FOB / kg *': '4.10', 'MOQ kg *': '100', 'Data Source URL *': 'https://nowhere.test',
    },
  ],
);

// --- 3. FDC: per-UNIT pricing, header on row 4 ------------------------------
sheet(
  '3. FDC & Formulations',
  0,
  ['Product_ID *', 'Company_ID *', 'INN / Generic Name *', 'CAS Number *', 'Dosage Form *',
   'Strength / Dose *', 'Route of Admin *', 'Price USD / Unit (FOB) *', 'MOQ (units) *',
   'Standard Lead Weeks *', 'Data Source URL *'],
  [
    {
      'Product_ID *': 'FDC-1115704-0001', 'Company_ID *': 'SELL-IND-9001',
      'INN / Generic Name *': 'Metformin HCl Tablets 500mg', 'CAS Number *': '1115-70-4',
      'Dosage Form *': 'Tablet (IR)', 'Strength / Dose *': '500 mg', 'Route of Admin *': 'Oral',
      // $0.042 a tablet. In a per-kg column this wins every price-low sort
      // forever, so `priceUnit` has to travel with it.
      'Price USD / Unit (FOB) *': '0.042', 'MOQ (units) *': '500000', 'Standard Lead Weeks *': '10',
      'Data Source URL *': 'https://kaveri-ls.test/fdc',
    },
  ],
);

// --- 7. Regulatory Filings: header on row 4 ---------------------------------
sheet(
  '7. Regulatory Filings',
  0,
  ['Filing_ID', 'Company_ID *', 'Product Name *', 'CAS Number', 'Filing Type *', 'Filing Number *',
   'Regulatory Authority *', 'Country / Region *', 'Current Status *', 'Date Filed', 'Expiry Date',
   'Open for 3rd Party Reference', 'No. ANDAs/MAAs Referencing', 'Manufacturing Site(s) Covered', 'Source URL *'],
  [
    {
      'Filing_ID': 'RF-2026-9001', 'Company_ID *': 'SELL-IND-9001', 'Product Name *': 'Metformin HCl',
      'CAS Number': '1115-70-4', 'Filing Type *': 'US FDA Type II DMF (API)', 'Filing Number *': 'Type II DMF #99001',
      'Regulatory Authority *': 'US FDA CDER', 'Country / Region *': 'USA', 'Current Status *': 'Active / Current',
      'Date Filed': '15-Mar-2018',
      // Genuinely no expiry — the register must report unknown, never "ok".
      'Expiry Date': 'N/A (DMF — no expiry)',
      'Open for 3rd Party Reference': 'Yes (Open to reference)',
      'No. ANDAs/MAAs Referencing': '12 ANDAs reference this DMF',
      'Manufacturing Site(s) Covered': 'Medak (FEI 3009991111)',
      'Source URL *': 'https://accessdata.fda.gov/',
    },
  ],
);

// --- 9. Key Contacts: includes refused personal-data columns ----------------
sheet(
  '9. Key Contacts',
  0,
  ['Contact_ID', 'Company_ID *', 'Salutation', 'First Name *', 'Last Name *', 'Designation / Job Title *',
   'Department', 'Seniority Level *', 'Primary Role *', 'Business Email *', 'Personal Email',
   'Mobile / WhatsApp *', 'Office Phone', 'LinkedIn Profile URL', 'Twitter / X Handle',
   'Territory / Markets Responsible', 'Languages Spoken', 'Response Avg (hours)', 'Interaction Summary',
   'Relationship Status', 'Last Verified'],
  [
    {
      'Contact_ID': 'CON-IND-9001', 'Company_ID *': 'SELL-IND-9001', 'Salutation': 'Ms.',
      'First Name *': 'Anjali', 'Last Name *': 'Rao', 'Designation / Job Title *': 'Head of Export Sales',
      'Department': 'International Business', 'Seniority Level *': 'director', 'Primary Role *': 'export_sales',
      'Business Email *': 'anjali.rao@kaveri-ls.test',
      // Refused at the mapper — never stored. The importer says so out loud.
      'Personal Email': 'anjali.personal@gmail.test',
      'Mobile / WhatsApp *': '+91-90000-11111', 'Office Phone': '+91-40-2222-3333',
      'LinkedIn Profile URL': 'https://linkedin.com/in/example-anjali',
      'Twitter / X Handle': '@anjali',
      'Territory / Markets Responsible': 'USA; EU27; Japan', 'Languages Spoken': 'English; Telugu; Hindi',
      'Response Avg (hours)': '< 6 hours (business hours)',
      'Interaction Summary': 'Met at CPhI; discussed Q3 metformin capacity',
      'Relationship Status': 'Active Engagement', 'Last Verified': '01-Jun-2026',
    },
  ],
);

// --- 6. Price Intelligence: header on row 5, with 24-month history ----------
sheet(
  '6. Price Intelligence',
  1,
  ['Price_Obs_ID', 'Product_ID', 'Company_ID', 'CAS Number *', 'Product Name *', 'Product Category *',
   'Price (Original Currency) *', 'Currency *', 'FX Rate Used', 'Incoterm *', 'Supplier Country *',
   'Destination Country *', 'Source Type *', 'Source Name', 'Source URL *', 'Data Confidence *',
   'Date Observed *', 'M-1 (Most Recent)', 'M-2', 'M-3', 'M-4'],
  [
    {
      'Price_Obs_ID': 'PO-20260601-9001', 'Product_ID': 'API-1115704-0001', 'Company_ID': 'SELL-IND-9001',
      'CAS Number *': '1115-70-4', 'Product Name *': 'Metformin Hydrochloride', 'Product Category *': 'API',
      'Price (Original Currency) *': '13.90', 'Currency *': 'USD', 'FX Rate Used': '1.0000',
      'Incoterm *': 'FOB', 'Supplier Country *': 'India', 'Destination Country *': 'Germany',
      'Source Type *': 'LISTED', 'Source Name': 'Kaveri price list', 'Source URL *': 'https://kaveri-ls.test/prices',
      'Data Confidence *': 'MEDIUM (Trade data)', 'Date Observed *': '01-Jun-2026',
      // Four months of history; M-3 is deliberately blank and must be skipped
      // rather than zero-filled.
      'M-1 (Most Recent)': '14.10', 'M-2': '14.30', 'M-3': '', 'M-4': '13.80',
    },
  ],
);

await wb.xlsx.writeFile(out);
console.log('wrote', out);
