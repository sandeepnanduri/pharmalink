import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { PrintButton } from '@/components/print-button';

// Per-user document — never cached.
export const dynamic = 'force-dynamic';

/**
 * Printable deal record + quote comparison (F4.4 export, F4.6 deal PDF).
 * Print-optimised page rather than a server-generated PDF — see PrintButton.
 */
export default async function PrintPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['buyer', 'both']);
  const t = await getTranslations('rfq');
  const tp = await getTranslations('print');
  const format = await getFormatter();

  const rfq = await prisma.rfq.findUnique({
    where: { id },
    include: {
      buyerOrg: true,
      quotes: { include: { sellerOrg: true }, orderBy: { unitPrice: 'asc' } },
      deal: { include: { quote: { include: { sellerOrg: true } } } },
    },
  });
  if (!rfq) notFound();
  if (rfq.buyerOrgId !== user.orgId) notFound(); // never expose another org's deal

  const terms: Record<string, string | number> = rfq.deal ? JSON.parse(rfq.deal.termsJson) : {};

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 print:px-0 print:py-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted">{tp('hint')}</p>
        <PrintButton label={tp('download')} />
      </div>

      <header className="mb-6 border-b border-line pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-lg font-extrabold">PharmaLink Global</p>
            <p className="text-xs text-muted">{rfq.deal ? tp('dealRecord') : tp('comparison')}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p className="font-mono font-bold text-ink" data-testid="print-ref">
              {rfq.deal?.reference ?? rfq.reference}
            </p>
            <p>{format.dateTime(new Date(), { dateStyle: 'long' })}</p>
          </div>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase text-muted">{tp('buyer')}</p>
          <p className="font-bold">{rfq.buyerOrg.name}</p>
          <p className="text-xs text-muted">
            {rfq.buyerOrg.city}, {rfq.buyerOrg.country}
            {rfq.buyerOrg.regNumber ? ' · ' + rfq.buyerOrg.regNumber : ''}
          </p>
          {rfq.buyerOrg.status === 'verified' && (
            <p className="mt-1 text-xs font-bold text-ok">✓ {tp('verifiedParty')}</p>
          )}
        </div>
        {rfq.deal && (
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase text-muted">{tp('supplier')}</p>
            <p className="font-bold">{rfq.deal.quote.sellerOrg.name}</p>
            <p className="text-xs text-muted">
              {rfq.deal.quote.sellerOrg.city}, {rfq.deal.quote.sellerOrg.country}
            </p>
            {rfq.deal.quote.sellerOrg.status === 'verified' && (
              <p className="mt-1 text-xs font-bold text-ok">✓ {tp('verifiedParty')}</p>
            )}
          </div>
        )}
      </section>

      {rfq.deal ? (
        <section data-testid="print-deal">
          <h2 className="mb-2 text-sm font-bold">{tp('agreedTerms')}</h2>
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(terms).map(([k, v]) => (
                <tr key={k} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-xs uppercase text-muted">{k}</td>
                  <td className="py-2 font-semibold">{String(v)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink">
                <td className="py-2 pr-4 text-xs font-bold uppercase">{t('total')}</td>
                <td className="py-2 font-mono text-base font-extrabold" data-testid="print-total">
                  {rfq.deal.currency} {rfq.deal.totalValue.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-6 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">{tp('footer')}</p>
        </section>
      ) : (
        <section data-testid="print-comparison">
          <h2 className="mb-2 text-sm font-bold">
            {t('compare')} — {rfq.productName} ({rfq.quantityKg} kg)
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink">
                <th className="py-2 text-left">{tp('supplier')}</th>
                <th className="py-2 text-right">{t('unitPrice')}</th>
                <th className="py-2 text-right">{t('total')}</th>
                <th className="py-2 text-right">{t('leadTime')}</th>
                <th className="py-2 text-right">{t('incoterm')}</th>
              </tr>
            </thead>
            <tbody>
              {rfq.quotes.map((q) => (
                <tr key={q.id} className="border-b border-slate-100">
                  <td className="py-2 font-semibold">{q.sellerOrg.name}</td>
                  <td className="py-2 text-right font-mono">
                    {q.currency} {q.unitPrice}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {q.currency} {(q.unitPrice * rfq.quantityKg).toLocaleString()}
                  </td>
                  <td className="py-2 text-right">{q.leadTime}</td>
                  <td className="py-2 text-right">{q.incoterm}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rfq.quotes.length === 0 && <p className="py-6 text-center text-sm text-muted">{t('noQuotesYet')}</p>}
        </section>
      )}
    </div>
  );
}
