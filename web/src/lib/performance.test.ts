import { describe, it, expect } from 'vitest';
import { MIN_SAMPLE, performanceReport, summariseRegulatory, type PerformanceInput, type RegulatoryActionInput } from './performance';
import { domainFrom, monogram, monogramHue, resolveLogo } from './logo';

const strong: PerformanceInput = {
  ordersCompleted: 142,
  ordersOnTime: 141,
  inquiriesReceived: 210,
  inquiriesAnswered: 204,
  answeredWithinSla: 198,
  quotesSubmitted: 96,
  quotesWon: 33,
  disputes: 1,
  distinctBuyers: 40,
  repeatBuyers: 29,
  totalValue: 3_520_000,
  joinedAt: new Date('2023-08-01T00:00:00Z'),
};

const metric = (r: ReturnType<typeof performanceReport>, k: string) => r.metrics.find((m) => m.key === k)!;

describe('performance metrics', () => {
  it('reports rates with their denominator, never a bare percentage', () => {
    const r = performanceReport(strong, new Date('2026-08-07T00:00:00Z'));
    const onTime = metric(r, 'onTime');
    expect(onTime.value).toBe('99%');
    expect(onTime.basis).toBe('141 of 142 completed orders');
  });

  it('refuses to rate on too small a sample', () => {
    const r = performanceReport({ ...strong, ordersCompleted: 1, ordersOnTime: 1 });
    const onTime = metric(r, 'onTime');
    expect(onTime.status).toBe('insufficient');
    expect(onTime.value).toBeNull();
    expect(onTime.basis).toContain('too few to rate');
  });

  it(`treats ${MIN_SAMPLE} as the floor, not a suggestion`, () => {
    const below = performanceReport({ ...strong, ordersCompleted: MIN_SAMPLE - 1, ordersOnTime: MIN_SAMPLE - 1 });
    const at = performanceReport({ ...strong, ordersCompleted: MIN_SAMPLE, ordersOnTime: MIN_SAMPLE });
    expect(metric(below, 'onTime').status).toBe('insufficient');
    expect(metric(at, 'onTime').status).toBe('ok');
  });

  it('distinguishes "no data" from "not enough data"', () => {
    const none = performanceReport({ ...strong, ordersCompleted: 0, ordersOnTime: 0 });
    expect(metric(none, 'onTime').status).toBe('none');
    expect(metric(none, 'onTime').basis).toContain('No completed orders yet');
  });

  it('marks dispute rate as lower-is-better so the colour is not inverted', () => {
    expect(metric(performanceReport(strong), 'dispute').higherIsBetter).toBe(false);
    expect(metric(performanceReport(strong), 'onTime').higherIsBetter).toBe(true);
  });

  it('counts are shown at any size — they are honest without a floor', () => {
    const r = performanceReport({ ...strong, ordersCompleted: 2, ordersOnTime: 2 });
    expect(metric(r, 'orders').value).toBe('2');
    expect(metric(r, 'orders').status).toBe('ok');
  });

  it('computes average order value only when there are orders', () => {
    expect(metric(performanceReport(strong), 'aov').value).toBe('$24,789');
    expect(metric(performanceReport({ ...strong, ordersCompleted: 0 }), 'aov').value).toBeNull();
  });

  it('reports how many metrics were actually assessable', () => {
    const r = performanceReport(strong);
    expect(r.assessable).toBeGreaterThan(0);
    expect(r.assessable).toBeLessThanOrEqual(r.total);
  });
});

describe('regulatory summary', () => {
  const on = (kind: RegulatoryActionInput['kind'], status: string, iso: string): RegulatoryActionInput => ({
    kind,
    status,
    issuedAt: new Date(iso),
  });
  const now = new Date('2026-08-07T00:00:00Z');

  it('is clear when there is nothing on record', () => {
    const s = summariseRegulatory([], now);
    expect(s.severity).toBe('clear');
    expect(s.headline).toBe('No regulatory action on record');
  });

  it('an open import alert outranks everything else', () => {
    const s = summariseRegulatory([on('import_alert', 'open', '2026-01-10'), on('form_483', 'closed', '2020-01-01')], now);
    expect(s.severity).toBe('blocking');
    expect(s.headline).toContain('cannot be imported into the US');
  });

  it('an open EU non-compliance also blocks, with the right market named', () => {
    const s = summariseRegulatory([on('eu_noncompliance', 'open', '2026-03-01')], now);
    expect(s.severity).toBe('blocking');
    expect(s.headline).toContain('EU');
  });

  it('open but non-blocking actions ask for review rather than blocking', () => {
    const s = summariseRegulatory([on('form_483', 'open', '2026-05-01')], now);
    expect(s.severity).toBe('attention');
    expect(s.openCount).toBe(1);
  });

  it('closed history is context, not a permanent red mark', () => {
    const s = summariseRegulatory([on('warning_letter', 'closed', '2022-04-01')], now);
    expect(s.severity).toBe('historic');
    expect(s.headline).toContain('No open actions');
    expect(s.headline).toContain('4 years ago');
  });

  it('counts open and historic separately', () => {
    const s = summariseRegulatory([on('form_483', 'open', '2026-05-01'), on('form_483', 'closed', '2021-01-01')], now);
    expect(s.openCount).toBe(1);
    expect(s.historicCount).toBe(1);
  });
});

describe('logo resolution', () => {
  it('extracts a domain from whatever the supplier typed', () => {
    expect(domainFrom('sunpharma.com')).toBe('sunpharma.com');
    expect(domainFrom('https://www.sunpharma.com/about?x=1')).toBe('sunpharma.com');
    expect(domainFrom('  WWW.Cipla.COM ')).toBe('cipla.com');
  });

  it('rejects nonsense rather than building a URL that 404s', () => {
    expect(domainFrom('not a domain')).toBeNull();
    expect(domainFrom('localhost')).toBeNull();
    expect(domainFrom('')).toBeNull();
    expect(domainFrom(null)).toBeNull();
  });

  it('drops legal-form noise from the monogram', () => {
    expect(monogram('Sun Pharmaceutical Industries Ltd')).toBe('SP');
    expect(monogram('Cipla Limited')).toBe('CI');
    expect(monogram('Zhejiang Huahai Pharmaceutical Co')).toBe('ZH');
  });

  it('is deterministic — the same company always gets the same mark', () => {
    expect(monogramHue('Cipla Ltd')).toBe(monogramHue('Cipla Ltd'));
    expect(monogramHue('Cipla Ltd')).not.toBe(monogramHue('Sun Pharma'));
  });

  it('prefers an operator-set logo over the aggregator', () => {
    const r = resolveLogo({ name: 'Cipla', website: 'cipla.com', logoUrl: 'https://cdn.example/x.png' });
    expect(r.src).toBe('https://cdn.example/x.png');
  });

  it('points only at the licensed aggregator, never the company site', () => {
    const r = resolveLogo({ name: 'Cipla', website: 'https://www.cipla.com' });
    expect(r.src).toContain('img.logo.dev/cipla.com');
    expect(r.src).not.toContain('www.cipla.com/');
  });

  it('falls back to a monogram when there is no usable domain', () => {
    const r = resolveLogo({ name: 'Mangalam Drugs & Organics', website: null });
    expect(r.kind).toBe('monogram');
    expect(r.initials).toBe('MD');
  });

  it('caps the requested size — an unbounded value is a cost bug', () => {
    expect(resolveLogo({ name: 'X', website: 'x.com' }, { size: 99999 }).src).toContain('size=512');
    expect(resolveLogo({ name: 'X', website: 'x.com' }, { size: 1 }).src).toContain('size=32');
  });
});
