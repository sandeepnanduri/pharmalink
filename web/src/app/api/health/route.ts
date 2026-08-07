import { prisma } from '@/lib/db';

/**
 * Liveness/readiness probe for the container platform (Docker healthcheck,
 * Azure Container Apps health probes, k8s). Returns 200 only when the process
 * is up AND the database is reachable, so a broken DB connection fails readiness
 * instead of silently serving 500s.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'up' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ status: 'degraded', db: 'down' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
