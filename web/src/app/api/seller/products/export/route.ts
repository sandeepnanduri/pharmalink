import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { productsToCsv } from '@/lib/csv';

/** Downloads the signed-in seller's catalogue as CSV. Auth-gated, org-scoped. */
export async function GET() {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'product:manage')) {
    return new Response('Forbidden', { status: 403 });
  }
  const products = await prisma.product.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: 'asc' },
    select: { name: true, cas: true, category: true, grade: true, purity: true, moqKg: true, leadTime: true, priceMin: true, priceMax: true, status: true },
  });
  return new Response(productsToCsv(products), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="pharmalink-products.csv"',
      'cache-control': 'no-store',
    },
  });
}
