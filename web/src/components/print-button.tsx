'use client';

/**
 * Browser print-to-PDF.
 *
 * Deliberately not a server-side PDF renderer: the browser's own print pipeline
 * has the CJK fonts already, so the 简体中文 locale exports correctly without
 * shipping and embedding a CJK font subset (which would add megabytes and is a
 * common source of tofu boxes in generated PDFs).
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary" data-testid="print-button">
      ⬇ {label}
    </button>
  );
}
