import { describe, it, expect } from 'vitest';
import {
  PLANS,
  ENTITLEMENTS,
  parsePlan,
  entitlements,
  hasFeature,
  isAtLimit,
  remaining,
  requiredPlanFor,
  requiredPlanForLimit,
  isUpgrade,
} from './plans';

describe('parsePlan', () => {
  it('accepts known plans', () => {
    expect(parsePlan('growth')).toBe('growth');
    expect(parsePlan('enterprise')).toBe('enterprise');
  });

  it('fails closed to free for unknown/absent values', () => {
    expect(parsePlan('platinum')).toBe('free');
    expect(parsePlan(null)).toBe('free');
    expect(parsePlan(undefined)).toBe('free');
    expect(parsePlan('')).toBe('free');
  });
});

describe('revenue model invariant', () => {
  it('no plan exposes a commission/take-rate — subscription is the only revenue', () => {
    for (const p of PLANS) {
      expect(Object.keys(ENTITLEMENTS[p])).not.toContain('takeRatePercent');
      expect(Object.keys(ENTITLEMENTS[p])).not.toContain('gmvFee');
    }
  });

  it('free is actually free and enterprise is quote-based', () => {
    expect(ENTITLEMENTS.free.priceUsd).toBe(0);
    expect(ENTITLEMENTS.growth.priceUsd).toBe(799);
    expect(ENTITLEMENTS.enterprise.priceUsd).toBeNull();
  });
});

describe('limits', () => {
  it('free caps RFQs at 3 per month', () => {
    expect(isAtLimit('free', 'rfqsPerMonth', 2)).toBe(false);
    expect(isAtLimit('free', 'rfqsPerMonth', 3)).toBe(true);
    expect(isAtLimit('free', 'rfqsPerMonth', 4)).toBe(true);
  });

  it('growth and enterprise have unlimited RFQs', () => {
    expect(isAtLimit('growth', 'rfqsPerMonth', 9999)).toBe(false);
    expect(isAtLimit('enterprise', 'rfqsPerMonth', 9999)).toBe(false);
  });

  it('free caps live listings at 5', () => {
    expect(isAtLimit('free', 'liveListings', 4)).toBe(false);
    expect(isAtLimit('free', 'liveListings', 5)).toBe(true);
  });

  it('seats: free 1, growth 5, enterprise unlimited', () => {
    expect(isAtLimit('free', 'seats', 1)).toBe(true);
    expect(isAtLimit('growth', 'seats', 4)).toBe(false);
    expect(isAtLimit('growth', 'seats', 5)).toBe(true);
    expect(isAtLimit('enterprise', 'seats', 500)).toBe(false);
  });

  it('an unknown plan is treated as free (fails closed, not open)', () => {
    expect(isAtLimit('bogus', 'rfqsPerMonth', 3)).toBe(true);
  });

  it('remaining() reports headroom, null when unlimited', () => {
    expect(remaining('free', 'rfqsPerMonth', 1)).toBe(2);
    expect(remaining('free', 'rfqsPerMonth', 5)).toBe(0); // never negative
    expect(remaining('growth', 'rfqsPerMonth', 100)).toBeNull();
  });
});

describe('features', () => {
  it('gates comparison export above free', () => {
    expect(hasFeature('free', 'exportComparison')).toBe(false);
    expect(hasFeature('growth', 'exportComparison')).toBe(true);
    expect(hasFeature('enterprise', 'exportComparison')).toBe(true);
  });

  it('reserves SSO, approvals, API and audit export for enterprise', () => {
    for (const f of ['samlSso', 'teamApprovals', 'apiAccess', 'auditExport'] as const) {
      expect(hasFeature('free', f)).toBe(false);
      expect(hasFeature('growth', f)).toBe(false);
      expect(hasFeature('enterprise', f)).toBe(true);
    }
  });

  it('verification SLA improves with plan', () => {
    expect(entitlements('free').verificationSlaHours).toBe(48);
    expect(entitlements('growth').verificationSlaHours).toBe(24);
    expect(entitlements('enterprise').verificationSlaHours).toBe(12);
  });
});

describe('upgrade prompts', () => {
  it('names the cheapest plan that unlocks a feature', () => {
    expect(requiredPlanFor('exportComparison')).toBe('growth');
    expect(requiredPlanFor('featuredPlacement')).toBe('growth');
    expect(requiredPlanFor('samlSso')).toBe('enterprise');
  });

  it('names the cheapest plan for a needed limit', () => {
    expect(requiredPlanForLimit('seats', 1)).toBe('free');
    expect(requiredPlanForLimit('seats', 3)).toBe('growth');
    expect(requiredPlanForLimit('seats', 50)).toBe('enterprise');
    expect(requiredPlanForLimit('rfqsPerMonth', 10)).toBe('growth');
  });

  it('orders plans correctly', () => {
    expect(isUpgrade('free', 'growth')).toBe(true);
    expect(isUpgrade('growth', 'free')).toBe(false);
    expect(isUpgrade('growth', 'growth')).toBe(false);
    expect(isUpgrade('growth', 'enterprise')).toBe(true);
  });
});
