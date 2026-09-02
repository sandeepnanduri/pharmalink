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
