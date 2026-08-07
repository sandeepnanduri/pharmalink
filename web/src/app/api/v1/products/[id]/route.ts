import { prisma } from '@/lib/db';
import { authenticateApiKey, requireScope, apiError, apiJson } from '@/lib/integrations.server';

export const dynamic = 'force-dynamic'; // auth-gated — never cache

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiKey(request);
  if (!principal) return apiError(401, 'Invalid or missing API key');
  if (!requireScope(principal, 'catalog:read')) return apiError(403, 'Missing scope: catalog:read');

  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, status: 'live', org: { status: 'verified' } },
    select: {
      id: true, name: true, cas: true, category: true, grade: true, purity: true, moqKg: true,
      leadTime: true, priceMin: true, priceMax: true, shelfLife: true, storage: true,
      org: { select: { id: true, name: true, country: true, city: true, certifications: { where: { status: 'verified' }, select: { name: true, expiresAt: true } } } },
    },
  });
  if (!product) return apiError(404, 'Product not found');
  return apiJson({ data: product });
}
