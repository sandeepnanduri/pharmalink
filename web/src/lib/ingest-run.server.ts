import { prisma } from '@/lib/db';

/**
 * The run-bookkeeping wrapper every ingestion goes through.
 *
 * Extracted from `market-data.server.ts`, where it was private. The workbook
 * importer needs exactly the same thing — create a row, record counts or a
 * truncated error, always close it out — and duplicating it would mean two
 * places to keep the failure semantics consistent.
 *
 * More usefully, it means the import appears in the operator console beside
 * every other connector, with the same "last run / status / inserted" shape
 * that `latestRuns()` already renders. An import that fails silently is
 * indistinguishable from one nobody started.
 */

export interface IngestSummary {
  source: string;
  status: 'ok' | 'failed';
  fetched: number;
  inserted: number;
  skipped: number;
  error?: string;
  /** The run row, so a caller can link a batch to it. */
  runId?: string;
}

export interface RunCounts {
  fetched: number;
  inserted: number;
  skipped: number;
}

/** Errors are truncated to 500 chars — a stack trace in a list column helps nobody. */
const MAX_ERROR = 500;

export async function withRun(source: string, work: (runId: string) => Promise<RunCounts>): Promise<IngestSummary> {
  const run = await prisma.ingestRun.create({ data: { source } });
  try {
    const counts = await work(run.id);
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { ...counts, status: 'ok', finishedAt: new Date() },
    });
    return { source, status: 'ok', runId: run.id, ...counts };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { status: 'failed', error: error.slice(0, MAX_ERROR), finishedAt: new Date() },
    });
    return { source, status: 'failed', runId: run.id, fetched: 0, inserted: 0, skipped: 0, error };
  }
}
