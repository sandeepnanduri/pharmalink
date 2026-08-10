import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { markNotificationsReadAction } from '@/lib/actions';
import { groupNotifications, kindMeta, relativeTime, type NotificationGroup } from '@/lib/notifications';
import { ActionForm } from '@/components/action-form';

// Per-user data — never served from the static/full route cache.
export const dynamic = 'force-dynamic';

const ICON: Record<string, React.ReactNode> = {
  clock: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  quote: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6ZM9 12l2 2 4-4" />,
  truck: <path d="M3 16V6h11v10M14 9h4l3 3v4h-7M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
  alert: <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  check: <path d="m20 6-11 11-5-5" />,
  bell: <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M10.5 21a2 2 0 0 0 3 0" />,
};

/**
 * Icon tone follows the event's sentiment, not its group. An awarded quote and a
 * regulatory action both need attention, but painting the good news red would be
 * a lie — and it would spend the reserved status colours on volume.
 */
const TONE: Record<string, string> = {
  alert: 'bg-danger-pale text-danger',
  clock: 'bg-warn-pale text-warn',
  shield: 'bg-warn-pale text-warn',
  check: 'bg-ok-pale text-ok',
  quote: 'bg-brand-pale text-brand',
  truck: 'bg-cyan-pale text-cyan-deep',
  bell: 'bg-mist text-slate2',
};

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const t = await getTranslations('notifications');

  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  const grouped = groupNotifications(items);
  const now = new Date();

  const sections: { key: NotificationGroup; title: string; blurb: string }[] = [
    { key: 'action', title: t('groupAction'), blurb: t('groupActionBlurb') },
    { key: 'update', title: t('groupUpdate'), blurb: t('groupUpdateBlurb') },
    { key: 'info', title: t('groupInfo'), blurb: t('groupInfoBlurb') },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate2">
            {grouped.unread.action > 0 ? t('needsYou', { count: grouped.unread.action }) : t('nothingUrgent')}
          </p>
        </div>
        {grouped.unread.total > 0 && (
          <ActionForm action={markNotificationsReadAction}>
            <button type="submit" className="btn-ghost" data-testid="mark-all-read">
              {t('markAllRead')}
            </button>
          </ActionForm>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card py-16 text-center" data-testid="no-notifications">
          <p className="font-display text-base font-bold">{t('emptyTitle')}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate2">{t('empty')}</p>
          <Link href="/catalog" className="btn-primary mt-4 inline-flex">
            {t('emptyCta')}
          </Link>
        </div>
      ) : (
        <div className="space-y-8" data-testid="notification-list">
          {sections.map((s) => {
            const list = grouped[s.key];
            if (list.length === 0) return null;
            return (
              <section key={s.key} data-testid={`group-${s.key}`}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="font-display text-sm font-bold">{s.title}</h2>
                  {grouped.unread[s.key] > 0 && (
                    <span
                      className={`rounded-pill px-2 py-0.5 font-mono text-[11px] font-bold ${
                        s.key === 'action' ? 'bg-warn-pale text-warn' : 'bg-brand-pale text-brand'
                      }`}
                    >
                      {grouped.unread[s.key]}
                    </span>
                  )}
                  <p className="ml-auto text-[11px] text-muted">{s.blurb}</p>
                </div>

                <ul className="overflow-hidden rounded-card border border-line bg-white">
                  {list.map((n, i) => {
                    const meta = kindMeta(n.kind);
                    const tone = TONE[meta.icon] ?? TONE.bell;
                    const body = (
                      <div className={`flex items-start gap-3 px-4 py-3.5 ${i ? 'border-t border-line' : ''} ${n.readAt ? '' : 'bg-brand-pale/25'}`}>
                        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-control ${tone}`} aria-hidden="true">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            {ICON[meta.icon] ?? ICON.bell}
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm leading-snug ${n.readAt ? 'font-medium' : 'font-semibold'}`}>{n.title}</p>
                          {n.body && <p className="mt-0.5 text-xs leading-relaxed text-slate2">{n.body}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <time className="block text-[11px] text-muted" dateTime={n.createdAt.toISOString()}>
                            {relativeTime(n.createdAt, now)}
                          </time>
                          {!n.readAt && <span className="mt-1 ml-auto block h-1.5 w-1.5 rounded-full bg-brand" aria-label={t('unread')} />}
                        </div>
                      </div>
                    );
                    return (
                      <li key={n.id} data-testid="notification" data-group={meta.group} data-read={Boolean(n.readAt)}>
                        {n.link ? (
                          <Link href={n.link} className="block transition hover:bg-mist">
                            {body}
                          </Link>
                        ) : (
                          body
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
