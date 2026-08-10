import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { looksLikeXlsx } from '@/lib/xlsx.server';
import { MAX_IMPORT_BYTES, applyImport, previewImport } from '@/lib/supplier-import.server';

/**
 * Supplier-catalogue workbook upload.
 *
 * ## A route handler, not a server action
 *
 * `serverActions.bodySizeLimit` defaults to **1 MB** and is not configured in
 * `next.config.ts`. The template alone is ~125 KB empty and a real curation
 * batch is several megabytes; raising the limit would raise it for every action
 * in the app. `src/app/api/documents/route.ts` is a route handler for exactly
 * this reason and says so.
 *
 * ## What is checked before `exceljs` sees a byte
 *
 * Size, then **magic bytes** — never `file.type`. Browsers routinely send
 * `application/octet-stream` for a spreadsheet, and the field is
 * client-controlled anyway, so an `.exe` renamed `.xlsx` would otherwise reach
 * the parser.
 *
 * `ALLOWED_MIME` in `storage.ts` is deliberately NOT extended: that list gates
 * evidence uploads, and adding a spreadsheet to it would let anyone attach one
 * as a GMP certificate.
 */

export const dynamic = 'force-dynamic';
/** Parsing a large workbook is CPU-bound; the default 15s is not enough. */
export const maxDuration = 120;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || !can(user.principal, 'admin:moderate')) return json({ error: 'forbidden' }, 403);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const mode = String(form?.get('mode') ?? 'preview');
  if (!(file instanceof File)) return json({ error: 'noFile' }, 400);
  if (file.size === 0) return json({ error: 'emptyFile' }, 400);
  if (file.size > MAX_IMPORT_BYTES) return json({ error: 'tooLarge', maxBytes: MAX_IMPORT_BYTES }, 413);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!looksLikeXlsx(buffer)) return json({ error: 'notXlsx' }, 415);

  // Same content-hash dedupe the document upload path uses. It also answers
  // "have we already loaded this exact file", which is the first thing an
  // operator asks when a batch looks familiar.
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  const batch = await prisma.importBatch.create({
    data: {
      kind: 'supplier-catalogue',
      filename: file.name.slice(0, 200),
      sha256,
      sizeBytes: file.size,
      uploadedById: user.id,
      status: 'uploaded',
    },
  });

  const apply = mode === 'apply';
  const outcome = apply ? await applyImport(buffer, user.id) : await previewImport(buffer);

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: outcome.error ? 'failed' : apply ? 'applied' : 'previewed',
      sheetCountsJson: JSON.stringify(outcome.report.sheets),
      errorCount: outcome.report.issues.filter((i) => !i.warning).length,
      // Capped in `supplier-import.server.ts`; AuditLog.meta stays a summary and
      // the detail lives here.
      reportJson: JSON.stringify({ issues: outcome.report.issues, needsReview: outcome.report.needsReview }).slice(0, 200_000),
      ingestRunId: outcome.runId ?? null,
      ...(apply ? { appliedAt: new Date() } : { previewedAt: new Date() }),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: apply ? 'supplierCatalogue.import.apply' : 'supplierCatalogue.import.preview',
      entity: 'ImportBatch',
      entityId: batch.id,
      actorId: user.id,
      // Counts only — the row-level report is on the batch.
      meta: JSON.stringify(outcome.report.totals).slice(0, 500),
    },
  });

  if (outcome.error) return json({ batchId: batch.id, error: outcome.error, report: outcome.report }, 500);
  return json({ batchId: batch.id, mode: apply ? 'apply' : 'preview', report: outcome.report });
}
