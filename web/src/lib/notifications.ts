/**
 * Notification classification — pure, unit tested.
 *
 * The problem with the flat list this replaces: a notification that a shipment
 * was delivered and a notification that an RFQ closes in six hours look
 * identical and sort by time, so the urgent one scrolls away under the routine
 * ones. Volume makes the centre useless exactly when it matters most.
 *
 * So each kind is classified by what it asks of the reader:
 *
 *   action   — something will go wrong if you ignore this (a closing RFQ, an
 *              expiring certificate, a shortage on a molecule you buy)
 *   update   — progress you asked for (a quote arrived, a shipment moved)
 *   info     — worth knowing, no response needed
 *
 * Only `action` is allowed to be loud. Everything else stays quiet, because a
 * centre where everything is urgent is a centre where nothing is.
 */

export type NotificationGroup = 'action' | 'update' | 'info';

export interface NotificationKindMeta {
  group: NotificationGroup;
  /** Icon token the UI maps to a glyph. */
  icon: 'clock' | 'quote' | 'shield' | 'truck' | 'alert' | 'check' | 'bell';
  /** Sort weight within a group; higher first. Ties fall back to recency. */
  weight: number;
}

const KINDS: Record<string, NotificationKindMeta> = {
  // --- needs a decision or the outcome is worse -----------------------------
  'rfq.closing': { group: 'action', icon: 'clock', weight: 100 },
  'rfq.matched': { group: 'action', icon: 'quote', weight: 70 },
  'quote.received': { group: 'action', icon: 'quote', weight: 80 },
  'counter.received': { group: 'action', icon: 'quote', weight: 80 },
  // The seller won — but the award only becomes an order once they confirm it.
  'quote.awarded': { group: 'action', icon: 'check', weight: 92 },
  'sample.requested': { group: 'action', icon: 'bell', weight: 60 },
  'cert.expiring': { group: 'action', icon: 'shield', weight: 95 },
  'regulatory.action': { group: 'action', icon: 'alert', weight: 110 },
  'shortage.posted': { group: 'action', icon: 'alert', weight: 90 },
  'org.rejected': { group: 'action', icon: 'alert', weight: 85 },
  'shipment.overdue': { group: 'action', icon: 'truck', weight: 88 },

  // --- progress on something already in motion ------------------------------
  'quote.accepted': { group: 'update', icon: 'check', weight: 50 },
  'quote.declined': { group: 'update', icon: 'quote', weight: 30 },
  // Nothing left to do about it, so it stays quiet — but it must still be seen,
  // because a supplier who keeps quoting a cancelled RFQ is wasting their time.
  'rfq.cancelled': { group: 'update', icon: 'alert', weight: 48 },
  'shipment.updated': { group: 'update', icon: 'truck', weight: 40 },
  'shipment.delivered': { group: 'update', icon: 'truck', weight: 45 },
  'sample.shipped': { group: 'update', icon: 'truck', weight: 35 },
  'org.verified': { group: 'update', icon: 'check', weight: 55 },
  'review.received': { group: 'update', icon: 'bell', weight: 20 },

  // --- background ----------------------------------------------------------
  'content.published': { group: 'info', icon: 'bell', weight: 10 },
  'plan.changed': { group: 'info', icon: 'bell', weight: 15 },
};

/** Unknown kinds default to `update`, never `action` — new events must earn urgency. */
export const DEFAULT_META: NotificationKindMeta = { group: 'update', icon: 'bell', weight: 25 };

export function kindMeta(kind: string): NotificationKindMeta {
  return KINDS[kind] ?? DEFAULT_META;
}

/** Every kind with an explicit classification. A test asserts the app emits no other. */
export const KNOWN_KINDS = Object.keys(KINDS);

export interface NotificationLike {
  id: string;
  kind: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface GroupedNotifications<T extends NotificationLike> {
  action: T[];
  update: T[];
  info: T[];
  /** Unread counts per group — the action count is the one the bell shows. */
  unread: { action: number; update: number; info: number; total: number };
}

/**
 * Groups and orders notifications.
 *
 * Within a group: unread before read, then weight, then recency. Read items are
 * not hidden — a user looking for something they dismissed needs to find it —
 * but they never outrank an unread one.
 */
export function groupNotifications<T extends NotificationLike>(items: T[]): GroupedNotifications<T> {
  const out: GroupedNotifications<T> = {
    action: [],
    update: [],
    info: [],
    unread: { action: 0, update: 0, info: 0, total: 0 },
  };

  for (const n of items) {
    const meta = kindMeta(n.kind);
    out[meta.group].push(n);
    if (!n.readAt) {
      out.unread[meta.group]++;
      out.unread.total++;
    }
  }

  const sorter = (a: T, b: T) => {
    const aUnread = a.readAt ? 0 : 1;
    const bUnread = b.readAt ? 0 : 1;
    if (aUnread !== bUnread) return bUnread - aUnread;
    const w = kindMeta(b.kind).weight - kindMeta(a.kind).weight;
    if (w !== 0) return w;
    return b.createdAt.getTime() - a.createdAt.getTime();
  };

  out.action.sort(sorter);
  out.update.sort(sorter);
  out.info.sort(sorter);
  return out;
}

/**
 * The number the bell shows.
 *
 * Deliberately the count of items NEEDING ACTION, not total unread. A badge
 * showing 47 because of routine shipment updates trains the user to ignore it;
 * a badge showing 2 because two things need a decision keeps it meaningful.
 */
export function badgeCount(grouped: GroupedNotifications<NotificationLike>): number {
  return grouped.unread.action;
}

/** Human relative time — "4 hours ago" reads faster than a timestamp in a list. */
export function relativeTime(then: Date, now: Date = new Date()): string {
  const secs = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30.44);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}
