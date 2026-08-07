import { Capsule } from './capsule-loader';

/**
 * Loading affordances.
 *
 * Rule: never replace a button's label while it works. Collapsing "Send quote"
 * to "…" destroys the only cue about what is happening — the user cannot tell a
 * pending action from a broken one. Keep the label, add a loader, disable it.
 */

/** Generic ring. Kept for non-branded/dense contexts; buttons use the capsule. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

/**
 * Button content that shows progress without hiding the action's name.
 * `busyLabel` lets a slow action say what it is doing ("Matching suppliers…").
 */
export function ButtonContent({
  pending,
  label,
  busyLabel,
}: {
  pending: boolean;
  label: string;
  busyLabel?: string;
}) {
  if (!pending) return <>{label}</>;
  return (
    <>
      {/* Capsule rather than a ring: same job, but it reads as this product's
          own motion instead of a generic framework spinner. */}
      <Capsule size="sm" />
      <span>{busyLabel ?? label}</span>
      {/* Announce progress to screen readers without shouting on every keystroke. */}
      <span className="sr-only" role="status" aria-live="polite">
        {busyLabel ?? label}
      </span>
    </>
  );
}

/** Full-width skeleton row, used by route-level loading UI. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-card border border-line bg-white" />
      ))}
    </div>
  );
}
