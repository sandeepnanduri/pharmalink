'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import type { ImportReport } from '@/lib/supplier-import.server';

/**
 * Admin → Data Import → Supplier Catalogue.
 *
 * Preview then apply, following `market-data-console.tsx` and its stated
 * reason: *an import that silently creates 200 shell organisations is very hard
 * to unpick.* Preview is the default and apply is only offered once a preview
 * has been read.
 *
 * The single most useful thing this screen shows is a **real Excel cell
 * reference** — `'2. API Products'!I47`. It costs nothing, because the reader
 * retains the address anyway, and it turns "the import failed" into a cell the
 * curator can paste into the Name Box.
 */

const MAX_VISIBLE_ISSUES = 50;

export function ImportConsole({ maxBytes }: { maxBytes: number }) {
  const t = useTranslations('imports');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, setPending] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function send(mode: 'preview' | 'apply') {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError('noFile');
      return;
    }
    setPending(mode);
    setError(null);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('mode', mode);
      const res = await fetch('/api/admin/imports/supplier-catalogue', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'failed');
        setReport(data.report ?? null);
        return;
      }
      setReport(data.report);
      if (mode === 'apply') {
        setApplied(true);
        router.refresh();
      }
    } catch {
      setError('network');
    } finally {
      setPending(null);
    }
  }

  const rejections = report?.issues.filter((i) => !i.warning) ?? [];
  const warnings = report?.issues.filter((i) => i.warning) ?? [];

  return (
    <div className="space-y-5" data-testid="import-console">
      <div className="card">
        <label className="label" htmlFor="wb">
          {t('chooseFile')}
        </label>
        <input
          ref={inputRef}
          id="wb"
          type="file"
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="input"
          data-testid="catalogue-file"
          onChange={() => {
            // A new file invalidates the previous preview — offering Apply
            // against a report from a different workbook is the worst possible
            // failure mode for this screen.
            setReport(null);
            setApplied(false);
            setError(null);
          }}
        />
        <p className="mt-1 text-xs text-muted">{t('sizeHint', { mb: Math.round(maxBytes / 1024 / 1024) })}</p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => send('preview')} disabled={pending !== null} className="btn-primary" data-testid="catalogue-import-preview">
            {pending === 'preview' ? t('previewing') : t('preview')}
          </button>
          {/* Apply is unavailable until a preview has been produced. */}
          <button
            type="button"
            onClick={() => send('apply')}
            disabled={pending !== null || !report || applied}
            className="btn-ghost disabled:opacity-40"
            data-testid="catalogue-import-apply"
          >
            {pending === 'apply' ? t('applying') : t('apply')}
          </button>
          {applied && <span className="badge-verified" data-testid="import-applied">{t('applied')}</span>}
          {error && (
            <span role="alert" className="text-xs font-semibold text-danger" data-testid="import-error">
              {t(`error_${error}`, { fallback: error } as never)}
            </span>
          )}
        </div>
      </div>

      {report && (
        <>
          <div className="card overflow-x-auto p-0" data-testid="import-summary">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className="th">{t('sheet')}</th>
                  <th className="th">{t('rowsRead')}</th>
                  <th className="th">{t('valid')}</th>
                  <th className="th">{t('rejectedCol')}</th>
                </tr>
              </thead>
              <tbody>
                {report.sheets.map((s) => (
                  <tr key={s.sheet} data-testid="import-sheet-row">
                    <td className="td text-xs font-semibold">
                      {s.sheet}
                      {s.problem && <span className="ml-2 badge-neutral">{t(`sheet_${s.problem.replace('.', '_')}`)}</span>}
                    </td>
                    <td className="td font-mono text-xs">{s.read}</td>
                    <td className="td font-mono text-xs text-ok">{s.valid}</td>
                    <td className="td font-mono text-xs">{s.rejected > 0 ? <span className="text-danger">{s.rejected}</span> : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-line px-4 py-3 text-xs text-muted">
              {t('totals', { read: report.totals.read, valid: report.totals.valid, rejected: report.totals.rejected })}
              {applied && ` · ${t('written', { created: report.totals.created, updated: report.totals.updated })}`}
            </div>
          </div>

          {report.needsReview.length > 0 && (
            <div className="card border-warn/40 bg-warn-pale" data-testid="import-needs-review">
              <p className="text-sm font-bold">⚠ {t('needsReview', { n: report.needsReview.length })}</p>
              {/* Skipped on apply, never auto-attached: filing a product under
                  the wrong Sun Pharma entity is not recoverable. */}
              <p className="mt-1 text-xs">{t('needsReviewHint')}</p>
              <ul className="mt-2 space-y-0.5 text-xs">
                {report.needsReview.slice(0, MAX_VISIBLE_ISSUES).map((n) => (
                  <li key={`${n.sheet}-${n.row}`} className="font-mono">
                    {n.sheet} row {n.row}: “{n.name}” ≈ “{n.candidate}”
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rejections.length > 0 && (
            <div className="card" data-testid="import-issues">
              <p className="text-sm font-bold text-danger">{t('rejectedRows', { n: rejections.length })}</p>
              <ul className="mt-2 space-y-0.5 font-mono text-xs">
                {rejections.slice(0, MAX_VISIBLE_ISSUES).map((i) => (
                  <li key={`${i.location}-${i.code}-${i.column}`}>
                    <span className="text-brand">{i.location}</span> {t(`code_${i.code.replace('.', '_')}`)}
                    {i.value ? ` — “${i.value}”` : ''}
                  </li>
                ))}
              </ul>
              {rejections.length > MAX_VISIBLE_ISSUES && (
                <p className="mt-2 text-xs text-muted">{t('andMore', { n: rejections.length - MAX_VISIBLE_ISSUES })}</p>
              )}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="card" data-testid="import-warnings">
              <p className="text-sm font-bold">{t('warnings', { n: warnings.length })}</p>
              <p className="mt-1 text-xs text-muted">{t('warningsHint')}</p>
              <ul className="mt-2 space-y-0.5 font-mono text-xs text-warn">
                {warnings.slice(0, MAX_VISIBLE_ISSUES).map((i) => (
                  <li key={`${i.location}-${i.code}-${i.column}`}>
                    <span>{i.location}</span> {t(`code_${i.code.replace('.', '_')}`)}
                    {i.column ? ` (${i.column})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
