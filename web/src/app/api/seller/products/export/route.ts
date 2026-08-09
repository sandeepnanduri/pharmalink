import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { EXPORT_COLUMNS, productsToCsv } from '@/lib/csv';

/**
 * Select exactly the columns the CSV emits, derived from the one canonical
 * column list, so export and import cannot drift apart again.
 */
const SELECT = Object.fromEntries(EXPORT_COLUMNS.map((c) => [c, true])) as Record<(typeof EXPORT_COLUMNS)[number], true>;

/** Downloads the signed-in seller's catalogue as CSV. Auth-gated, org-scoped. */
export async function GET() {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'product:manage')) {
    return new Response('Forbidden', { status: 403 });
  }
  const products = await prisma.product.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: 'asc' },
    select: SELECT,
  });
  return new Response(productsToCsv(products), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="pharmalink-products.csv"',
      'cache-control': 'no-store',
    },
  });
}
