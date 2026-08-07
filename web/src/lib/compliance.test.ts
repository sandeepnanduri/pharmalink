import { describe, it, expect } from 'vitest';
import { daysUntil, certExpiryLevel, needsAttention, summarize } from './compliance';

const NOW = new Date('2026-07-20T00:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe('certExpiryLevel', () => {
  it('buckets by the 7/30/60-day windows', () => {
    expect(certExpiryLevel(inDays(-1), NOW)).toBe('expired');
    expect(certExpiryLevel(inDays(5), NOW)).toBe('critical');
    expect(certExpiryLevel(inDays(20), NOW)).toBe('warning');
    expect(certExpiryLevel(inDays(50), NOW)).toBe('soon');
    expect(certExpiryLevel(inDays(200), NOW)).toBe('ok');
  });
  it('is "unknown" (never silently ok) when there is no expiry date', () => {
    expect(certExpiryLevel(null, NOW)).toBe('unknown');
  });
});

describe('needsAttention', () => {
  it('flags everything in or past the 60-day window', () => {
    for (const l of ['expired', 'critical', 'warning', 'soon'] as const) expect(needsAttention(l)).toBe(true);
    expect(needsAttention('ok')).toBe(false);
    expect(needsAttention('unknown')).toBe(false);
  });
});

describe('summarize', () => {
  it('tallies expired / expiring / ok / unknown', () => {
    const s = summarize(
      [{ expiresAt: inDays(-5) }, { expiresAt: inDays(10) }, { expiresAt: inDays(45) }, { expiresAt: inDays(400) }, { expiresAt: null }],
      NOW,
    );
    expect(s).toEqual({ total: 5, expired: 1, expiring: 2, ok: 1, unknown: 1 });
  });
});

describe('daysUntil', () => {
  it('is negative in the past, positive in the future', () => {
    expect(daysUntil(inDays(3), NOW)).toBe(3);
    expect(daysUntil(inDays(-2), NOW)).toBe(-2);
  });
});
