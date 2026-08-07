/**
 * Capsule loader — the app's progress animation.
 *
 * A two-tone capsule that separates, spins and rejoins. Chosen over a generic
 * spinner because it reads as "pharma" instantly and, more usefully, because
 * its cycle has a visible beginning and end: a ring that spins forever gives no
 * sense of progress, whereas a capsule that opens and closes feels like work
 * being done in passes.
 *
 * Respects prefers-reduced-motion — the animation is suppressed in CSS and the
 * capsule simply pulses instead. See globals.css.
 */

export type CapsuleSize = 'sm' | 'md' | 'lg';

const SIZES: Record<CapsuleSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

/**
 * The mark on its own. Inline (button-sized) by default.
 * Decorative: callers own the accessible status text.
 */
export function Capsule({ size = 'sm', className = '' }: { size?: CapsuleSize; className?: string }) {
  return (
    <span
      className={`pl-capsule ${SIZES[size]} ${className}`}
      aria-hidden="true"
      data-testid="capsule-loader"
    >
      {/* Two halves of one capsule: they part, rotate, and meet again. */}
      <span className="pl-capsule-half pl-capsule-top" />
      <span className="pl-capsule-half pl-capsule-bottom" />
    </span>
  );
}

/**
 * Block-level loader for a page or panel that is still fetching.
 * `label` is announced politely so screen-reader users hear the same thing
 * sighted users see.
 */
export function CapsuleLoader({
  label,
  size = 'md',
  className = '',
}: {
  label: string;
  size?: CapsuleSize;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-10 ${className}`}>
      <Capsule size={size} />
      <p className="text-xs font-semibold text-muted">{label}</p>
      <span className="sr-only" role="status" aria-live="polite">
        {label}
      </span>
    </div>
  );
}
