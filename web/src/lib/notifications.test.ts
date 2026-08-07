import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { DEFAULT_META, KNOWN_KINDS, badgeCount, groupNotifications, kindMeta, relativeTime, type NotificationLike } from './notifications';

const n = (id: string, kind: string, opts: { read?: boolean; ago?: number } = {}): NotificationLike => ({
  id,
  kind,
  readAt: opts.read ? new Date('2026-08-01') : null,
  createdAt: new Date(Date.now() - (opts.ago ?? 0) * 3600_000),
});

describe('kind classification', () => {
  it('puts things that need a decision in the action group', () => {
    for (const k of ['rfq.closing', 'quote.received', 'cert.expiring', 'regulatory.action', 'shipment.overdue']) {
      expect(kindMeta(k).group, k).toBe('action');
    }
  });

  it('keeps routine progress out of the action group', () => {
    for (const k of ['shipment.updated', 'shipment.delivered', 'quote.declined', 'review.received']) {
      expect(kindMeta(k).group, k).toBe('update');
    }
  });

  it('defaults an unknown kind to update — new events must earn urgency', () => {
    expect(kindMeta('something.new')).toEqual(DEFAULT_META);
    expect(kindMeta('something.new').group).toBe('update');
  });

  it('ranks a regulatory action above a closing RFQ', () => {
    expect(kindMeta('regulatory.action').weight).toBeGreaterThan(kindMeta('rfq.closing').weight);
  });

  it('classifies every kind the app actually emits', () => {
    // The fallback is deliberately silent, so drift would never surface at
    // runtime — a new notifyOrg() kind would just quietly land in "update".
    const src = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8');
    const emitted = [...src.matchAll(/notifyOrg\([^,]+,\s*'([^']+)'/g)].map((m) => m[1]);
    expect(emitted.length).toBeGreaterThan(0);
    expect([...new Set(emitted)].filter((k) => !KNOWN_KINDS.includes(k))).toEqual([]);
  });
});

describe('groupNotifications', () => {
  it('separates the three groups and counts unread per group', () => {
    const g = groupNotifications([
      n('1', 'rfq.closing'),
      n('2', 'shipment.updated'),
      n('3', 'content.published'),
      n('4', 'quote.received', { read: true }),
    ]);
    expect(g.action.map((x) => x.id)).toEqual(['1', '4']);
    expect(g.update.map((x) => x.id)).toEqual(['2']);
    expect(g.info.map((x) => x.id)).toEqual(['3']);
    expect(g.unread).toEqual({ action: 1, update: 1, info: 1, total: 3 });
  });

  it('always puts unread ahead of read, whatever the weight', () => {
    // A read high-weight item must not outrank an unread low-weight one.
    const g = groupNotifications([n('read-urgent', 'regulatory.action', { read: true }), n('unread-minor', 'sample.requested')]);
    expect(g.action[0].id).toBe('unread-minor');
  });

  it('orders unread items by urgency, not just recency', () => {
    const g = groupNotifications([
      n('old-urgent', 'regulatory.action', { ago: 48 }),
      n('new-minor', 'sample.requested', { ago: 1 }),
    ]);
    expect(g.action[0].id).toBe('old-urgent');
  });

  it('falls back to recency when urgency ties', () => {
    const g = groupNotifications([n('older', 'rfq.closing', { ago: 10 }), n('newer', 'rfq.closing', { ago: 1 })]);
    expect(g.action.map((x) => x.id)).toEqual(['newer', 'older']);
  });

  it('keeps read items rather than hiding them', () => {
    const g = groupNotifications([n('r', 'quote.received', { read: true })]);
    expect(g.action).toHaveLength(1);
    expect(g.unread.action).toBe(0);
  });

  it('handles an empty list without special-casing at the call site', () => {
    const g = groupNotifications([]);
    expect(g.action).toEqual([]);
    expect(g.unread.total).toBe(0);
  });
});

describe('badgeCount', () => {
  it('counts only what needs action, so the badge stays meaningful', () => {
    const g = groupNotifications([
      n('1', 'rfq.closing'),
      n('2', 'quote.received'),
      // 40 routine updates must not inflate the badge to 42.
      ...Array.from({ length: 40 }, (_, i) => n(`u${i}`, 'shipment.updated')),
    ]);
    expect(g.unread.total).toBe(42);
    expect(badgeCount(g)).toBe(2);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-08-07T12:00:00Z');
  it('reads naturally at every scale', () => {
    expect(relativeTime(new Date('2026-08-07T11:59:40Z'), now)).toBe('just now');
    expect(relativeTime(new Date('2026-08-07T11:30:00Z'), now)).toBe('30 minutes ago');
    expect(relativeTime(new Date('2026-08-07T08:00:00Z'), now)).toBe('4 hours ago');
    expect(relativeTime(new Date('2026-08-05T12:00:00Z'), now)).toBe('2 days ago');
    expect(relativeTime(new Date('2026-07-24T12:00:00Z'), now)).toBe('2 weeks ago');
    expect(relativeTime(new Date('2026-05-07T12:00:00Z'), now)).toBe('3 months ago');
  });
  it('singularises correctly', () => {
    expect(relativeTime(new Date('2026-08-07T11:00:00Z'), now)).toBe('1 hour ago');
    expect(relativeTime(new Date('2026-08-06T12:00:00Z'), now)).toBe('1 day ago');
  });
  it('never renders a negative age for a clock-skewed future timestamp', () => {
    expect(relativeTime(new Date('2026-08-07T12:05:00Z'), now)).toBe('just now');
  });
});
