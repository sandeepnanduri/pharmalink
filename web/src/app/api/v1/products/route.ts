import { prisma } from '@/lib/db';
import { authenticateApiKey, requireScope, apiError, apiJson } from '@/lib/integrations.server';
import type { Prisma } from '@prisma/client';

// Auth-gated, per-key data — must run on every request, never served from the
// route/data cache (a cached 200 would keep answering after a key is revoked).
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const principal = await authenticateApiKey(request);
  if (!principal) return apiError(401, 'Invalid or missing API key');
  if (!requireScope(principal, 'catalog:read')) return apiError(403, 'Missing scope: catalog:read');

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const cas = (searchParams.get('cas') ?? '').trim();
  const country = (searchParams.get('country') ?? '').trim();
  const certs = searchParams.getAll('cert').filter(Boolean);
  const limit = Math.min(Number(searchParams.get('limit') ?? 50) || 50, 200);

  const where: Prisma.ProductWhereInput = {
    status: 'live',
    org: {
      status: 'verified',
      ...(country ? { country } : {}),
      ...(certs.length ? { AND: certs.map((name) => ({ certifications: { some: { name, status: 'verified' } } })) } : {}),
    },
    ...(cas ? { cas } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { cas: { contains: q } }] } : {}),
  };

  const products = await prisma.product.findMany({
    where,
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, cas: true, category: true, grade: true, purity: true,
      moqKg: true, leadTime: true, priceMin: true, priceMax: true, updatedAt: true,
      org: { select: { id: true, name: true, country: true, city: true } },
    },
  });

  return apiJson({ count: products.length, data: products });
}
