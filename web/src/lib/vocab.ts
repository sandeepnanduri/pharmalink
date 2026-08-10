/**
 * Controlled vocabularies for curated supplier data — pure, no DB/Next imports.
 *
 * Every parser here follows the rule already set by `parseRole` in `rbac.ts`:
 * unknown input fails **closed**, returning null rather than passing an
 * unrecognised string through to the database. A column that quietly accepts
 * "FOB India" alongside "FOB" cannot be filtered on, and the filter rail is
 * built on the promise that a filter which hides suppliers is backed by real
 * data.
 *
 * Two properties of the curation template drive the design:
 *
 *  1. **Cells carry parentheticals.** The template's own example rows write
 *     `HIGH (PharmaLink Verified)`, `NAI (No Action Indicated)`,
 *     `Current (Active)`, `Yes (ISO 9001:2015)`. An equality check against the
 *     documented vocabulary rejects every single one. So parsing is keyword-
 *     based, anchored on word boundaries so `CIF` never matches inside another
 *     token.
 *  2. **Multi-value cells use semicolons.** `FOB; CIF; DAP; DDP; EXW`. The
 *     schema convention (schema.prisma:124-128) is comma-separated, and every
 *     reader does `.split(',')`. Importing the raw cell yields one garbage
 *     token — and worse, `catalog-queries.ts`'s `incoterms: { contains: i }`
 *     still matches, so it half-works and nobody notices. Hence `splitMulti`.
 */

// ---------------------------------------------------------------------------
// Multi-value cells
// ---------------------------------------------------------------------------

/**
 * Splits a curated multi-value cell on any separator the template uses, into
 * trimmed, de-duplicated, non-empty parts.
 *
 * Semicolon first because that is what the template writes, but commas, pipes
 * and newlines all appear in real curation output. A comma **inside
 * parentheses** is part of the value, not a separator — `Yes (ISO 9001:2015,
 * current)` is one claim.
 *
 * Written as a depth-tracking scan rather than a regex split. The regex that
 * expresses "a comma with no unclosed paren after it" needs a lookahead over
 * the rest of the string, which backtracks to O(n²) — and these cells come from
 * an uploaded file, so a pathological one is an availability problem, not just
 * a slow parse.
 */
export function splitMulti(raw: string | null | undefined): string[] {
  const text = raw ?? '';
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);

    const isSeparator = ch === ';' || ch === '|' || ch === '\n' || (ch === ',' && depth === 0);
    if (isSeparator) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);

  return [...new Set(parts.map((s) => s.trim()).filter(Boolean))];
}

/**
 * Joins back into the comma-separated form the schema stores. The one place the
 * `;` → `,` conversion happens, so it cannot be half-applied.
 */
export function joinMulti(values: readonly string[]): string | null {
  const clean = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return clean.length ? clean.join(',') : null;
}

// ---------------------------------------------------------------------------
// Incoterms
// ---------------------------------------------------------------------------

/**
 * All ten Incoterms 2020 rules, exactly as the template's validation rule lists
 * them. `filters.ts` historically carried only seven; a supplier offering CPT,
 * CIP or DPU could not be filtered for at all.
 */
export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] as const;
export type Incoterm = (typeof INCOTERMS)[number];

export function parseIncoterm(raw: string | null | undefined): Incoterm | null {
  const text = (raw ?? '').toUpperCase();
  // Word-boundary so "FOB" in "FOB Nhava Sheva" matches but a longer token does
  // not accidentally contain a shorter code.
  return INCOTERMS.find((i) => new RegExp(`\\b${i}\\b`).test(text)) ?? null;
}

/** Parses a `FOB; CIF; DAP` cell into canonical codes, dropping anything unknown. */
export function parseIncoterms(raw: string | null | undefined): Incoterm[] {
  const found = new Set<Incoterm>();
  for (const part of splitMulti(raw)) {
    const hit = parseIncoterm(part);
    if (hit) found.add(hit);
  }
  // Preserve the canonical EXW→DDP order rather than the curator's typing order,
  // so two suppliers offering the same terms store the same string.
  return INCOTERMS.filter((i) => found.has(i));
}

