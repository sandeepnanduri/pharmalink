'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Uploaded {
  id: string;
  filename: string;
  sha256: string | null;
}

/**
 * Real upload: bytes are POSTed to /api/documents, SHA-256 hashed and stored
 * server-side under an opaque key. Files never get a public URL — reads go
 * through GET /api/documents/[id], which re-checks access and audits.
 *
 * NOTE: this renders NO <form> of its own. It sits inside the onboarding <form>,
 * and nested forms are invalid HTML — the browser silently drops the inner one,
 * so a nested submit would hit the outer form and never upload.
 */
export function DocumentUpload({ kind = 'gmp_cert' }: { kind?: string }) {
  const t = useTranslations('onboarding');
  const inputRef = useRef<HTMLInputElement>(null);
  const [done, setDone] = useState<Uploaded[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function upload() {
    setError(null);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError('uploadEmpty');
      return;
    }

    const fd = new FormData();
    fd.set('file', file);
    fd.set('kind', kind);

    setPending(true);
    try {
      const res = await fetch('/api/documents', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'error');
        return;
      }
      setDone((d) => (d.some((x) => x.id === data.id) ? d : [...d, data as Uploaded]));
      if (inputRef.current) inputRef.current.value = '';
    } catch {
      setError('error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="rounded-xl border-2 border-dashed border-brand-mid bg-brand-pale p-4 text-center">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          aria-label={t('docName')}
          data-testid="doc-file"
          className="mx-auto block max-w-full text-xs"
        />
        <button
          type="button"
          onClick={upload}
          disabled={pending}
          className="btn-primary mt-3 !py-2 text-xs"
          data-testid="doc-upload"
        >
          {pending ? t('uploading') : t('uploadDoc')}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          data-testid="upload-error"
          className="mt-2 rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700"
        >
          {t(error)}
        </p>
      )}

      {done.length > 0 && (
        <ul className="mt-3 space-y-1" data-testid="uploaded-list">
          {done.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs text-muted">
              📄 {d.filename}
              <span className="badge-verified">✓ {t('uploaded')}</span>
              {d.sha256 && (
                <span className="font-mono text-[10px]" title={d.sha256}>
                  {t('verifyHash')} {d.sha256.slice(0, 12)}…
                </span>
              )}
              {/* Linked to the org when the onboarding form submits. */}
              <input type="hidden" name="documentIds" value={d.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
