/**
 * Stable external identifiers for curated records — pure, no DB/Next imports.
 *
 * The template assigns every entity a human-readable ID and says of the company
 * one: *"Never changes once assigned."* The whole nine-sheet cross-reference
 * graph is built on them — a product row points at `SELL-IND-0001`, a filing
 * points at both a company and a product — so they are stored as real columns
 * beside the cuid primary keys rather than generated and thrown away. Without
 * them the *second* upload of a batch cannot find what the first one created,
 * and matching falls back to company names, which is exactly what
 * `sameCompany()` exists to avoid relying on.
 *
 * **A supplied ID is always preserved verbatim.** Generation only fills a blank
 * cell. Re-deriving an ID a curator already assigned would break the promise
 * that it never changes.
 *
 * ## The scoping trap
 *
 * `Company_ID` is globally unique. `Product_ID` is **not** — its documented
 * format `[CAT]-[CAS_stripped]-[COMPANY_SEQ]` ends in a *per-company* sequence,
 * so Sun's metformin is `API-1115704-0001` and the next supplier's metformin is
 * also `API-1115704-0001`. A global `@unique` on `Product.externalId` throws on
 * the second supplier of any molecule. Hence `@@unique([orgId, externalId])` on
 * products, sites, filings and contacts, and a global unique only on
 * organisations.
 */

import { stripCas } from './cas';
import { countryAlpha3 } from './countries';

/** The `[CAT]` prefix, per entity kind. */
export const ID_PREFIX = {
  company: 'SELL',
  api: 'API',
  fdf: 'FDC',
  ksm: 'KSM',
  intermediate: 'KSM',
  raw_material: 'RAW',
  excipient: 'RAW',
  specialty: 'SPC',
  site: 'FAC',
  filing: 'RF',
  contact: 'CON',
} as const;

export type IdKind = keyof typeof ID_PREFIX;

const SEQ_WIDTH = 4;
const seq = (n: number): string => String(n).padStart(SEQ_WIDTH, '0');

/** `SELL-IND-0001`. Null when the country cannot be resolved to an alpha-3. */
export function companyExternalId(country: string | null | undefined, sequence: number): string | null {
  const iso3 = countryAlpha3(country);
  if (!iso3) return null;
  return `${ID_PREFIX.company}-${iso3}-${seq(sequence)}`;
}

/**
 * `API-1115704-0001` — category, CAS without hyphens, and the company's own
 * running number for that product. Unique **within a company only**.
 */
export function productExternalId(
  productType: IdKind,
  cas: string | null | undefined,
  companySequence: number,
): string | null {
  const prefix = ID_PREFIX[productType];
  if (!prefix || !cas) return null;
  return `${prefix}-${stripCas(cas)}-${seq(companySequence)}`;
}

/**
 * `FAC-IND-3002808027` — the template keys facilities on the FDA FEI, which it
 * calls "the primary key" for a site. Falls back to a sequence when a site has
 * no FEI, which is common for non-US-registered plants.
 */
export function siteExternalId(
  country: string | null | undefined,
  feiNumber: string | null | undefined,
  sequence: number,
): string | null {
  const iso3 = countryAlpha3(country);
  if (!iso3) return null;
  const fei = (feiNumber ?? '').replace(/\D/g, '');
  return `${ID_PREFIX.site}-${iso3}-${fei || seq(sequence)}`;
}

/** `RF-2026-0001` — filings are numbered per year of filing, per the template. */
export function filingExternalId(year: number, sequence: number): string {
  return `${ID_PREFIX.filing}-${year}-${seq(sequence)}`;
}

/** `CON-IND-0001`. */
export function contactExternalId(country: string | null | undefined, sequence: number): string | null {
  const iso3 = countryAlpha3(country);
  if (!iso3) return null;
  return `${ID_PREFIX.contact}-${iso3}-${seq(sequence)}`;
}

const SHAPES: Record<string, RegExp> = {
  company: /^SELL-[A-Z]{3}-\d{4,}$/,
  product: /^(?:API|FDC|KSM|RAW|SPC)-\d{2,10}-\d{4,}$/,
  site: /^FAC-[A-Z]{3}-\d+$/,
  filing: /^RF-\d{4}-\d{4,}$/,
  contact: /^CON-[A-Z]{3}-\d{4,}$/,
};

/**
 * Whether a curator-supplied ID matches its documented shape.
 *
 * A mismatch is reported as a warning, **not** a rejection: the ID is still
 * stored verbatim. The template's promise is that IDs never change, and
 * refusing a slightly-off ID that a curation contractor has already circulated
 * would break more than it fixes.
 */
export function isWellFormedExternalId(kind: keyof typeof SHAPES, id: string): boolean {
  return SHAPES[kind]?.test(id.trim().toUpperCase()) ?? false;
}

/**
 * Per-scope sequence allocator.
 *
 * Company sequences run per country (`SELL-IND-0001`, `SELL-DEU-0001` — both
 * exist, and both are first); product sequences run per company. Passing the
 * wrong scope key is how two records collide, so the caller names the scope
 * explicitly rather than the allocator guessing from the kind.
 */
export class SequenceAllocator {
  private readonly next = new Map<string, number>();

  constructor(existingHighWaterMarks: Record<string, number> = {}) {
    for (const [scope, high] of Object.entries(existingHighWaterMarks)) {
      this.next.set(scope, high + 1);
    }
  }

  take(scope: string): number {
    const n = this.next.get(scope) ?? 1;
    this.next.set(scope, n + 1);
    return n;
  }
}

/**
 * Reads the trailing sequence out of an existing ID so a re-upload continues the
 * series instead of restarting it and colliding.
 */
export function sequenceOf(id: string | null | undefined): number | null {
  const m = /-(\d+)$/.exec((id ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}
