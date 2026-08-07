import { prisma } from '@/lib/db';
import { Link } from '@/i18n/routing';
import { currentUser } from '@/lib/session';
import { badgeCount, groupNotifications } from '@/lib/notifications';

/**
 * Unread badge in the header (F5.1).
 *
 * The number is the count of notifications NEEDING A DECISION, not total unread.
 * A red 47 driven by routine shipment updates teaches the user that the badge
 * means nothing; a red 2 driven by two closing RFQs keeps it worth looking at.
 * Routine unreads still get a quiet dot — present, but not alarming.
 */
export async function NotificationBell() {
  const user = await currentUser();
  if (!user) return null;

  // Only unread rows are needed to size the badge, and there are never many.
  const unread = await prisma.notification.findMany({
    where: { userId: user.id, readAt: null },
    select: { id: true, kind: true, readAt: true, createdAt: true },
    take: 200,
  });

  const grouped = groupNotifications(unread);
  const needsAction = badgeCount(grouped);
  const routine = grouped.unread.total - needsAction;

  const label =
    needsAction > 0
      ? `Notifications, ${needsAction} needing attention`
      : routine > 0
        ? `Notifications, ${routine} unread`
        : 'Notifications';

  return (
    <Link
      href="/notifications"
      aria-label={label}
      data-testid="notification-bell"
      className="relative rounded-control px-2 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M10.5 21a2 2 0 0 0 3 0" />
      </svg>
      {needsAction > 0 ? (
        <span
          data-testid="unread-count"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold text-white"
        >
          {needsAction > 9 ? '9+' : needsAction}
        </span>
      ) : (
        routine > 0 && (
          <span
            data-testid="unread-dot"
            className="absolute right-1 top-1 block h-1.5 w-1.5 rounded-full bg-white/80 ring-2 ring-ink"
          />
        )
      )}
    </Link>
  );
}
