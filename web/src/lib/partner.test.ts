import { describe, it, expect } from 'vitest';
import {
  PARTNER_PAYOUT_KINDS,
  MODEL_A_MARGIN_RATE,
  computePartnerPayoutAmount,
  canActFor,
  hasScope,
  isAttributionActive,
  withinDays,
  breadthTiersReached,
  BREADTH_TIERS,
  type PartnerPayoutInput,
} from './partner';

describe('trade-value / payout boundary (N7.10 — sibling guard to plans.ts N3.6/A1)', () => {
  it('PartnerPayoutInput never carries a field derived from a Deal/Quote', () => {
    const sample: PartnerPayoutInput = { kind: 'model_a_margin', sourceInvoiceAmount: 799, marginRate: 0.275 };
    const keys = Object.keys(sample);
    for (const forbidden of ['dealId', 'quoteId', 'dealTotalValue', 'gmv', 'takeRatePercent']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('lists Model A margin plus the four rewards-ladder bonus kinds — Model B bounty ships with N7.11', () => {
    expect(PARTNER_PAYOUT_KINDS).toEqual(['model_a_margin', 'activation_bonus', 'streak_bonus', 'breadth_bonus', 'referral_bonus']);
  });

  it('computes 27.5% of the subscription invoice, never a function of trade value', () => {
    expect(computePartnerPayoutAmount({ kind: 'model_a_margin', sourceInvoiceAmount: 799, marginRate: MODEL_A_MARGIN_RATE })).toBeCloseTo(219.73, 2);
    expect(computePartnerPayoutAmount({ kind: 'model_a_margin', sourceInvoiceAmount: 0, marginRate: MODEL_A_MARGIN_RATE })).toBe(0);
  });
});

describe('hasScope / canActFor', () => {
  it('parses the comma-separated scopes list', () => {
    expect(hasScope('rfq_draft,quote_draft', 'rfq_draft')).toBe(true);
    expect(hasScope('rfq_draft,quote_draft', 'document_upload')).toBe(false);
    expect(hasScope(null, 'rfq_draft')).toBe(false);
    expect(hasScope('', 'rfq_draft')).toBe(false);
  });

  it('denies when no representation row exists', () => {
    expect(canActFor(null, 'rfq_draft')).toBe(false);
  });

  it('denies a revoked representation even if the scope is present', () => {
    expect(canActFor({ revokedAt: new Date('2026-01-01'), scopes: 'rfq_draft' }, 'rfq_draft')).toBe(false);
  });

  it('denies when the specific scope was never granted', () => {
    expect(canActFor({ revokedAt: null, scopes: 'quote_draft' }, 'rfq_draft')).toBe(false);
  });

  it('allows a live representation with the matching scope', () => {
    expect(canActFor({ revokedAt: null, scopes: 'rfq_draft,quote_draft' }, 'rfq_draft')).toBe(true);
  });
});

describe('withinDays (Activation milestone window)', () => {
  it('is true at exactly the boundary and inside it', () => {
    const a = new Date('2026-08-01T00:00:00Z');
    expect(withinDays(a, new Date('2026-08-15T00:00:00Z'), 14)).toBe(true); // exactly 14 days
    expect(withinDays(a, new Date('2026-08-10T00:00:00Z'), 14)).toBe(true);
  });

  it('is false just past the window, and symmetric in direction', () => {
    const a = new Date('2026-08-01T00:00:00Z');
    expect(withinDays(a, new Date('2026-08-16T00:00:00Z'), 14)).toBe(false);
    expect(withinDays(new Date('2026-08-16T00:00:00Z'), a, 14)).toBe(false);
  });
});

describe('breadthTiersReached', () => {
  it('counts how many published tiers a representation count has crossed', () => {
    expect(breadthTiersReached(0)).toBe(0);
    expect(breadthTiersReached(2)).toBe(0);
    expect(breadthTiersReached(3)).toBe(1);
    expect(breadthTiersReached(5)).toBe(1);
    expect(breadthTiersReached(6)).toBe(2);
    expect(breadthTiersReached(10)).toBe(3);
    expect(breadthTiersReached(50)).toBe(BREADTH_TIERS.length);
  });
});

describe('isAttributionActive', () => {
  const now = new Date('2026-08-29T00:00:00Z');

  it('is false with no attribution', () => {
    expect(isAttributionActive(null, now)).toBe(false);
  });

  it('is true before expiry, false after (the Model A 24-month window)', () => {
    expect(isAttributionActive({ expiresAt: new Date('2026-09-01T00:00:00Z') }, now)).toBe(true);
    expect(isAttributionActive({ expiresAt: new Date('2026-08-01T00:00:00Z') }, now)).toBe(false);
  });
});
