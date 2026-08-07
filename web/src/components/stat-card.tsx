export function StatCard({ label, value, hint, testId }: { label: string; value: string | number; hint?: string; testId?: string }) {
  return (
    <div className="card" data-testid={testId}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 font-display text-3xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
