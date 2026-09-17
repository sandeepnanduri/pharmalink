import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { partnerLedgerToCsv } from '@/lib/csv';

/**
 * Downloads the signed-in partner's own PartnerPayout history as a generic
 * ledger CSV — the "connect to your real bookkeeping tool" half of the
 * ERP question (PARTNER-ECOSYSTEM.md row 7: "partner, not build" — Tally/
 * Zoho/QuickBooks, not an in-house accounting system). Same auth/shape
 * pattern as api/seller/products/export/route.ts.
 */
export async function GET() {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'partner:draft')) {
    return new Response('Forbidden', { status: 403 });
  }

  const partner = await prisma.partner.findUnique({ where: { orgId: user.orgId }, select: { id: true } });
  if (!partner) return new Response('Forbidden', { status: 403 });

  const payouts = await prisma.partnerPayout.findMany({
    where: { partnerId: partner.id },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, number: true, kind: true, amount: true, currency: true, status: true },
  });

  return new Response(partnerLedgerToCsv(payouts), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="pharmalink-partner-ledger.csv"',
      'cache-control': 'no-store',
    },
  });
}
