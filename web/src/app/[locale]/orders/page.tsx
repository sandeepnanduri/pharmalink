import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { canBuy, canSell, isPlatformRole } from '@/lib/rbac';
import { getBuyerOrders, getSellerOrders } from '@/lib/fulfillment-queries';
import { nextSellerStatuses } from '@/lib/shipment';
import { updateShipmentAction, confirmDeliveryAction } from '@/lib/fulfillment-actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';

const SHIP_CLS: Record<string, string> = {
  pending: 'badge-neutral',
  shipped: 'badge-info',
  in_transit: 'badge-info',
  delivered: 'badge-pending',
  confirmed: 'badge-verified',
};

/** Order & shipment tracking (post-deal fulfilment — no payments). */
export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  if (isPlatformRole(user.role)) redirect({ href: '/admin', locale });

  const t = await getTranslations('orders');
  const format = await getFormatter();
  const ShipBadge = ({ s }: { s: string }) => <span className={`${SHIP_CLS[s] ?? 'badge-neutral'} text-[11px]`}>{t(`ship_${s}`)}</span>;

  const [buyerOrders, sellerOrders] = await Promise.all([
    canBuy(user.role) && user.orgId ? getBuyerOrders(user.orgId) : [],
    canSell(user.role) && user.orgId ? getSellerOrders(user.orgId) : [],
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('subtitle')}</p>

      {/* Buyer: incoming orders, confirm receipt */}
      {canBuy(user.role) && (
        <section className="mb-10" data-testid="buyer-orders">
          <h2 className="mb-3 text-base font-bold">{t('yourOrders')}</h2>
          {buyerOrders.length === 0 ? (
            <div className="card py-8 text-center text-sm text-muted" data-testid="no-buyer-orders">{t('noOrders')}</div>
          ) : (
            <div className="space-y-3">
              {buyerOrders.map((d) => {
                const s = d.shipment?.status ?? 'pending';
                return (
                  <div key={d.id} className="card" data-testid="order-row">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{d.rfq.productName}</p>
                        <p className="font-mono text-xs text-muted">
                          {d.reference} · {d.quote.sellerOrg.name} · {d.rfq.quantityKg} kg · {d.currency} {d.totalValue.toLocaleString()}
                        </p>
                      </div>
                      <ShipBadge s={s} />
                    </div>
                    {(d.shipment?.carrier || d.shipment?.trackingRef || d.shipment?.eta) && (
                      <p className="mt-2 text-xs text-muted">
                        {d.shipment?.carrier && `${d.shipment.carrier} · `}
                        {d.shipment?.trackingRef && `${t('tracking')}: ${d.shipment.trackingRef} · `}
                        {d.shipment?.eta && `${t('eta')}: ${format.dateTime(d.shipment.eta, { dateStyle: 'medium' })}`}
                      </p>
                    )}
                    {s === 'delivered' && (
                      <form action={confirmDeliveryAction} className="mt-3">
                        <input type="hidden" name="dealId" value={d.id} />
                        <ConfirmSubmit className="btn-primary !py-1.5 text-xs" confirm={t('confirmReceiptConfirm')} label={t('confirmReceipt')} testId={`confirm-${d.id}`} />
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Seller: outgoing orders, advance shipment */}
      {canSell(user.role) && (
        <section data-testid="seller-orders">
          <h2 className="mb-3 text-base font-bold">{t('salesOrders')}</h2>
          {sellerOrders.length === 0 ? (
            <div className="card py-8 text-center text-sm text-muted" data-testid="no-seller-orders">{t('noOrders')}</div>
          ) : (
            <div className="space-y-3">
              {sellerOrders.map((d) => {
                const s = d.shipment?.status ?? 'pending';
                const next = nextSellerStatuses(s);
                return (
                  <div key={d.id} className="card" data-testid="sales-row">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{d.rfq.productName}</p>
                        <p className="font-mono text-xs text-muted">
                          {d.reference} · {d.rfq.buyerOrg.name} · {d.rfq.quantityKg} kg · {d.currency} {d.totalValue.toLocaleString()}
                        </p>
                      </div>
                      <ShipBadge s={s} />
                    </div>
                    {next.length > 0 ? (
                      <form action={updateShipmentAction} className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
                        <input type="hidden" name="dealId" value={d.id} />
                        <div>
                          <label className="label text-[11px]">{t('setStatus')}</label>
                          <select name="status" className="input !py-1.5 text-xs" data-testid={`ship-status-${d.id}`}>
                            {next.map((n) => (
                              <option key={n} value={n}>{t(`ship_${n}`)}</option>
                            ))}
                          </select>
                        </div>
                        <input name="carrier" placeholder={t('carrier')} defaultValue={d.shipment?.carrier ?? ''} className="input !py-1.5 text-xs" />
                        <input name="trackingRef" placeholder={t('tracking')} defaultValue={d.shipment?.trackingRef ?? ''} className="input !py-1.5 text-xs" />
                        <button type="submit" className="btn-primary !py-1.5 text-xs" data-testid={`ship-update-${d.id}`}>{t('update')}</button>
                      </form>
                    ) : (
                      <p className="mt-2 text-xs text-ok">✓ {t(`ship_${s}`)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
