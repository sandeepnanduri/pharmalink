import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { buildTemplateWorkbook, exportFilename } from '@/lib/template-export.server';

/**
 * Downloads the curated catalogue as a v3 workbook.
 *
 * A route handler for the same reason the import is one: a server action cannot
 * stream a binary response, and this body is megabytes.
 *
 * `GET`, because it is a read that a curator will bookmark and re-run — but it
 * is audited like a write. An export of every supplier's contact list and
 * commercial terms leaving the platform is precisely the event an operator
 * would want a record of afterwards.
 */

export const dynamic = 'force-dynamic';
/** Building a workbook over the whole corpus is CPU-bound. */
export const maxDuration = 120;

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !can(user.principal, 'admin:moderate')) {
    return Response.json({ error: 'forbidden' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  }

  const params = new URL(request.url).searchParams;
  const orgId = params.get('orgId') ?? undefined;
  const includePrices = params.get('prices') !== '0';

  const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }) : null;
  if (orgId && !org) return Response.json({ error: 'notFound' }, { status: 404 });

  const { buffer, counts, truncated } = await buildTemplateWorkbook(prisma, { orgId, includePrices });

  await prisma.auditLog.create({
    data: {
      action: 'supplierCatalogue.export',
      entity: 'Organization',
      // The whole corpus, when no organisation was named.
      entityId: orgId ?? 'all',
      actorId: user.id,
      // Per-sheet counts only. A full row listing here would put the exported
      // data itself in the audit log, which is not what an audit log is for.
      meta: JSON.stringify({ counts, truncated }).slice(0, 500),
    },
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${exportFilename(new Date(), org?.name)}"`,
      'content-length': String(buffer.byteLength),
      'cache-control': 'no-store',
    },
  });
}
