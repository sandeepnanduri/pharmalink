'use client';

import { useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

/**
 * A submit button for a `<form action={serverAction}>` that refreshes the route
 * once the action resolves.
 *
 * ## Why this exists — HARDENING-PLAN.md 1.8
 *
 * Several ops mutations committed correctly and left the screen showing the old
 * state: an approved supplier kept sitting in the verification queue, a held
 * listing kept saying "Live". A manual reload always corrected it, so the write
 * was never the problem.
 *
 * The mechanism, from the action's own response headers: these pages are
 * `dynamic = 'force-dynamic'`, so there is no cached entry for
 * `revalidatePath('/[locale]/…', 'page')` to drop. Next answers the action with
 * `x-action-revalidated: [[],1,0]` — an empty revalidated-path list — plus a
 * complete and correct RSC tree, and the client is free to keep the tree it
 * already has. It often does. It is a race, not a deterministic failure, which
 * is why it read as flaky tests for a while.
 *
 * Previously attempted and recorded in the plan: `revalidatePath('/', 'layout')`
 * (improves it, does not settle it) and `redirect()` back to the same page
 * (**worse** — it pushes a URL the router already holds and serves the stale
 * entry). What was never tried is the thing this does: stop relying on
 * revalidation to imply a refresh, and ask for one explicitly.
 *
 * `useFormStatus` only reports the form this button is *inside*, so a page with
 * fifteen moderation rows refreshes once, for the row that was actually
 * submitted.
 *
 * This is deliberately not "fire a refresh on every render" — it fires on the
 * pending→settled edge, which happens exactly once per submission.
 */
export function ActionSubmit({
  label,
  className = 'btn-primary',
  testId,
  /** When set, the click must be confirmed first — for irreversible actions. */
  confirm,
  pendingLabel,
}: {
  label: string;
  className?: string;
  testId?: string;
  confirm?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (wasPending.current && !pending) {
      // Deferred by one task, deliberately. Called synchronously on the
      // pending->settled edge, the refresh lands while React is still applying
      // the action's own response and the router treats the current segment as
      // already fresh: it re-prefetches every sibling link and never refetches
      // the page you are on. Measured on /en/admin -- fourteen RSC requests
      // after an approval, not one of them for /en/admin.
      const id = setTimeout(() => router.refresh(), 0);
      wasPending.current = pending;
      return () => clearTimeout(id);
    }
    wasPending.current = pending;
  }, [pending, router]);

  return (
    <button
      type="submit"
      className={className}
      data-testid={testId}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      {pending && pendingLabel ? pendingLabel : label}
    </button>
  );
}
