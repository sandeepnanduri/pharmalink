'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Toasts.
 *
 * Design rules, each one a correction of how toasts usually go wrong:
 *
 *  - **A toast is confirmation, never the only record.** Anything a user must
 *    act on gets a notification or an inline error too; a toast that vanishes
 *    after five seconds is not a place to put a failure.
 *  - **Errors do not auto-dismiss.** Success is a courtesy and can fade;
 *    a failure the user has not read yet must stay until dismissed.
 *  - **It announces itself.** `role="status"` for success, `role="alert"` for
 *    errors, so a screen reader hears the outcome without hunting for it.
 *  - **The stack is capped.** Five actions in a row must not bury the screen;
 *    the oldest is dropped rather than growing without bound.
 *  - **Pause on hover.** A toast that disappears while being read is worse than
 *    no toast.
 */

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Optional single action, e.g. "View order". */
  action?: { label: string; href: string };
}

interface ToastContext {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

const Ctx = createContext<ToastContext | null>(null);
const MAX_VISIBLE = 4;
const DISMISS_MS: Record<ToastTone, number | null> = {
  success: 5000,
  info: 5000,
  warning: 8000,
  // Errors never auto-dismiss — see the rules above.
  error: null,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      // Deterministic ids: Math.random in a render path is a hydration hazard.
      seq.current += 1;
      const id = `t${seq.current}`;
      setToasts((cur) => [...cur, { ...t, id }].slice(-MAX_VISIBLE));
      const ms = DISMISS_MS[t.tone];
      if (ms != null) timers.current.set(id, setTimeout(() => dismiss(id), ms));
      return id;
    },
    [dismiss],
  );

  // Clear every pending timer on unmount, or a dismissed toast fires into a
  // dead component on a fast route change.
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TONE: Record<ToastTone, { bar: string; icon: string; iconWrap: string; role: 'status' | 'alert' }> = {
  success: { bar: 'bg-ok', icon: 'text-ok', iconWrap: 'bg-ok-pale', role: 'status' },
  error: { bar: 'bg-danger', icon: 'text-danger', iconWrap: 'bg-danger-pale', role: 'alert' },
  warning: { bar: 'bg-warn', icon: 'text-warn', iconWrap: 'bg-warn-pale', role: 'alert' },
  info: { bar: 'bg-accent', icon: 'text-accent-dark', iconWrap: 'bg-accent-pale', role: 'status' },
};

function Glyph({ tone }: { tone: ToastTone }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (tone === 'success') return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
  if (tone === 'error') return <svg {...common}><path d="M18 6 6 18M6 6l12 12" /></svg>;
  if (tone === 'warning') return <svg {...common}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
}

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:items-end"
      // aria-live on the container so additions are announced even though each
      // toast also carries its own role.
      aria-live="polite"
      aria-relevant="additions"
      data-testid="toast-viewport"
    >
      {toasts.map((t) => {
        const tone = TONE[t.tone];
        return (
          <div
            key={t.id}
            role={tone.role}
            data-testid="toast"
            data-tone={t.tone}
            className="pointer-events-auto flex w-full max-w-sm animate-[toastIn_.18s_ease-out] items-start gap-3 overflow-hidden rounded-panel border border-line bg-white p-3.5 shadow-lg"
          >
            <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-control ${tone.iconWrap} ${tone.icon}`} aria-hidden="true">
              <Glyph tone={t.tone} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs leading-relaxed text-slate2">{t.description}</p>}
              {t.action && (
                <a href={t.action.href} className="mt-1.5 inline-block text-xs font-semibold text-brand hover:underline">
                  {t.action.label} →
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-control text-muted transition hover:bg-mist hover:text-ink"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
