import { describe, it, expect } from 'vitest';
import { EVENT_HALF_LIFE_MONTHS, concentrationOf, eventPressure, herfindahl, supplyRisk, type RiskEvent } from './supply-risk';

const asOf = new Date('2026-08-01T00:00:00Z');
const monthsAgo = (n: number) => new Date(asOf.getTime() - n * 30.44 * 24 * 60 * 60 * 1000);

describe('herfindahl', () => {
  it('is 10000 for a monopoly and 2500 for four equal suppliers', () => {
    expect(herfindahl([{ name: 'a', share: 1 }])).toBe(10000);
    expect(herfindahl([1, 1, 1, 1].map((share, i) => ({ name: `s${i}`, share })))).toBe(2500);
  });
  it('normalises absolute volumes, so kg and shares give the same answer', () => {
    expect(herfindahl([{ name: 'a', share: 750 }, { name: 'b', share: 250 }])).toBe(
      herfindahl([{ name: 'a', share: 0.75 }, { name: 'b', share: 0.25 }]),
    );
  });
  it('is 0 with no positive shares rather than NaN', () => {
    expect(herfindahl([])).toBe(0);
    expect(herfindahl([{ name: 'a', share: 0 }])).toBe(0);
  });
});

describe('concentrationOf', () => {
  it('calls one supplier single-source regardless of HHI arithmetic', () => {
    expect(concentrationOf(10000, 1)).toBe('single_source');
  });
  it('separates "none known" from "one known" — an absence is not a finding', () => {
    expect(concentrationOf(0, 0)).toBe('unknown');
  });
  it('uses the standard antitrust thresholds above that', () => {
    expect(concentrationOf(2600, 3)).toBe('concentrated');
    expect(concentrationOf(1500, 5)).toBe('moderate');
    expect(concentrationOf(1200, 9)).toBe('unconcentrated');
  });
});

describe('eventPressure', () => {
  const shortage: RiskEvent = { eventType: 'shortage', severity: 'medium', occurredAt: asOf };

  it('is 0 with no events', () => {
    expect(eventPressure([], asOf)).toBe(0);
  });
  it('scores a fresh event at its full weight', () => {
    expect(eventPressure([shortage], asOf)).toBe(30);
  });
  it('halves an event after one half-life', () => {
    expect(eventPressure([{ ...shortage, occurredAt: monthsAgo(EVENT_HALF_LIFE_MONTHS) }], asOf)).toBe(15);
  });
  it('scales by severity', () => {
    expect(eventPressure([{ ...shortage, severity: 'high' }], asOf)).toBe(45);
    expect(eventPressure([{ ...shortage, severity: 'low' }], asOf)).toBe(15);
  });
  it('ignores future-dated rows (data errors, not signals)', () => {
    expect(eventPressure([{ ...shortage, occurredAt: new Date('2027-01-01T00:00:00Z') }], asOf)).toBe(0);
  });
  it('caps at 100 however many events pile up', () => {
    expect(eventPressure(Array(20).fill({ ...shortage, severity: 'high' }), asOf)).toBe(100);
  });
});

describe('supplyRisk', () => {
  it('rates a broad, quiet, stable supply base low and says why', () => {
    const r = supplyRisk({
      suppliers: Array.from({ length: 10 }, (_, i) => ({ name: `s${i}`, share: 1 })),
      events: [],
      volatilityPct: 1,
      asOf,
    });
    expect(r.band).toBe('low');
    expect(r.concentration).toBe('unconcentrated');
    expect(r.reasons.join(' ')).toContain('No shortage, recall or regulatory action on record');
  });

  it('rates a single-sourced molecule in shortage high', () => {
    const r = supplyRisk({
      suppliers: [{ name: 'only', share: 1 }],
      events: [{ eventType: 'shortage', severity: 'high', occurredAt: asOf }],
      volatilityPct: 12,
      asOf,
    });
    expect(r.band).toBe('high');
    expect(r.supplierCount).toBe(1);
    expect(r.reasons[0]).toContain('Single known qualified supplier');
  });

  it('scores as the stated 40/40/20 blend of its three components', () => {
    const r = supplyRisk({
      suppliers: [{ name: 'only', share: 1 }],
      events: [],
      volatilityPct: 15, // -> volatility component 100
      asOf,
    });
    // concentration 100*0.4 + events 0*0.4 + volatility 100*0.2
    expect(r.score).toBe(60);
  });

  it('flags an unknown supply base instead of scoring it as safe', () => {
    const r = supplyRisk({ suppliers: [], events: [], volatilityPct: 0, asOf });
    expect(r.supplierCount).toBe(0);
    expect(r.concentration).toBe('unknown');
    expect(r.reasons[0]).toContain('No qualified supplier is known');
    expect(r.score).toBeGreaterThan(0);
  });

  it('keeps the score inside 0..100', () => {
    const r = supplyRisk({
      suppliers: [{ name: 'only', share: 1 }],
      events: Array(30).fill({ eventType: 'shortage', severity: 'high', occurredAt: asOf }),
      volatilityPct: 500,
      asOf,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
