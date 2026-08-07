/**
 * Onboarding domain — pure, unit tested, no Prisma and no I/O.
 *
 * Parses and validates the repeated site / credential rows the onboarding
 * wizard posts, so the server action stays a thin persistence layer and the
 * rules below can be tested without a database.
 *
 * The central rule: an organisation claiming to *manufacture* must declare at
 * least one site. GMP certificates are issued per site, so a manufacturer with
 * no site is a claim that can never be verified — which is precisely the shape
 * a reseller-posing-as-manufacturer takes.
 */

export const SUPPLIER_TYPES = ['manufacturer', 'cdmo', 'distributor', 'trader'] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number];

export const SITE_TYPES = ['manufacturing', 'packaging', 'warehouse', 'laboratory'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const CREDENTIAL_CATEGORIES = ['certification', 'licence'] as const;
export type CredentialCategory = (typeof CREDENTIAL_CATEGORIES)[number];

/** Supplier types that physically make product, and so must name a site. */
const MAKES_PRODUCT: readonly string[] = ['manufacturer', 'cdmo'];

/**
 * Credentials offered in the wizard. `category` decides which register the
 * value belongs to; `authority` pre-fills the issuer so ops sees a consistent
 * name rather than eleven spellings of "CDSCO".
 */
export const SELLER_CREDENTIALS = [
  { name: 'US FDA GMP', category: 'certification', authority: 'US FDA' },
  { name: 'EU GMP', category: 'certification', authority: 'EMA / national authority' },
  { name: 'WHO GMP', category: 'certification', authority: 'WHO' },
  { name: 'WHO Prequalification', category: 'certification', authority: 'WHO' },
  { name: 'CDSCO / Schedule M', category: 'certification', authority: 'CDSCO' },
  { name: 'NMPA GMP', category: 'certification', authority: 'NMPA' },
  { name: 'ISO 9001', category: 'certification', authority: 'Accredited registrar' },
  { name: 'Manufacturing licence (Form 25/28)', category: 'licence', authority: 'State FDA' },
  { name: 'Import Export Code (IEC)', category: 'licence', authority: 'DGFT' },
  { name: 'EU Written Confirmation', category: 'licence', authority: 'CDSCO' },
] as const;

export const BUYER_CREDENTIALS = [
  { name: 'Wholesale drug licence (Form 20B)', category: 'licence', authority: 'State FDA' },
  { name: 'Wholesale drug licence (Form 21B)', category: 'licence', authority: 'State FDA' },
  { name: 'Manufacturing licence (Form 25/28)', category: 'licence', authority: 'State FDA' },
  { name: 'Import Export Code (IEC)', category: 'licence', authority: 'DGFT' },
  { name: 'ISO 9001', category: 'certification', authority: 'Accredited registrar' },
] as const;

export interface SiteInput {
  name: string;
  location: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  siteType: SiteType;
  regulatoryId: string | null;
}

export interface CredentialInput {
  name: string;
  category: CredentialCategory;
  number: string | null;
  issuingAuthority: string | null;
  expiresAt: Date | null;
  documentId: string | null;
}

/** Raw string row as it arrives from FormData (everything is a string there). */
export type RawRow = Record<string, string | undefined>;

const clean = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

/**
 * Parses a date that a form supplied as `yyyy-mm-dd`.
 * Returns null for empty or unparseable input rather than an Invalid Date,
 * because an Invalid Date reaching Prisma throws at write time — far away from
 * the bad input that caused it.
 */
export function parseDate(v: string | undefined): Date | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asSiteType(v: string | undefined): SiteType {
  return (SITE_TYPES as readonly string[]).includes(v ?? '') ? (v as SiteType) : 'manufacturing';
}

function asCategory(v: string | undefined): CredentialCategory {
  return v === 'licence' ? 'licence' : 'certification';
}

/** Builds the display summary from whichever address parts were supplied. */
export function summarizeLocation(row: RawRow): string {
  const parts = [clean(row.city), clean(row.state), clean(row.country)].filter(Boolean);
  return parts.length ? parts.join(', ') : (clean(row.location) ?? '');
}

/**
 * Keeps only rows the user actually filled in. The wizard renders blank spare
 * rows, so a row with no name is an untouched row, not an error.
 */
export function parseSites(rows: RawRow[]): SiteInput[] {
  const out: SiteInput[] = [];
  for (const row of rows) {
    const name = clean(row.name);
    if (!name) continue;
    out.push({
      name,
      location: summarizeLocation(row),
      addressLine: clean(row.addressLine),
      city: clean(row.city),
      state: clean(row.state),
      postalCode: clean(row.postalCode),
      country: clean(row.country),
      siteType: asSiteType(row.siteType),
      regulatoryId: clean(row.regulatoryId),
    });
  }
  return out;
}

export function parseCredentials(rows: RawRow[]): CredentialInput[] {
  const out: CredentialInput[] = [];
  for (const row of rows) {
    const name = clean(row.name);
    if (!name) continue;
    out.push({
      name,
      category: asCategory(row.category),
      number: clean(row.number),
      issuingAuthority: clean(row.issuingAuthority),
      expiresAt: parseDate(row.expiresAt),
      documentId: clean(row.documentId),
    });
  }
  return out;
}

export type OnboardingIssue =
  | 'regNumberRequired'
  | 'siteRequiredForManufacturer'
  | 'licenceNumberRequired'
  | 'credentialExpiryInPast';

export interface ValidationInput {
  regNumber: string | null;
  supplierType: string | null;
  sites: SiteInput[];
  credentials: CredentialInput[];
}

/**
 * Returns every problem with a submission, empty when it is acceptable.
 *
 * Returns all issues rather than the first so the wizard can show them
 * together — making someone resubmit four times to discover four problems is
 * how you get people entering junk to get past the form.
 */
export function validateOnboarding(input: ValidationInput, now: Date = new Date()): OnboardingIssue[] {
  const issues: OnboardingIssue[] = [];

  if (!input.regNumber) issues.push('regNumberRequired');

  if (input.supplierType && MAKES_PRODUCT.includes(input.supplierType) && input.sites.length === 0) {
    issues.push('siteRequiredForManufacturer');
  }

  // A licence without its number cannot be checked against the issuing
  // register, which makes it decorative. Certificates are laxer: the document
  // itself carries the detail.
  if (input.credentials.some((c) => c.category === 'licence' && !c.number)) {
    issues.push('licenceNumberRequired');
  }

  if (input.credentials.some((c) => c.expiresAt && c.expiresAt.getTime() < now.getTime())) {
    issues.push('credentialExpiryInPast');
  }

  return issues;
}

/** True when the declared supplier type obliges the org to name a site. */
export function requiresSite(supplierType: string | null | undefined): boolean {
  return !!supplierType && MAKES_PRODUCT.includes(supplierType);
}
