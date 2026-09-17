import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/session';
import { getPartnerGmvStatement } from '@/lib/partner-queries';
import { PrintButton } from '@/components/print-button';

// Per-user document — never cached.
export const dynamic = 'force-dynamic';

/**
 * A bank-acceptable GMV & earnings statement — same browser-print pattern as
 * the per-payout invoice (partner/earnings/[id]/print), summarizing the
 * whole relationship instead of one payout. Answers persona 7.2's stated
 * need: proof of GMV a lender will actually accept.
 */
export default async function PartnerGmvStatementPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['partner']);
  const t = await getTranslations('partnerEarnings');
  const tp = await getTranslations('print');
  const format = await getFormatter();

  const statement = user.orgId ? await getPartnerGmvStatement(user.orgId) : null;
  if (!statement) notFound();
  const { partner, paidTotal, accruedTotal, payoutCount, introductionCount, representedOrgCount, generatedAt } = statement;

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
            <p className="text-xs text-muted">{t('gmvStatementTitle')}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>{format.dateTime(generatedAt, { dateStyle: 'long', timeStyle: 'short' })}</p>
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

      <section data-testid="print-gmv-statement">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-4 text-xs uppercase text-muted">{t('gmvStatementIntroductions')}</td>
              <td className="py-2 font-semibold" data-testid="print-introduction-count">
                {introductionCount}
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-4 text-xs uppercase text-muted">{t('gmvStatementRepresented')}</td>
              <td className="py-2 font-semibold">{representedOrgCount}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-4 text-xs uppercase text-muted">{t('gmvStatementPayoutCount')}</td>
              <td className="py-2 font-semibold">{payoutCount}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-4 text-xs uppercase text-muted">{t('paidToDate')}</td>
              <td className="py-2 font-mono font-semibold">${paidTotal.toFixed(2)}</td>
            </tr>
            <tr className="border-t-2 border-ink">
              <td className="py-2 pr-4 text-xs font-bold uppercase">{t('accruedPending')}</td>
              <td className="py-2 font-mono text-base font-extrabold" data-testid="print-accrued-total">
                ${accruedTotal.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-6 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">{t('gmvStatementFooter')}</p>
      </section>
    </div>
  );
}
