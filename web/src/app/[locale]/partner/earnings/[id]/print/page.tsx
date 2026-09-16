import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/session';
import { getPartnerPayoutInvoice } from '@/lib/partner-queries';
import { PrintButton } from '@/components/print-button';

// Per-user document — never cached.
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  model_a_margin: 'kindModelA',
};

/**
 * Printable payout invoice — same browser-print pattern as the buyer RFQ
 * print page (see PrintButton), applied to a single PartnerPayout.
 *
 * This documents money PharmaLink pays the PARTNER (a subscription-revenue
 * share), never a cut of trade value — the A1 boundary is restated in the
 * footer, same wording as the Earnings page, so the printed document alone
 * (detached from the dashboard) still carries it.
 */
export default async function PartnerPayoutInvoicePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['partner']);
  const t = await getTranslations('partnerEarnings');
  const tp = await getTranslations('print');
  const format = await getFormatter();

  const result = user.orgId ? await getPartnerPayoutInvoice(user.orgId, id) : null;
  if (!result) notFound();
  const { partner, payout, sourceOrgName } = result;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 print:px-0 print:py-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted">{tp('hint')}</p>
        <PrintButton label={tp('download')} />
      </div>

      <header className="mb-6 border-b border-line pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-lg font-extrabold">PharmaLink Global</p>
            <p className="text-xs text-muted">{t('invoiceTitle')}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p className="font-mono font-bold text-ink" data-testid="print-payout-number">
              {payout.number}
            </p>
            <p>{format.dateTime(payout.createdAt, { dateStyle: 'long' })}</p>
          </div>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase text-muted">{t('issuer')}</p>
          <p className="font-bold">PharmaLink Global</p>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase text-muted">{t('payee')}</p>
          <p className="font-bold">{partner.org.name}</p>
          <p className="text-xs text-muted">
            {partner.org.city ? `${partner.org.city}, ` : ''}
            {partner.org.country}
            {partner.taxRegistration ? ` · ${partner.taxRegistration}` : ''}
          </p>
        </div>
      </section>

      <section data-testid="print-payout">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-4 text-xs uppercase text-muted">{t('colKind')}</td>
              <td className="py-2 font-semibold">{t(KIND_LABEL[payout.kind] ?? 'kindOther')}</td>
            </tr>
            {sourceOrgName && (
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-xs uppercase text-muted">{t('commissionSource')}</td>
                <td className="py-2 font-semibold">
                  {payout.sourceInvoice ? t('commissionFrom', { org: sourceOrgName, number: payout.sourceInvoice.number }) : sourceOrgName}
                </td>
              </tr>
            )}
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-4 text-xs uppercase text-muted">{t('period')}</td>
              <td className="py-2 font-semibold">
                {format.dateTime(payout.periodStart, { dateStyle: 'medium' })} – {format.dateTime(payout.periodEnd, { dateStyle: 'medium' })}
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-4 text-xs uppercase text-muted">{t('colStatus')}</td>
              <td className="py-2 font-semibold">{t(`status_${payout.status}`)}</td>
            </tr>
            <tr className="border-t-2 border-ink">
              <td className="py-2 pr-4 text-xs font-bold uppercase">{t('colAmount')}</td>
              <td className="py-2 font-mono text-base font-extrabold" data-testid="print-payout-total">
                {payout.currency} {payout.amount.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-6 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">{t('invoiceFooter')}</p>
      </section>
    </div>
  );
}
