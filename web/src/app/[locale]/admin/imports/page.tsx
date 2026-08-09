import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { can, opsLanding } from '@/lib/rbac';
import { ImportConsole } from '@/components/import-console';
import { MAX_IMPORT_BYTES } from '@/app/api/admin/imports/supplier-catalogue/route';

/**
 * Admin → Data Import → Supplier Catalogue.
 *
 * The upload target the curation template names in its own READ ME. The batch
 * history below the console is what makes a repeated import explicable: the
 * content hash answers "have we loaded this exact file before", and each row
 * links to the `IngestRun` so a failed apply appears in the same operator
 * surface as every other connector.
 */
export const dynamic = 'force-dynamic';

const RECENT_BATCHES = 15;

const STATUS_CLASS: Record<string, string> = {
  applied: 'badge-verified',
  previewed: 'badge-info',
  uploaded: 'badge-neutral',
  failed: 'badge-rejected',
};

export default async function ImportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireUser(locale);
  if (!can(actor.principal, 'admin:moderate')) redirect({ href: opsLanding(actor.role), locale });

  const t = await getTranslations('imports');
  const format = await getFormatter();

  const batches = await prisma.importBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: RECENT_BATCHES,
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-muted">{t('subtitle')}</p>

      <ImportConsole maxBytes={MAX_IMPORT_BYTES} />

      <h2 className="mb-3 mt-8 text-base font-bold">{t('history')}</h2>
      {batches.length === 0 ? (
        <div className="card py-12 text-center text-sm text-muted">{t('noBatches')}</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="th">{t('file')}</th>
                <th className="th">Status</th>
                <th className="th">{t('rowsRead')}</th>
                <th className="th">{t('errors')}</th>
                <th className="th">{t('uploaded')}</th>
                <th className="th">{t('hash')}</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const counts = safeCounts(b.sheetCountsJson);
                return (
                  <tr key={b.id} data-testid="import-batch-row">
                    <td className="td text-xs font-semibold">{b.filename}</td>
                    <td className="td">
                      <span className={STATUS_CLASS[b.status] ?? 'badge-neutral'}>{b.status}</span>
                    </td>
                    <td className="td font-mono text-xs">{counts}</td>
                    <td className="td font-mono text-xs">
                      {b.errorCount > 0 ? <span className="text-danger">{b.errorCount}</span> : '0'}
                    </td>
                    <td className="td font-mono text-xs text-muted">
                      {format.dateTime(b.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    {/* The content hash is how an operator answers "is this the
                        same file we loaded last week" without opening either. */}
                    <td className="td font-mono text-[11px] text-muted" title={b.sha256}>
                      {b.sha256.slice(0, 12)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Total rows read across sheets, tolerating a malformed or absent summary. */
function safeCounts(json: string | null): number {
  if (!json) return 0;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.reduce((n: number, s: { read?: number }) => n + (s.read ?? 0), 0) : 0;
  } catch {
    return 0;
  }
}
