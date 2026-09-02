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
  // Partner.status (EPIC N7) — a business-tier signal, distinct from
  // Organization.status above.
  active: 'badge-verified',
  suspended: 'badge-rejected',
  // PartnerPayout.status (EPIC N7)
  accrued: 'badge-pending',
  confirmed: 'badge-info',
  paid: 'badge-verified',
  void: 'badge-neutral',
};

/** Renders a translated status pill. Unknown statuses degrade to neutral. */
export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('status');
  const cls = CLS[status] ?? 'badge-neutral';
  const known = ['draft','pending','verified','rejected','open','quoted','accepted','awarded','cancelled','declined','expired','closed','live','submitted','active','suspended','accrued','confirmed','paid','void'];
  return <span className={cls} data-testid={`status-${status}`}>{known.includes(status) ? t(status) : status}</span>;
}
