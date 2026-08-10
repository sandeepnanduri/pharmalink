'use client';

import { useRouter } from 'next/navigation';

/**
 * A `<form>` that awaits its server action and *then* refreshes the route.
 *
 * ## Why not `<ActionSubmit>` / `<RefreshOnAction>` here — HARDENING-PLAN.md 1.8
 *
 * Those two watch `useFormStatus` for the pending→settled edge and refresh on
 * it. That works when the form outlives its own submission. It does not work on
 * the verification queue: the action's response re-renders the list, the row's
 * subtree is remounted, and the new observer starts with `wasPending = false`.
 * It never sees an edge, so it never refreshes — measured, with the render log
 * showing `pending: true` then a fresh `pending: false` and no transition in
 * between. The approval committed; the applicant stayed in the queue.
 *
 * Awaiting the action in a client function removes the observation problem
 * entirely: this closure owns the promise, so no remount can lose it. React
 * still tracks pending for any `useFormStatus` inside, so submit buttons keep
 * disabling themselves.
 *
 * The underlying cause is unchanged and worth restating: these pages are
 * `dynamic = 'force-dynamic'`, so `revalidatePath` has no cached entry to drop
 * and Next answers with `x-action-revalidated: [[],1,0]` — an empty path list —
 * leaving the client free to keep the tree it has.
 */
export function ActionForm({
  action,
  children,
  className,
  testId,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const router = useRouter();
  return (
    <form
      className={className}
      data-testid={testId}
      action={async (formData) => {
        await action(formData);
        router.refresh();
      }}
    >
      {children}
    </form>
  );
}
