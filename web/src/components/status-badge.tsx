import { useTranslations } from 'next-intl';

const CLS: Record<string, string> = {
  verified: 'badge-verified',
  accepted: 'badge-verified',
  awarded: 'badge-verified',
  live: 'badge-verified',
  pending: 'badge-pending',
  open: 'badge-pending',
  draft: 'badge-neutral',
  quoted: 'badge-info',
  submitted: 'badge-info',
  rejected: 'badge-rejected',
  cancelled: 'badge-rejected',
  declined: 'badge-rejected',
  expired: 'badge-neutral',
  closed: 'badge-neutral',
};

/** Renders a translated status pill. Unknown statuses degrade to neutral. */
export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('status');
  const cls = CLS[status] ?? 'badge-neutral';
  const known = ['draft','pending','verified','rejected','open','quoted','accepted','awarded','cancelled','declined','expired','closed','live','submitted'];
  return <span className={cls} data-testid={`status-${status}`}>{known.includes(status) ? t(status) : status}</span>;
}
