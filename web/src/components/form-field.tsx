'use client';

import { useTranslations } from 'next-intl';

/**
 * Form field primitives: consistent required-marking and error display.
 *
 * Three rules this enforces, because getting them wrong is how forms become
 * guessing games:
 *
 *  1. Required is marked on the LABEL and on the CONTROL. The asterisk is
 *     decorative (aria-hidden); assistive tech reads `required`/`aria-required`
 *     from the input itself. An asterisk alone is invisible to a screen reader.
 *  2. An error is never signalled by colour alone — red border AND an
 *     icon-led message AND aria-invalid, so it survives colour blindness and
 *     screen readers.
 *  3. The message says what to do, not that something went wrong.
 */

/** Red asterisk plus an sr-only word, so "required" is heard as well as seen. */
export function RequiredMark() {
  const t = useTranslations('common');
  return (
    <>
      <span className="required-mark" aria-hidden="true">
        *
      </span>
      <span className="sr-only">{t('required')}</span>
    </>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  required = false,
  className = '',
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`label ${className}`} htmlFor={htmlFor}>
      {children}
      {required && <RequiredMark />}
    </label>
  );
}

/**
 * Message shown beneath a field. Rendered only when there is a message, and
 * wired to the control via `id` so aria-describedby can point at it.
 */
export function FieldError({ id, message }: { id?: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error" role="alert">
      <span aria-hidden="true">⚠</span>
      <span>{message}</span>
    </p>
  );
}

/**
 * Summary of everything wrong with a submission, shown at the top of the form.
 *
 * Listing all problems at once matters: making someone submit four times to
 * discover four problems is how you get people entering junk to get past the
 * form. Each entry is a button that focuses the offending control, so a long
 * form does not become a scavenger hunt.
 */
export function FormErrorSummary({
  issues,
  title,
}: {
  issues: { key: string; message: string; fieldId?: string }[];
  title: string;
}) {
  if (issues.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-danger bg-danger-pale px-4 py-3"
      role="alert"
      aria-live="assertive"
      data-testid="form-error-summary"
    >
      <p className="flex items-center gap-2 text-sm font-bold text-red-800">
        <span aria-hidden="true">⚠</span>
        {title}
      </p>
      <ul className="mt-2 space-y-1">
        {issues.map((i) => (
          <li key={i.key} className="text-xs text-red-800">
            {i.fieldId ? (
              <button
                type="button"
                className="text-left font-semibold underline underline-offset-2 hover:text-red-900"
                onClick={() => {
                  const el = document.getElementById(i.fieldId!);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  (el as HTMLElement | null)?.focus?.();
                }}
              >
                {i.message}
              </button>
            ) : (
              <span className="font-semibold">{i.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
