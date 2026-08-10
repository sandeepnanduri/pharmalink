'use client';

import { useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

/**
 * Drop inside a `<form action={serverAction}>` to refresh the route once the
 * action resolves. Renders nothing.
 *
 * ## Why this exists alongside `<ActionSubmit>` — HARDENING-PLAN.md 1.8
 *
 * `ActionSubmit` fixes the same stale-tree race, but it fixes it by *being* the
 * button, so adopting it means rewriting the markup and re-homing the
 * `data-testid` of every control it replaces. That is fine for a new form and
 * needless churn for the two dozen existing ones — several of which are plain
 * text links by design, not buttons, and would change appearance.
 *
 * The race itself, from the action's own response headers: these pages are
 * `dynamic = 'force-dynamic'`, so `revalidatePath` has no cache entry to drop
 * and Next answers with `x-action-revalidated: [[],1,0]` — an empty
 * revalidated-path list. The client is then free to keep the tree it already
 * has, and often does. The write always committed; only the screen was wrong.
 *
 * `useFormStatus` reports only the form this component sits inside, so a page
 * with fifteen rows refreshes once, for the row that was actually submitted.
 * The effect fires on the pending→settled edge, which happens exactly once per
 * submission — not on every render.
 *
 * Use this for an existing form; use `ActionSubmit` when writing a new one, so
 * the pending state disables the button too.
 */
export function RefreshOnAction() {
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

  return null;
}
