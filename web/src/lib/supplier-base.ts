/**
 * Supplier base — who is actually approved to make a molecule, from open data.
 *
 * `supply-risk.ts` needs a supplier list to compute concentration, but until now
 * nothing filled it from outside the platform: HHI was computed over whoever
 * happened to have listed on PharmaLink. That is a marketplace statistic, not a
 * market one, and it reads as the latter.
 *
 * This module derives the supply base from openFDA's `drugsfda` endpoint — the
 * register of approved US drug applications. Every claim it makes is a countable
 * public fact, in keeping with the doctrine at the top of `supply-risk.ts`.
 *
 * ## What this is NOT
 *
 * These are **finished-dose application holders**, not API manufacturers. The
 * company that holds an ANDA for ibuprofen tablets frequently buys the ibuprofen
 * itself from a third party. The definitive API-level answer is the FDA Type II
 * DMF list, which is a quarterly spreadsheet behind a WAF that blocks scripted
 * clients (probed 2026-08-11 — `www.fda.gov` serves an abuse-detection page to
 * anything without a browser fingerprint), so it stays a manual import.
 *
 * The distinction is carried in the data (`basis: 'finished_dose'`) rather than
 * left to the reader, because "12 suppliers" means something very different
 * depending on which question it answers.
 */

// ---------------------------------------------------------------------------
// Molecule naming
// ---------------------------------------------------------------------------

/**
 * INN (what the rest of this codebase uses) → USAN (what the FDA indexes by).
 *
 * Not cosmetic. Querying openFDA for `paracetamol` returns **zero** records —
 * the US adopted name is `acetaminophen`, and the API does no synonym expansion.
 * Without this table the two highest-volume molecules in `HS_BY_CAS` would both
 * silently report an empty supply base, which `concentrationOf` would then
 * correctly, and uselessly, grade `unknown`.
 *
 * Keyed by CAS so it cannot drift from a display-name change.
 *
 * Every entry was confirmed against the live endpoint on 2026-08-11 — a guess is
 * worthless here, because a wrong name fails exactly like a molecule with no
 * approvals. `vitamin e` was the plausible-looking guess for tocopherol and
 * returns NOT_FOUND; `tocopherol` returns 5 applications. Trailing counts are
 * the applications each name returned, so a future drift is visible.
 */
export const US_GENERIC_BY_CAS: Readonly<Record<string, string>> = {
  '103-90-2': 'acetaminophen', // INN paracetamol — NOT_FOUND under the INN; 127
  '50-78-2': 'aspirin', // INN acetylsalicylic acid — NOT_FOUND under the INN; 15
  '59-02-9': 'tocopherol', // NOT `vitamin e`, which is NOT_FOUND; 5
  '15687-27-1': 'ibuprofen', // 106
  '50-81-7': 'ascorbic acid', // 9
  '83-88-5': 'riboflavin', // 7
  '68-19-9': 'cyanocobalamin', // 21
  '114-07-8': 'erythromycin', // 28
  '56-75-7': 'chloramphenicol', // 1, and it is discontinued — correctly 0 holders
  '60-54-8': 'tetracycline', // 9
  '26787-78-0': 'amoxicillin', // 58
  '738-70-5': 'trimethoprim', // 19
};

/** The name to query openFDA with, or undefined if the molecule is unmapped. */
export function usGenericName(cas: string): string | undefined {
  return US_GENERIC_BY_CAS[cas];
}

// ---------------------------------------------------------------------------
// Sponsor identity
// ---------------------------------------------------------------------------

/**
 * Legal-form suffixes stripped before comparing two sponsor names.
 *
 * Deliberately limited to legal forms. It is tempting to also strip descriptive
 * words like `PHARMACEUTICALS` or `LABORATORIES`, but that merges genuinely
 * distinct firms — `SUN PHARMACEUTICAL` and `SUN CHEMICAL` would collapse to
 * `SUN`. Under-merging inflates the supplier count a little and understates
 * concentration; over-merging invents a monopoly. Between those two errors, this
 * one is the safe direction, and it is visible in `holders` for a human to audit.
 */
const LEGAL_SUFFIXES = [
  'INC',
  'LLC',
  'LTD',
  'LIMITED',
  'CORP',
  'CORPORATION',
  'CO',
  'COMPANY',
  'PLC',
  'GMBH',
  'AG',
  'SA',
  'NV',
  'BV',
  'AS',
  'AB',
  'OY',
  'PTY',
  'PVT',
  'PRIVATE',
  'LP',
  'LLP',
  'SPA',
  'SRL',
  'KK',
  'USA',
  'US',
];