// ---------------------------------------------------------------------------
// Price data confidence
// ---------------------------------------------------------------------------

export const DATA_CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type DataConfidence = (typeof DATA_CONFIDENCES)[number];

/**
 * How much a price observation of each confidence counts toward the forecast.
 *
 * This is the ONLY place a confidence label becomes a number.
 * `PriceObservation.weight` is what `forecast.ts` reads, and letting a
 * spreadsheet set it directly would let a curator silently outvote every
 * platform transaction.
 */
export const CONFIDENCE_WEIGHT: Record<DataConfidence, number> = {
  HIGH: 1,
  MEDIUM: 0.6,
  LOW: 0.3,
};

/**
 * The template defines HIGH as "PharmaLink escrow-confirmed". This platform
 * holds no escrow and never routes trade value (schema.prisma:712), so HIGH is
 * read as **an on-platform completed deal** — the equivalent evidence the
 * platform genuinely has.
 */
export function parseDataConfidence(raw: string | null | undefined): DataConfidence | null {
  const text = (raw ?? '').toUpperCase();
  return DATA_CONFIDENCES.find((c) => new RegExp(`\\b${c}\\b`).test(text)) ?? null;
}

export function confidenceWeight(raw: string | null | undefined, fallback = 0.3): number {
  const c = parseDataConfidence(raw);
  return c ? CONFIDENCE_WEIGHT[c] : fallback;
}

/**
 * The inverse: which bucket a weight the platform assigned itself falls in.
 *
 * Connector rows (`EVIDENCE_WEIGHT` in `market-data.ts`) get their weight from
 * the source type, not from a curator's label, and those two tables do not line
 * up exactly — an internal quote weighs 0.7, which is no bucket's value. Reading
 * the label off the weight keeps the badge on screen describing the number the
 * forecast actually used, instead of a second hand-typed opinion that can drift
 * from it.
 *
 * Boundaries are the midpoints between the bucket values, so each weight lands
 * in the bucket it is closest to.
 */
export function confidenceLabelForWeight(weight: number): DataConfidence {
  if (weight >= 0.8) return 'HIGH';
  if (weight >= 0.45) return 'MEDIUM';
  return 'LOW';
}

// ---------------------------------------------------------------------------
// Curation status
// ---------------------------------------------------------------------------

/**
 * The template's `Verification_Status`: how good the *curated record* is.
 *
 * DELIBERATELY NOT `Organization.status`, which is ops approval and gates
 * catalogue visibility plus the whole `REQUIRES_VERIFIED` permission set in
 * `rbac.ts`. Writing a curator's "Verified" into that column would publish an
 * imported company as an RFQ-eligible supplier with no ops review at all.
 */
export const CURATION_STATUSES = ['verified', 'unverified', 'outdated', 'flagged', 'duplicate'] as const;
export type CurationStatus = (typeof CURATION_STATUSES)[number];

export function parseCurationStatus(raw: string | null | undefined): CurationStatus | null {
  const text = (raw ?? '').toLowerCase();
  if (!text.trim()) return null;
  return CURATION_STATUSES.find((s) => new RegExp(`\\b${s}\\b`).test(text)) ?? null;
}

// ---------------------------------------------------------------------------
// Inspection outcomes
// ---------------------------------------------------------------------------

/**
 * FDA and EMA grade inspections on different scales and the template is
 * emphatic that the exact terms are used: "Never use informal descriptions."
 * Keeping them as one union with the authority attached means a badge can never
 * render an FDA "VAI" using EMA's colour scale.
 */
export const FDA_OUTCOMES = ['NAI', 'VAI', 'OAI'] as const;
export const EMA_OUTCOMES = ['Satisfactory', 'Deficiency', 'Refused'] as const;
export type FdaOutcome = (typeof FDA_OUTCOMES)[number];
export type EmaOutcome = (typeof EMA_OUTCOMES)[number];

