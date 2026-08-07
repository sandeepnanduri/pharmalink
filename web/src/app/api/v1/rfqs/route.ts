import { prisma } from '@/lib/db';
import { authenticateApiKey, requireScope, apiError, apiJson } from '@/lib/integrations.server';
import { effectiveRfqStatus } from '@/lib/rfq';

export const dynamic = 'force-dynamic'; // auth-gated — never cache

export async function GET(request: Request) {
  const principal = await authenticateApiKey(request);
  if (!principal) return apiError(401, 'Invalid or missing API key');
  if (!requireScope(principal, 'rfq:read')) return apiError(403, 'Missing scope: rfq:read');
  // RFQs are private; a key must be bound to an organization to read its own.
  if (!principal.orgId) return apiError(403, 'This key is not bound to an organization');

  const rfqs = await prisma.rfq.findMany({
    where: { buyerOrgId: principal.orgId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, reference: true, productName: true, cas: true, quantityKg: true,
      requiredBy: true, status: true, createdAt: true, _count: { select: { quotes: true } },
    },
  });

  const data = rfqs.map((r) => ({
    ...r,
    status: effectiveRfqStatus(r), // report derived expiry, not just the stored value
    quoteCount: r._count.quotes,
    _count: undefined,
  }));
  return apiJson({ count: data.length, data });
}