/**
 * Canonical key for a sponsor name, for grouping only.
 *
 * The *display* name kept in `holders[].name` is the first spelling seen, not
 * this key — `STRIDES PHARMA` is what a buyer recognises, `STRIDES PHARMA` after
 * punctuation-stripping is not necessarily.
 */
export function canonicalSponsor(raw: string): string {
  let s = raw
    .toUpperCase()
    // Dropped, not spaced: "PHARMA'S" must key as PHARMAS, not "PHARMA S".
    // Covers both the ASCII and the typographic apostrophe.
    .replace(/[.,'‘’`]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  // Strip trailing legal forms repeatedly: "PHARMA USA INC" → "PHARMA".
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (s.endsWith(` ${suffix}`)) {
        s = s.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// openFDA drugsfda shapes — only the fields relied on
// ---------------------------------------------------------------------------

export interface DrugsFdaProduct {
  marketing_status?: string;
  active_ingredients?: { name?: string }[];
}

export interface DrugsFdaApplication {
  application_number?: string;
  sponsor_name?: string;
  products?: DrugsFdaProduct[];
}

export interface SupplierHolder {
  /** Display spelling, as first published upstream. */
  name: string;
  /** Approved, non-discontinued applications this holder has for the molecule. */
  approvals: number;
}

export interface SupplierBase {
  cas: string;
  /** The name actually queried — worth surfacing, since it differs from the INN. */
  queriedAs: string;
  /** `finished_dose` until the DMF list is imported; never silently upgraded. */
  basis: 'finished_dose';
  holders: SupplierHolder[];
  /** Distinct approved applications counted (the denominator of every share). */
  approvalCount: number;
  /** Applications excluded because every product on them is discontinued. */
  discontinuedApplications: number;
}

/**
 * An application whose products are *all* discontinued is a historical approval,
 * not a supplier. Counting them would show a comfortable field of twelve makers
 * for a molecule that two firms still actually ship.
 */
function isActive(app: DrugsFdaApplication): boolean {
  const products = app.products ?? [];
  if (products.length === 0) return false;
  return products.some((p) => (p.marketing_status ?? '').trim().toLowerCase() !== 'discontinued');
}

/**
 * Collapse a page of `drugsfda` applications into a supply base.
 *
 * Grouping is by **application**, never by NDC labeler. Probed on 2026-08-11,
 * ibuprofen has 264 distinct NDC `labeler_name` values but only 48 distinct
 * application sponsors: the difference is repackagers and relabelers — CVS
 * Pharmacy, Amazon.com Services, Bryant Ranch Prepack — none of which
 * manufacture anything. An HHI over labelers would report a broad competitive
 * field for a molecule that could still be made by very few plants.
 */
export function supplierBaseFrom(cas: string, queriedAs: string, apps: readonly DrugsFdaApplication[]): SupplierBase {
  const seenApplications = new Set<string>();
  const byKey = new Map<string, SupplierHolder>();
  let discontinued = 0;

  for (const app of apps) {
    const sponsor = (app.sponsor_name ?? '').trim();
    if (!sponsor) continue;

    // The upstream page can repeat an application; count each one once.
    const appNo = (app.application_number ?? '').trim();
    if (appNo) {
      if (seenApplications.has(appNo)) continue;
      seenApplications.add(appNo);
    }

    if (!isActive(app)) {
      discontinued++;
      continue;
    }

    const key = canonicalSponsor(sponsor);
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) existing.approvals++;
    else byKey.set(key, { name: sponsor, approvals: 1 });
  }

  const holders = [...byKey.values()].sort((a, b) => b.approvals - a.approvals || a.name.localeCompare(b.name));
  return {
    cas,
    queriedAs,
    basis: 'finished_dose',
    holders,
    approvalCount: holders.reduce((a, h) => a + h.approvals, 0),
    discontinuedApplications: discontinued,
  };
}

/**
 * Supplier shares for `herfindahl`.
 *
 * The share is **approval count, not volume**. Nobody publishes per-firm volumes
 * for a generic molecule, so this treats every approval as equal weight — which
 * understates the real concentration whenever one holder owns most of the
 * shipped tonnage across few approvals. It is a floor on concentration, not an
 * estimate of it, and the UI must say so rather than print the HHI bare.
 */
export function supplierShares(base: SupplierBase): { name: string; share: number }[] {
  return base.holders.map((h) => ({ name: h.name, share: h.approvals }));
}
