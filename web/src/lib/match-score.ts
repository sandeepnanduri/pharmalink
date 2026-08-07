/**
 * Supplier match score — pure, deterministic, unit-tested.
 *
 * This replaces the "🤖 96/100 AI Match" in the design documents. The number is
 * the same shape; what changed is that it is now REPRODUCIBLE. Every point is
 * attributable to a named component with a stated weight, and the UI shows the
 * breakdown next to the total.
 *
 * Why the change matters commercially, not just ethically: a procurement head
 * cannot put "the AI said 96" in a sourcing justification. They can put "matches
 * 4 of 5 required certificates, 9.5% below market median, 97% on-time over 142
 * orders". The second is auditable; the first is not.
 *
 * Rules this enforces in code:
 *  - A supplier missing a MANDATORY certificate scores 0 and is excluded. There
 *    is no "high score despite failing a hard requirement".
 *  - Components with no data contribute nothing and are reported as unknown,
 *    rather than silently scoring 0 or being imputed to the average.
 *  - Weights are constants, exported, and sum to 100.
 */

export interface MatchInput {
  /** Certificates the buyer mandated. All must be held or the score is 0. */
  requiredCerts: string[];
  /** Certificates the supplier actually holds (verified, unexpired). */
  heldCerts: string[];
  /** Certificates the buyer would like but did not mandate. */
  preferredCerts?: string[];

  /** This supplier's unit price, and the market median for the molecule. */
  price?: number | null;
  marketMedian?: number | null;

  /** Buyer's required-by horizon and the supplier's quoted lead time, in days. */
  leadTimeDays?: number | null;
  requiredWithinDays?: number | null;

  /** Share of RFQs answered inside the SLA, 0..1. */
  responseRate?: number | null;
  /** Share of orders delivered on time, 0..1. */
  onTimeRate?: number | null;
  /** Completed orders on the platform — drives how much the record is trusted. */
  completedOrders?: number | null;
}

/** Weights sum to 100. Changing one means changing the docs and the UI legend. */
export const MATCH_WEIGHTS = {
  certifications: 35,
  price: 25,
  leadTime: 15,
  reliability: 15,
  responsiveness: 10,
} as const;

export type ComponentKey = keyof typeof MATCH_WEIGHTS;

export interface MatchComponent {
  key: ComponentKey;
  label: string;
  /** Points awarded out of `max`. null when there is no data to judge on. */
  points: number | null;
  max: number;
  /** One line the UI shows verbatim — the justification, not a restatement. */
  detail: string;
}

export interface MatchResult {
  /** 0..100, or null when too little is known to score at all. */
  score: number | null;
  /** Set when a mandatory requirement failed — the supplier is not eligible. */
  disqualified: boolean;
  disqualifiedReason?: string;
  components: MatchComponent[];
  /** Components that had no data, so the reader knows what the score omits. */
  unknown: ComponentKey[];
  /** Share of the possible points that were actually assessable, 0..1. */
  coverage: number;
}

const norm = (s: string) => s.trim().toLowerCase();

function certComponent(input: MatchInput): MatchComponent & { fatal?: string } {
  const held = new Set(input.heldCerts.map(norm));
  const required = input.requiredCerts.map(norm);
  const missing = required.filter((c) => !held.has(c));
  const max = MATCH_WEIGHTS.certifications;

  if (missing.length > 0) {
    return {
      key: 'certifications',
      label: 'Certifications',
      points: 0,
      max,
      detail: `Missing ${missing.length} mandatory certificate${missing.length === 1 ? '' : 's'}`,
      fatal: `Does not hold ${missing.length} mandatory certificate${missing.length === 1 ? '' : 's'}`,
    };
  }

  // All mandatory certificates held. Preferred ones earn the remaining margin.
  const preferred = (input.preferredCerts ?? []).map(norm);
  const preferredHeld = preferred.filter((c) => held.has(c)).length;
  const base = required.length > 0 ? max * 0.8 : max * 0.6;
  const bonus = preferred.length > 0 ? (preferredHeld / preferred.length) * (max - base) : max - base;

  return {
    key: 'certifications',
    label: 'Certifications',
    points: Math.round(base + bonus),
    max,
    detail:
      required.length > 0
        ? `Holds all ${required.length} mandatory` + (preferred.length ? `, ${preferredHeld} of ${preferred.length} preferred` : '')
        : 'No certificates were mandated',
  };
}

function priceComponent(input: MatchInput): MatchComponent {
  const max = MATCH_WEIGHTS.price;
  const { price, marketMedian } = input;
  if (!(price && price > 0) || !(marketMedian && marketMedian > 0)) {
    return { key: 'price', label: 'Price vs market', points: null, max, detail: 'No market median for this molecule yet' };
  }
  const delta = (price - marketMedian) / marketMedian;
  // Full marks at 15% below median, zero at 15% above; linear between.
  const ratio = Math.max(0, Math.min(1, (0.15 - delta) / 0.30));
  const pct = Math.round(Math.abs(delta) * 1000) / 10;
  return {
    key: 'price',
    label: 'Price vs market',
    points: Math.round(ratio * max),
    max,
    detail: delta <= 0 ? `${pct}% below market median` : `${pct}% above market median`,
  };
}

