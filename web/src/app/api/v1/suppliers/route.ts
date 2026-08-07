import { prisma } from '@/lib/db';
import { authenticateApiKey, requireScope, apiError, apiJson } from '@/lib/integrations.server';

export const dynamic = 'force-dynamic'; // auth-gated — never cache

export async function GET(request: Request) {
  const principal = await authenticateApiKey(request);
  if (!principal) return apiError(401, 'Invalid or missing API key');
  if (!requireScope(principal, 'suppliers:read')) return apiError(403, 'Missing scope: suppliers:read');

  const { searchParams } = new URL(request.url);
  const country = (searchParams.get('country') ?? '').trim();
  const limit = Math.min(Number(searchParams.get('limit') ?? 50) || 50, 200);

  const suppliers = await prisma.organization.findMany({
    where: { status: 'verified', kind: { in: ['seller', 'both'] }, ...(country ? { country } : {}) },
    take: limit,
    orderBy: { verifiedAt: 'desc' },
    select: {
      id: true, name: true, country: true, city: true, exportMarkets: true, verifiedAt: true,
      certifications: { where: { status: 'verified' }, select: { name: true, expiresAt: true } },
      _count: { select: { products: { where: { status: 'live' } } } },
    },
  });
  return apiJson({ count: suppliers.length, data: suppliers });
}
