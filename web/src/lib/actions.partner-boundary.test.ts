import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Pins the EPIC N7 boundary that lib/partner.ts's type-shape guard (N7.10)
 * can't check by itself: that the call sites in actions.ts actually respect
 * it. Same "code-level guard + failing test" pattern N3.6 sets for A1,
 * applied at the source-scan level — actions.ts is a 'use server' module
 * with no DB-backed test harness, matching the precedent in
 * notifications.test.ts (which source-scans this same file for a different
 * invariant).
 */
const ACTIONS_SRC = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8');

function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  if (start === -1) throw new Error(`${name} not found in actions.ts — did it get renamed?`);
  const next = src.indexOf('\nexport ', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

/** Strips `//` line comments so a warning comment that NAMES the forbidden
 *  identifiers (as acceptQuoteAction's does, deliberately, for a future
 *  reader) doesn't trip its own guard — only actual code is checked. */
function stripLineComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '');
}

/** Same idea as stripLineComments, but also strips `/* ... *\/` block
 *  comments — needed for files (like a page's own JSDoc header) that
 *  document the same forbidden identifiers in a block comment rather than a
 *  line comment. */
function stripComments(src: string): string {
  return stripLineComments(src).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('partner boundary (EPIC N7 — sibling guard to N3.6/A1)', () => {
  it('acceptQuoteAction never grows a partner/acting-for branch — a partner NEVER accepts a quote', () => {
    const code = stripLineComments(extractFunction(ACTIONS_SRC, 'acceptQuoteAction'));
    for (const forbidden of ['actingForOrgId', 'PartnerRepresentation', 'draftedByPartnerId', 'canActFor', 'resolveActingOrgId']) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('createRfqAction resolves delegation before charging a plan/quota, and charges the PRINCIPAL', () => {
    const body = extractFunction(ACTIONS_SRC, 'createRfqAction');
    expect(body).toContain('resolveActingOrgId');
    // The quota lookup must read targetOrgId, never user.orgId, so a partner
    // drafting for a buyer never spends its own plan's quota.
    expect(body).toMatch(/prisma\.organization\.findUnique\(\{\s*where:\s*\{\s*id:\s*targetOrgId\s*\}/);
    expect(body).toContain('buyerOrgId: targetOrgId');
  });

  it('submitQuoteAction resolves delegation before self-dealing checks, and charges the PRINCIPAL', () => {
    const body = extractFunction(ACTIONS_SRC, 'submitQuoteAction');
    expect(body).toContain('resolveActingOrgId');
    expect(body).toContain('sellerOrgId: targetOrgId');
  });

  // Regression pin for the core trust mechanic PARTNER-PROGRAM.md §8 row 4
  // designed and this follow-up phase finally builds: a partner-drafted
  // quote must declare its own commission, never blend it silently into
  // unitPrice.
  it('submitQuoteAction requires a declared commission only in the delegated branch', () => {
    const body = extractFunction(ACTIONS_SRC, 'submitQuoteAction');
    expect(body).toContain('declaredCommissionPerKg');
    expect(body).toContain("error: 'commissionRequired'");
  });

  // Regression pin: canActFor/resolveActingOrgId only ever check the
  // PARTNER's representation grant — never the PRINCIPAL org's own
  // ops-verification status. Without an explicit re-check in the delegated
  // branch, an org could sign up (status:'draft'), immediately grant a
  // verified partner representation over itself, and have that partner
  // broadcast a real RFQ / submit a real quote on behalf of an org ops never
  // reviewed. Found by the phase 3-5 adversarial review; fixed by widening
  // the existing `organization.findUnique` select to include `status` and
  // gating on it — pinned here so it can't quietly regress.
  it('createRfqAction re-verifies the PRINCIPAL org status before creating an RFQ, not just the direct-post path', () => {
    const body = extractFunction(ACTIONS_SRC, 'createRfqAction');
    expect(body).toMatch(/select:\s*\{\s*plan:\s*true,\s*status:\s*true\s*\}/);
    expect(body).toMatch(/org(?:\?)?\.status\s*!==\s*'verified'/);
  });

  it('submitQuoteAction re-verifies the PRINCIPAL org status when acting for a represented supplier', () => {
    const body = extractFunction(ACTIONS_SRC, 'submitQuoteAction');
    expect(body).toContain('actingForOrgId');
    expect(body).toMatch(/select:\s*\{\s*status:\s*true\s*\}/);
    expect(body).toMatch(/actingOrg\?\.status\s*!==\s*'verified'/);
  });

  it('Model A payouts are only ever created inside changePlanAction, gated on an active PartnerAttribution', () => {
    const body = extractFunction(ACTIONS_SRC, 'changePlanAction');
    expect(body).toContain('isAttributionActive');
    expect(body).toContain("kind: 'model_a_margin'");
  });

  // Regression pin for the "silent delegation" gap this follow-up phase
  // closes: a principal org's own team must be notified when a partner
  // drafts on their behalf, not left to discover it on their own.
  it('createRfqAction notifies the PRINCIPAL org when a partner drafted the RFQ', () => {
    const body = extractFunction(ACTIONS_SRC, 'createRfqAction');
    expect(body).toMatch(/notifyOrg\(targetOrgId,\s*'rfq\.draftedByPartner'/);
  });

  it('submitQuoteAction notifies the PRINCIPAL org when a partner drafted the quote', () => {
    const body = extractFunction(ACTIONS_SRC, 'submitQuoteAction');
    expect(body).toMatch(/notifyOrg\(targetOrgId,\s*'quote\.draftedByPartner'/);
  });
});

describe('mandate detail page (partner-facing, read-only by construction)', () => {
  it('never imports acceptQuoteAction or ConfirmSubmit — a partner can view a mandate but never accept it', () => {
    const src = stripComments(readFileSync(new URL('../app/[locale]/partner/mandates/[id]/page.tsx', import.meta.url), 'utf8'));
    for (const forbidden of ['acceptQuoteAction', 'ConfirmSubmit']) {
      expect(src).not.toContain(forbidden);
    }
  });
});

describe('/api/match preview (found live: a partner\'s RFQ wizard always showed zero matches)', () => {
  it('allows either a direct buyer (rfq:create) or a drafting partner (partner:draft), not rfq:create alone', () => {
    const src = readFileSync(new URL('../app/api/match/route.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/can\(user\.principal,\s*'rfq:create'\)\s*\|\|\s*can\(user\.principal,\s*'partner:draft'\)/);
  });
});

describe('registerDealAction (deal registration — new, reuses recordIntroductionIfNew unmodified)', () => {
  it('requires a live representation on at least one side before sealing an Introduction', () => {
    const src = readFileSync(new URL('./partner-actions.ts', import.meta.url), 'utf8');
    const start = src.indexOf('export async function registerDealAction');
    const next = src.indexOf('\nexport ', start + 1);
    const body = src.slice(start, next === -1 ? undefined : next);
    expect(body).toMatch(/canActFor\(buyerRep,\s*'rfq_draft'\)/);
    expect(body).toMatch(/canActFor\(supplierRep,\s*'quote_draft'\)/);
    expect(body).toContain('recordIntroductionIfNew(partner.id, buyerOrgId, supplierOrgId, cas, user.id)');
  });
});

describe('sealAttributionIfNew (write-once, same shape as recordIntroductionIfNew)', () => {
  it('never calls .update() on partnerAttribution — first-claim-wins, no retroactive reassignment', () => {
    const src = readFileSync(new URL('./partner-actions.ts', import.meta.url), 'utf8');
    const start = src.indexOf('export async function sealAttributionIfNew');
    const next = src.indexOf('\nexport ', start + 1);
    const body = src.slice(start, next === -1 ? undefined : next);
    expect(body).not.toContain('partnerAttribution.update');
    expect(body).toContain("err.code === 'P2002'");
  });
});

describe('hidden-markup flag (N7.12 — reuses the existing market-benchmark math)', () => {
  it('flags only a partner-drafted quote priced >15% above market with no declared commission', () => {
    const src = readFileSync(new URL('./compare-queries.ts', import.meta.url), 'utf8');
    expect(src).toContain('flaggedMarkup');
    expect(src).toMatch(/draftedByPartnerId\s*!=\s*null/);
    expect(src).toMatch(/vsMarketPct\s*>\s*15/);
    expect(src).toContain('!q.declaredCommissionPerKg');
  });
});

describe('document upload delegation (EPIC N7 follow-up — wires up the document_upload scope)', () => {
  it('the /api/documents route resolves delegation and writes targetOrgId, not user.orgId, as the Document owner', () => {
    const src = readFileSync(new URL('../app/api/documents/route.ts', import.meta.url), 'utf8');
    expect(src).toContain("resolveActingOrgId(user.orgId, actingForOrgId, 'document_upload')");
    expect(src).toContain('orgId: targetOrgId');
    expect(src).toContain('uploadedByPartnerId');
  });
});

describe('grantRepresentationAction (found by the phase 3-5 adversarial review)', () => {
  it('rejects a partner granting itself representation over its own org', () => {
    const src = readFileSync(new URL('./partner-actions.ts', import.meta.url), 'utf8');
    const start = src.indexOf('export async function grantRepresentationAction');
    const next = src.indexOf('\nexport ', start + 1);
    const body = src.slice(start, next === -1 ? undefined : next);
    expect(body).toMatch(/partner\.orgId\s*===\s*user\.orgId/);
  });
});

describe('PartnerPayout schema shape (N7.10, sibling to the plans.test.ts revenue-model invariant)', () => {
  it('the PartnerPayout model has no dealId/quoteId/totalValue field', () => {
    const schemaSrc = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    const start = schemaSrc.indexOf('model PartnerPayout {');
    const end = schemaSrc.indexOf('\n}', start);
    const block = schemaSrc.slice(start, end);
    for (const forbidden of ['dealId', 'quoteId', 'totalValue', 'gmv']) {
      expect(block).not.toContain(forbidden);
    }
  });
});
