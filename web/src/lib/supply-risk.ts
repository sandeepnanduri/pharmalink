/**
 * Supply risk — pure, unit-tested.
 *
 * Price forecasts built only on past prices miss the thing that actually moves
 * an API price: the supply base. Two plants making a molecule and one of them
 * on an FDA import alert is a price event that no time series has seen yet.
 *
 * Every input here is a countable public fact (number of qualified suppliers,
 * registered shortages, recalls), and every output carries the reasons that
 * produced it. Nothing is scored by a model whose inputs cannot be listed.
 */

/** A qualified supplier of a molecule, with whatever volume signal is known. */
export interface SupplierShare {
  name: string;
  /** Relative share 0..1, or an absolute volume — both work, it is normalised. */
  share: number;
}

export type EventType = 'shortage' | 'discontinuation' | 'recall' | 'import_alert' | 'warning_letter';
export type Severity = 'low' | 'medium' | 'high';

export interface RiskEvent {
  eventType: EventType;
  severity: Severity;
  occurredAt: Date;
}

/**
 * Herfindahl–Hirschman Index on 0..10000. The US DOJ/FTC thresholds are the
 * reference points used below: <1500 unconcentrated, 1500–2500 moderate,
 * >2500 highly concentrated.
 */
export function herfindahl(suppliers: SupplierShare[]): number {
  const positive = suppliers.filter((s) => s.share > 0);
  const total = positive.reduce((a, s) => a + s.share, 0);
  if (total <= 0) return 0;
  const hhi = positive.reduce((a, s) => a + Math.pow((s.share / total) * 100, 2), 0);
  return Math.round(hhi);
}

export type Concentration = 'unknown' | 'unconcentrated' | 'moderate' | 'concentrated' | 'single_source';

/**
 * `unknown` and `single_source` are deliberately separate. "We know of one
 * supplier" and "we know of none" are different claims: the first is a measured
 * concentration, the second is a hole in our data. Collapsing them would print
 * "Single source" next to "Known qualified suppliers: 0", which reads as a
 * finding when it is an absence of one.
 */
export function concentrationOf(hhi: number, supplierCount: number): Concentration {
  if (supplierCount === 0) return 'unknown';
  if (supplierCount === 1) return 'single_source';
  if (hhi > 2500) return 'concentrated';
  if (hhi >= 1500) return 'moderate';
  return 'unconcentrated';
}

/** How much each event type contributes at full strength (0..100 scale). */
const EVENT_WEIGHT: Record<EventType, number> = {
  shortage: 30,
  discontinuation: 25,
  import_alert: 25,
  recall: 15,
  warning_letter: 10,
};

const SEVERITY_MULTIPLIER: Record<Severity, number> = { low: 0.5, medium: 1, high: 1.5 };

/** Months after which an event counts half as much. Supply shocks fade. */
export const EVENT_HALF_LIFE_MONTHS = 9;

/**
 * Time-decayed pressure from supply events, capped at 100. Exponential decay
 * on a 9-month half-life: a recall from three years ago is history, not risk.
 */
export function eventPressure(events: RiskEvent[], asOf: Date): number {
  let score = 0;
  for (const e of events) {
    const months = (asOf.getTime() - e.occurredAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (months < 0) continue; // future-dated rows are data errors, not signals
    const decay = Math.pow(0.5, months / EVENT_HALF_LIFE_MONTHS);
    score += EVENT_WEIGHT[e.eventType] * SEVERITY_MULTIPLIER[e.severity] * decay;
  }
  return Math.round(Math.min(100, score));
}

export type RiskBand = 'low' | 'moderate' | 'elevated' | 'high';

export interface SupplyRisk {
  /** 0..100. Higher = more likely to see a supply-driven price move. */
  score: number;
  band: RiskBand;
  hhi: number;
  concentration: Concentration;
  supplierCount: number;
  eventPressure: number;
  volatilityPct: number;
  /** Plain-language reasons, each traceable to one input above. */
  reasons: string[];
}

export interface RiskInputs {
  suppliers: SupplierShare[];
  events: RiskEvent[];
  /** Median month-on-month price move, %, from the forecast module. */
  volatilityPct: number;
  asOf: Date;
}

/**
 * Combines concentration, live event pressure and realised price volatility
 * into one 0–100 index.
 *
 * The weights (40/40/20) are a stated editorial judgement, not a fitted model —
 * there is no labelled "supply crisis" dataset to fit against, and inventing a
 * regression here would be false precision. They are exported so the number can
 * be reproduced by hand from the three components.
 */
export const RISK_WEIGHTS = { concentration: 0.4, events: 0.4, volatility: 0.2 } as const;

export function supplyRisk(input: RiskInputs): SupplyRisk {
  const supplierCount = input.suppliers.filter((s) => s.share > 0).length;
  const hhi = herfindahl(input.suppliers);
  const concentration = concentrationOf(hhi, supplierCount);
  const pressure = eventPressure(input.events, input.asOf);

  // HHI 0–10000 → 0–100, with a floor for genuinely single-sourced molecules.
  const concentrationScore = supplierCount === 0 ? 50 : supplierCount === 1 ? 100 : Math.min(100, hhi / 100);
  // 15%+ median monthly moves is a thoroughly unstable price.
  const volatilityScore = Math.min(100, (input.volatilityPct / 15) * 100);

  const score = Math.round(
    concentrationScore * RISK_WEIGHTS.concentration + pressure * RISK_WEIGHTS.events + volatilityScore * RISK_WEIGHTS.volatility,
  );

  const band: RiskBand = score >= 70 ? 'high' : score >= 50 ? 'elevated' : score >= 30 ? 'moderate' : 'low';

  const reasons: string[] = [];
  if (supplierCount === 0) reasons.push('No qualified supplier is known for this molecule yet.');
  else if (supplierCount === 1) reasons.push('Single known qualified supplier — no second source to switch to.');
  else if (concentration === 'concentrated') reasons.push(`${supplierCount} suppliers, but volume is concentrated (HHI ${hhi}).`);
  else reasons.push(`${supplierCount} qualified suppliers, HHI ${hhi} (${concentration.replace('_', ' ')}).`);

  const recent = input.events.filter((e) => e.occurredAt <= input.asOf);
  if (recent.length === 0) reasons.push('No shortage, recall or regulatory action on record.');
  else reasons.push(`${recent.length} supply event${recent.length === 1 ? '' : 's'} on record; decayed pressure ${pressure}/100.`);

  if (input.volatilityPct > 0) reasons.push(`Median month-on-month price move of ${input.volatilityPct}%.`);

  return {
    score,
    band,
    hhi,
    concentration,
    supplierCount,
    eventPressure: pressure,
    volatilityPct: input.volatilityPct,
    reasons,
  };
}
