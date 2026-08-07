'use client';

import { useEffect, useRef } from 'react';
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
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!state) return;
    // A stable signature of the outcome — identical outcomes do not re-fire.
    const sig = JSON.stringify({ ok: state.ok, error: state.error, issues: state.issues });
    if (sig === last.current) return;
    last.current = sig;

    if (state.ok) {
      push({ tone: 'success', title: success, description: successDescription, action });
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
  }, [state, push, success, successDescription, action]);

  return null;
}

/** Imperative toast for non-form flows (copy to clipboard, bulk actions). */
export function useNotify() {
  const { push } = useToast();
  return (tone: ToastTone, title: string, description?: string) => push({ tone, title, description });
}