export function parseFdaOutcome(raw: string | null | undefined): FdaOutcome | null {
  const text = (raw ?? '').toUpperCase();
  return FDA_OUTCOMES.find((o) => new RegExp(`\\b${o}\\b`).test(text)) ?? null;
}

export function parseEmaOutcome(raw: string | null | undefined): EmaOutcome | null {
  const text = (raw ?? '').toLowerCase();
  return EMA_OUTCOMES.find((o) => new RegExp(`\\b${o.toLowerCase()}\\b`).test(text)) ?? null;
}

/**
 * Severity for the UI. NAI / Satisfactory are clean; OAI / Refused are the ones
 * that should stop a buyer. Anything unknown is `unknown`, never `ok` — the same
 * rule `compliance.ts` applies to a certificate with no expiry date.
 */
export type OutcomeLevel = 'ok' | 'warning' | 'critical' | 'unknown';

const FDA_LEVEL: Record<FdaOutcome, OutcomeLevel> = { NAI: 'ok', VAI: 'warning', OAI: 'critical' };
const EMA_LEVEL: Record<EmaOutcome, OutcomeLevel> = {
  Satisfactory: 'ok',
  Deficiency: 'warning',
  Refused: 'critical',
};

export function outcomeLevel(raw: string | null | undefined): OutcomeLevel {
  const fda = parseFdaOutcome(raw);
  if (fda) return FDA_LEVEL[fda];
  const ema = parseEmaOutcome(raw);
  if (ema) return EMA_LEVEL[ema];
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Regulatory / filing status
// ---------------------------------------------------------------------------

export const FILING_STATUSES = ['active', 'approved', 'pending', 'suspended', 'withdrawn', 'expired'] as const;
export type FilingStatus = (typeof FILING_STATUSES)[number];

/**
 * The template writes these as `Active / Current`, `Approved (Active ANDA)`,
 * `Listed (Active)`, `Current (Active)`. "Current" and "Listed" both mean the
 * filing is live, so they map onto `active` rather than becoming two more
 * near-synonymous statuses nobody can filter on.
 */
export function parseFilingStatus(raw: string | null | undefined): FilingStatus | null {
  const text = (raw ?? '').toLowerCase();
  if (!text.trim()) return null;
  if (/\bwithdrawn\b|\bcancelled\b|\bcanceled\b/.test(text)) return 'withdrawn';
  if (/\bsuspended\b/.test(text)) return 'suspended';
  if (/\bexpired\b|\blapsed\b/.test(text)) return 'expired';
  if (/\bpending\b|\bunder review\b|\bsubmitted\b/.test(text)) return 'pending';
  if (/\bapproved\b/.test(text)) return 'approved';
  if (/\bactive\b|\bcurrent\b|\blisted\b|\bvalid\b/.test(text)) return 'active';
  return null;
}

// ---------------------------------------------------------------------------
// Tri-state booleans
// ---------------------------------------------------------------------------

/**
 * Halal, Kosher, BSE/TSE-free, non-GMO and the rest are filter-relevant claims
 * where **unknown is not the same as no**. A buyer filtering for Halal-certified
 * excipients must not be shown a product whose certification simply was not
 * curated — and must not have it silently excluded either, which is what a
 * non-nullable Boolean defaulting to false would do.
 *
 * The template writes `Yes (Halal certified)`, `No`, `N/A`, and blank.
 */
export function parseTriBool(raw: string | null | undefined): boolean | null {
  const text = (raw ?? '').trim().toLowerCase();
  if (!text) return null;
  // `\b` only on the word alternatives — a trailing `\b` after `-` never matches
  // at end-of-string, so a lone dash would fall through to the yes/no checks.
  if (/^(?:n\/?a|none|unknown|not applicable|tbd)\b|^[-—–]+$/.test(text)) return null;
  if (/^\s*(yes|y|true|certified|available|compliant|registered)\b/.test(text)) return true;
  if (/^\s*(no|n|false|not certified|unavailable|non-compliant)\b/.test(text)) return false;
  return null;
}
