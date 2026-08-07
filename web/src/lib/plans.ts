/**
 * Subscription plans & entitlements.
 *
 * REVENUE MODEL: subscription only. The platform takes **no commission on trade
 * value**, holds no escrow and processes no buyer↔seller payments — so it stays
 * out of PCI / KYC-AML scope. Invoices are issued by the platform and settled
 * off-platform (bank transfer / external payment link).
 *
 * Pure logic, no DB/Next imports — limits are unit-tested and enforced
 * server-side in lib/actions.ts. The UI only *reflects* these rules.
 */

export const PLANS = ['free', 'growth', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

/** `null` means unlimited. */
export interface Entitlements {
  rfqsPerMonth: number | null;
  liveListings: number | null;
  seats: number | null;
  verificationSlaHours: number;
  featuredPlacement: boolean;
  exportComparison: boolean;
  priceBenchmarks: boolean;
  whatsappNotifications: boolean;
  samlSso: boolean;
  teamApprovals: boolean;
  apiAccess: boolean;
  auditExport: boolean;
  /** Monthly list price in USD; null = "contact us". */
  priceUsd: number | null;
}

export const ENTITLEMENTS: Record<Plan, Entitlements> = {
  free: {
    rfqsPerMonth: 3,
    liveListings: 5,
    seats: 1,
    verificationSlaHours: 48,
    featuredPlacement: false,
    exportComparison: false,
    priceBenchmarks: false,
    whatsappNotifications: false,
    samlSso: false,
    teamApprovals: false,
    apiAccess: false,
    auditExport: false,
    priceUsd: 0,
  },
  growth: {
    rfqsPerMonth: null,
    liveListings: null,
    seats: 5,
    verificationSlaHours: 24,
    featuredPlacement: true,
    exportComparison: true,
    priceBenchmarks: true,
    whatsappNotifications: true,
    samlSso: false,
    teamApprovals: false,
    apiAccess: false,
    auditExport: false,
    priceUsd: 799,
  },
  enterprise: {
    rfqsPerMonth: null,
    liveListings: null,
    seats: null,
    verificationSlaHours: 12,
    featuredPlacement: true,
    exportComparison: true,
    priceBenchmarks: true,
    whatsappNotifications: true,
    samlSso: true,
    teamApprovals: true,
    apiAccess: true,
    auditExport: true,
    priceUsd: null, // custom
  },
};

/** Unknown/absent plan values fail closed to the least-privileged plan. */
export function parsePlan(value: string | null | undefined): Plan {
  return (PLANS as readonly string[]).includes(value ?? '') ? (value as Plan) : 'free';
}

export function entitlements(plan: string | null | undefined): Entitlements {
  return ENTITLEMENTS[parsePlan(plan)];
}

export type BooleanFeature = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];

export function hasFeature(plan: string | null | undefined, feature: BooleanFeature): boolean {
  return entitlements(plan)[feature];
}

export type LimitKey = 'rfqsPerMonth' | 'liveListings' | 'seats';

/** True when `current` usage is already at/over the plan's limit. */
export function isAtLimit(plan: string | null | undefined, key: LimitKey, current: number): boolean {
  const limit = entitlements(plan)[key];
  if (limit === null) return false; // unlimited
  return current >= limit;
}

export function remaining(plan: string | null | undefined, key: LimitKey, current: number): number | null {
  const limit = entitlements(plan)[key];
  if (limit === null) return null;
  return Math.max(0, limit - current);
}

/** Cheapest plan that unlocks a feature — drives "Upgrade to X" prompts. */
export function requiredPlanFor(feature: BooleanFeature): Plan {
  return PLANS.find((p) => ENTITLEMENTS[p][feature]) ?? 'enterprise';
}

/** Cheapest plan whose limit exceeds `needed`. */
export function requiredPlanForLimit(key: LimitKey, needed: number): Plan {
  return (
    PLANS.find((p) => {
      const limit = ENTITLEMENTS[p][key];
      return limit === null || limit >= needed;
    }) ?? 'enterprise'
  );
}

export function planRank(plan: Plan): number {
  return PLANS.indexOf(plan);
}

export function isUpgrade(from: Plan, to: Plan): boolean {
  return planRank(to) > planRank(from);
}
