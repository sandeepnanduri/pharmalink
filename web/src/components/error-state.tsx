'use client';

import { useEffect, useState } from 'react';

/**
 * The shared error surface, used by every `error.tsx` boundary.
 *
 * Four rules, each from a real failure mode:
 *
 *  1. **Never show a stack trace.** It tells the user nothing and leaks file
 *     paths and query shapes. The digest is shown instead — it is what support
 *     needs to find the entry in the logs.
 *  2. **Say what is safe.** After a failed write, the first question is "did it
 *     go through?". Silence is the worst answer, so the caller states it.
 *  3. **Offer a way out.** A dead end with no action is how a user abandons the
 *     product. Retry re-runs the segment; the secondary action leaves it.
 *  4. **Report it.** Without this the failure exists only on the user's screen.
 */
export function ErrorState({
  title,
  body,
  digest,
  reset,
  safeMessage,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  body: string;
  digest?: string;
  reset?: () => void;
  safeMessage?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  const [retrying, setRetrying] = useState(false);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center" role="alert" data-testid="error-state">
      <span className="grid h-14 w-14 place-items-center rounded-panel bg-danger-pale text-danger" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M12 8v5M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </span>

      <h1 className="mt-5 font-display text-xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate2">{body}</p>

      {safeMessage && (
        <p className="mt-3 rounded-control bg-ok-pale px-3 py-2 text-xs font-semibold text-ok" data-testid="error-safe">
          {safeMessage}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {reset && (
          <button
            type="button"
            className="btn-primary"
            data-testid="error-retry"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              reset();
              // The boundary may not remount if the same error recurs; release
              // the button so the user is never left with a dead control.
              setTimeout(() => setRetrying(false), 2500);
            }}
          >
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        )}
        <a href={secondaryHref ?? '/'} className="btn-ghost">
          {secondaryLabel ?? 'Go to dashboard'}
        </a>
      </div>

      {digest && (
        <p className="mt-8 text-[11px] text-muted">
          Reference <span className="font-mono font-semibold text-slate2">{digest}</span> — quote this to support.
        </p>
      )}
    </div>
  );
}

/**
 * Reports a client-visible error exactly once.
 *
 * Deduped on the digest: React can re-render a boundary several times for one
 * failure, and a per-render report turns a single outage into a flood that
 * hides the signal.
 */
const reported = new Set<string>();

export function useErrorReport(error: Error & { digest?: string }, where: string) {
  useEffect(() => {
    const key = error.digest ?? `${where}:${error.message}`;
    if (reported.has(key)) return;
    reported.add(key);

    // Structured so a log aggregator can group these; swapped for a real
    // reporter (Sentry et al.) by replacing this one call.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'client_error_boundary',
        where,
        digest: error.digest ?? null,
        message: error.message,
        at: new Date().toISOString(),
      }),
    );
  }, [error, where]);
}
