'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast, type ToastTone } from '@/components/toaster';

/**
 * Bridges a server action's `useActionState` result to a toast.
 *
 * The problem this solves: every form in the app reports success by silently
 * re-rendering. The user has no confirmation that anything happened, so they
 * press the button again — which is how duplicate RFQs and duplicate quotes get
 * created.
 *
 * Fires once per state transition, not per render: `useActionState` re-renders
 * on every keystroke in an uncontrolled form, and a per-render toast would
 * stack a dozen identical messages.
 *
 * It also asks for a route refresh on success — see HARDENING-PLAN.md 1.8.
 * These pages are `dynamic = 'force-dynamic'`, so `revalidatePath` has no
 * cached entry to drop and Next answers the action with an empty
 * revalidated-path list, leaving the client free to keep the tree it has. It
 * often does, and the result is a committed change the screen does not show:
 * a saved profile that still reads unsaved, a teammate who does not appear.
 *
 * The same explicit-refresh idea as `<ActionSubmit>`, applied to the other half
 * of the codebase — the forms that report through `useActionState` rather than
 * posting a plain action. One place, so a form cannot opt out by forgetting.
 */
export function ActionFeedback({
  state,
  success,
  successDescription,
  action,
}: {
  state: { ok?: boolean; error?: string; issues?: string[] } | undefined;
  success: string;
  successDescription?: string;
  action?: { label: string; href: string };
}) {
  const { push } = useToast();
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!state) return;
    // A stable signature of the outcome — identical outcomes do not re-fire.
    const sig = JSON.stringify({ ok: state.ok, error: state.error, issues: state.issues });
    if (sig === last.current) return;
    last.current = sig;

    if (state.ok) {
      push({ tone: 'success', title: success, description: successDescription, action });
      // Fires on the transition into `ok`, so exactly once per submission.
      router.refresh();
      return;
    }

    if (state.error) {
      push({
        tone: 'error',
        title: 'That did not go through',
        // The action's own message where it has one; never a raw exception.
        description: state.error,
      });
      return;
    }

    if (state.issues?.length) {
      push({
        tone: 'warning',
        title: `${state.issues.length} field${state.issues.length === 1 ? '' : 's'} need attention`,
        description: state.issues[0],
      });
    }
  }, [state, push, router, success, successDescription, action]);

  return null;
}

/** Imperative toast for non-form flows (copy to clipboard, bulk actions). */
export function useNotify() {
  const { push } = useToast();
  return (tone: ToastTone, title: string, description?: string) => push({ tone, title, description });
}