function leadComponent(input: MatchInput): MatchComponent {
  const max = MATCH_WEIGHTS.leadTime;
  const { leadTimeDays, requiredWithinDays } = input;
  if (!(leadTimeDays && leadTimeDays > 0)) {
    return { key: 'leadTime', label: 'Lead time', points: null, max, detail: 'Lead time not quoted' };
  }
  if (requiredWithinDays == null) {
    return { key: 'leadTime', label: 'Lead time', points: null, max, detail: 'No required-by date on the request' };
  }
  // Zero or negative means the deadline has already passed — a different fact
  // from "there is no deadline", and saying the wrong one misleads the buyer.
  if (requiredWithinDays <= 0) {
    return { key: 'leadTime', label: 'Lead time', points: 0, max, detail: `${leadTimeDays} days — the required-by date has already passed` };
  }
  if (leadTimeDays > requiredWithinDays) {
    return { key: 'leadTime', label: 'Lead time', points: 0, max, detail: `${leadTimeDays} days — misses the required-by date` };
  }
  // Full marks with 50%+ of the window to spare.
  const slack = (requiredWithinDays - leadTimeDays) / requiredWithinDays;
  return {
    key: 'leadTime',
    label: 'Lead time',
    points: Math.round(Math.min(1, slack / 0.5) * max),
    max,
    detail: `${leadTimeDays} days, inside the ${requiredWithinDays}-day window`,
  };
}

function reliabilityComponent(input: MatchInput): MatchComponent {
  const max = MATCH_WEIGHTS.reliability;
  const { onTimeRate, completedOrders } = input;
  if (onTimeRate == null || !(completedOrders && completedOrders >= 3)) {
    return {
      key: 'reliability',
      label: 'Delivery record',
      points: null,
      max,
      detail: completedOrders ? `Only ${completedOrders} completed orders — too few to judge` : 'No completed orders yet',
    };
  }
  // 90% on-time is the floor for any credit; 100% earns full marks.
  const ratio = Math.max(0, Math.min(1, (onTimeRate - 0.9) / 0.1));
  return {
    key: 'reliability',
    label: 'Delivery record',
    points: Math.round(ratio * max),
    max,
    detail: `${Math.round(onTimeRate * 100)}% on time across ${completedOrders} orders`,
  };
}

function responseComponent(input: MatchInput): MatchComponent {
  const max = MATCH_WEIGHTS.responsiveness;
  const { responseRate } = input;
  if (responseRate == null) {
    return { key: 'responsiveness', label: 'Responsiveness', points: null, max, detail: 'No response history yet' };
  }
  const ratio = Math.max(0, Math.min(1, (responseRate - 0.5) / 0.5));
  return {
    key: 'responsiveness',
    label: 'Responsiveness',
    points: Math.round(ratio * max),
    max,
    detail: `${Math.round(responseRate * 100)}% of requests answered within SLA`,
  };
}

/**
 * Scores a supplier against one buyer's requirement.
 *
 * The score is rescaled over the components that COULD be assessed, so a new
 * supplier with no delivery history is not punished for the absence — but
 * `coverage` reports how much of the score was guesswork-free, and the UI must
 * show it. A 92 at 55% coverage is a different claim from a 92 at 100%.
 */
export function matchScore(input: MatchInput): MatchResult {
  const cert = certComponent(input);
  const components: MatchComponent[] = [
    { key: cert.key, label: cert.label, points: cert.points, max: cert.max, detail: cert.detail },
    priceComponent(input),
    leadComponent(input),
    reliabilityComponent(input),
    responseComponent(input),
  ];

  if (cert.fatal) {
    return { score: null, disqualified: true, disqualifiedReason: cert.fatal, components, unknown: [], coverage: 0 };
  }

  const scored = components.filter((c) => c.points != null);
  const unknown = components.filter((c) => c.points == null).map((c) => c.key);
  const availableMax = scored.reduce((a, c) => a + c.max, 0);
  const earned = scored.reduce((a, c) => a + (c.points ?? 0), 0);
  const totalMax = components.reduce((a, c) => a + c.max, 0);

  return {
    score: availableMax > 0 ? Math.round((earned / availableMax) * 100) : null,
    disqualified: false,
    components,
    unknown,
    coverage: Math.round((availableMax / totalMax) * 100) / 100,
  };
}

export type MatchBand = 'excellent' | 'good' | 'fair' | 'weak';

export function matchBand(score: number): MatchBand {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  return 'weak';
}
