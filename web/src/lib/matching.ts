/**
 * Rule-based RFQ → supplier matching (BACKLOG F4.2).
 *
 * Deliberately NOT AI: an RFQ is routed to verified sellers that (a) list the
 * requested product and (b) hold every certification the buyer mandated. AI
 * scoring is Phase 2 (R16) — see ADR/roadmap.
 *
 * Pure functions only, so the rule is unit-testable without a DB.
 */

export interface MatchableCert {
  name: string;
  status: string; // "pending" | "verified" | "rejected"
  expiresAt?: Date | string | null;
}

export interface MatchableProduct {
  cas: string;
  status: string; // "draft" | "live" | "unpublished"
}

export interface MatchableSeller {
  id: string;
  name?: string;
  kind: string; // "buyer" | "seller" | "both"
  status: string; // org verification status
  country?: string;
  products: MatchableProduct[];
  certifications: MatchableCert[];
}

export interface MatchCriteria {
  cas: string;
  /** Certifications the buyer marked mandatory. ALL must be held. */
  requiredCerts?: string[];
  /** Optional origin filter; when set, only sellers from this country match. */
  preferredCountry?: string | null;
  now?: Date;
}

/** CAS numbers are compared digits-and-dashes only, case/space insensitive. */
export function normalizeCas(cas: string): string {
  return (cas ?? '').trim().replace(/\s+/g, '');
}

export function parseCertList(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/** A cert counts only if ops verified it AND it has not expired. */
export function holdsCert(seller: MatchableSeller, certName: string, now: Date): boolean {
  return seller.certifications.some((c) => {
    if (c.name !== certName) return false;
    if (c.status !== 'verified') return false;
    if (!c.expiresAt) return true; // no expiry recorded => treated as valid
    const exp = c.expiresAt instanceof Date ? c.expiresAt : new Date(c.expiresAt);
    return exp.getTime() > now.getTime();
  });
}

export function listsProduct(seller: MatchableSeller, cas: string): boolean {
  const target = normalizeCas(cas);
  return seller.products.some((p) => p.status === 'live' && normalizeCas(p.cas) === target);
}

/**
 * Returns the sellers an RFQ should be broadcast to.
 * The buyer may then tick/untick before broadcasting (F4.2).
 */
export function matchSuppliers(
  sellers: MatchableSeller[],
  criteria: MatchCriteria
): MatchableSeller[] {
  const now = criteria.now ?? new Date();
  const required = criteria.requiredCerts ?? [];

  return sellers.filter((s) => {
    // 1. Only ops-verified sellers ever receive an RFQ (F2.5).
    if (s.status !== 'verified') return false;
    // 2. Must be able to sell.
    if (s.kind !== 'seller' && s.kind !== 'both') return false;
    // 3. Must actually list the requested product, live.
    if (!listsProduct(s, criteria.cas)) return false;
    // 4. Must hold EVERY mandated certification (AND, not OR).
    if (!required.every((cert) => holdsCert(s, cert, now))) return false;
    // 5. Optional origin preference.
    if (criteria.preferredCountry && s.country !== criteria.preferredCountry) return false;
    return true;
  });
}

/** Human-readable explanation of why a seller did/didn't match — surfaced in the UI. */
export function explainMatch(
  seller: MatchableSeller,
  criteria: MatchCriteria
): { matched: boolean; reasons: string[] } {
  const now = criteria.now ?? new Date();
  const reasons: string[] = [];

  if (seller.status !== 'verified') reasons.push('supplier not verified');
  if (seller.kind !== 'seller' && seller.kind !== 'both') reasons.push('not a supplier account');
  if (!listsProduct(seller, criteria.cas)) reasons.push(`does not list CAS ${criteria.cas}`);
  for (const cert of criteria.requiredCerts ?? []) {
    if (!holdsCert(seller, cert, now)) reasons.push(`missing valid ${cert}`);
  }
  if (criteria.preferredCountry && seller.country !== criteria.preferredCountry) {
    reasons.push(`origin is not ${criteria.preferredCountry}`);
  }

  return { matched: reasons.length === 0, reasons };
}
