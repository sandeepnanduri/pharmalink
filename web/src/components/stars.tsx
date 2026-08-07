/**
 * Read-only star rating. Renders the real average (0 shows "No reviews yet"),
 * never a fabricated score. Server component — no client JS.
 */
export function Stars({ average, count, size = 'sm' }: { average: number; count: number; size?: 'sm' | 'lg' }) {
  const full = Math.round(average);
  const cls = size === 'lg' ? 'text-lg' : 'text-sm';
  if (count === 0) {
    return <span className={`text-muted ${cls === 'text-lg' ? 'text-sm' : 'text-xs'}`}>No reviews yet</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 ${cls}`} aria-label={`${average} out of 5, ${count} reviews`}>
      <span className="text-amber-500" aria-hidden>
        {'★'.repeat(full)}
        <span className="text-slate-300">{'★'.repeat(5 - full)}</span>
      </span>
      <span className="font-semibold tabular-nums">{average.toFixed(1)}</span>
      <span className="text-muted">({count})</span>
    </span>
  );
}
