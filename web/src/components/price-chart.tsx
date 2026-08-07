/**
 * Price history + forecast chart. Inline SVG, server-rendered, no charting
 * dependency — the app ships no client-side chart library and this is not worth
 * adding one for.
 *
 * The forecast is drawn deliberately unlike the history: a dashed centre line
 * inside a shaded uncertainty band, never a solid line continuing the actual
 * data. A prediction that looks identical to a measurement is a lie told with
 * styling.
 */

export interface ChartHistory {
  period: string;
  value: number;
}

export interface ChartForecast {
  period: string;
  p10: number;
  p50: number;
  p90: number;
}

interface Props {
  history: ChartHistory[];
  forecast: ChartForecast[];
  currencyLabel?: string;
  /** Axis note rendered in the legend when the scale is logarithmic. */
  logAxisLabel?: string;
}

/**
 * Above this ratio between the largest and smallest value, a linear axis stops
 * communicating: one spike takes the whole height and twenty months of real
 * variation flatten onto the baseline. B12 in the demo data does exactly that
 * with a 20x print.
 *
 * Switching to a log axis is not cosmetic here — these prices ARE multiplicative
 * (which is why the model fits in log space), so a log axis shows the data on
 * the scale it actually lives on. Nothing is clipped or smoothed away; the
 * legend says which scale is in use.
 */
const LOG_SCALE_RATIO = 12;

const W = 720;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 30, left: 52 };

export function PriceChart({ history, forecast, currencyLabel = 'USD/kg', logAxisLabel }: Props) {
  if (history.length < 2) return null;

  const periods = [...history.map((h) => h.period), ...forecast.map((f) => f.period)];
  const values = [...history.map((h) => h.value), ...forecast.flatMap((f) => [f.p10, f.p50, f.p90])];

  const positives = values.filter((v) => v > 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const smallest = positives.length ? Math.min(...positives) : 1;
  const useLog = positives.length === values.length && smallest > 0 && max / smallest > LOG_SCALE_RATIO;

  // 8% headroom so the extremes are not welded to the frame; a zero-range
  // series (a genuinely flat price) still needs a non-zero span to divide by.
  const span = max - min || Math.max(max * 0.1, 1);
  const yMin = useLog ? smallest / 1.3 : Math.max(0, min - span * 0.08);
  const yMax = useLog ? max * 1.3 : max + span * 0.08;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (periods.length === 1 ? innerW / 2 : (i / (periods.length - 1)) * innerW);
  const project = (v: number) => (useLog ? Math.log(Math.max(v, yMin)) : v);
  const lo = project(yMin);
  const hi = project(yMax);
  const y = (v: number) => PAD.top + innerH - ((project(v) - lo) / (hi - lo || 1)) * innerH;

  const histPath = history.map((h, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(h.value).toFixed(1)}`).join(' ');

  // The forecast line starts at the last actual point so the join reads as
  // continuous in time without implying the projection is measured.
  const bridge = history.length - 1;
  const fcPath =
    forecast.length > 0
      ? `M${x(bridge).toFixed(1)},${y(history[bridge].value).toFixed(1)} ` +
        forecast.map((f, i) => `L${x(bridge + 1 + i).toFixed(1)},${y(f.p50).toFixed(1)}`).join(' ')
      : '';

  const bandPath =
    forecast.length > 0
      ? [
          `M${x(bridge).toFixed(1)},${y(history[bridge].value).toFixed(1)}`,
          ...forecast.map((f, i) => `L${x(bridge + 1 + i).toFixed(1)},${y(f.p90).toFixed(1)}`),
          ...[...forecast].reverse().map((f, i) => `L${x(periods.length - 1 - i).toFixed(1)},${y(f.p10).toFixed(1)}`),
          'Z',
        ].join(' ')
      : '';

  // On a log axis the midpoint tick has to be the GEOMETRIC mean, or it lands
  // in the wrong place on screen.
  const ticks = [yMin, useLog ? Math.sqrt(yMin * yMax) : (yMin + yMax) / 2, yMax];
  // At most ~6 x labels, otherwise months collide on a phone. The final month
  // is always labelled, but only if it is far enough from the previous label —
  // forcing it unconditionally printed "26-06" over "26-07" at the right edge.
  const labelEvery = Math.max(1, Math.ceil(periods.length / 6));
  const last = periods.length - 1;
  const labelled = new Set<number>();
  for (let i = 0; i < periods.length; i += labelEvery) labelled.add(i);
  if (last - Math.max(...labelled) < Math.ceil(labelEvery / 2)) labelled.delete(Math.max(...labelled));
  labelled.add(last);

  return (
    <figure className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" width="100%" aria-label={`Price history and forecast in ${currencyLabel}`} className="min-w-[520px]">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-current text-[10px] opacity-60">
              {t.toFixed(t < 10 ? 2 : 0)}
            </text>
          </g>
        ))}

        {bandPath && <path d={bandPath} className="fill-brand" fillOpacity={0.13} />}
        {fcPath && <path d={fcPath} className="stroke-brand" strokeWidth={2} strokeDasharray="5 4" fill="none" />}
        <path d={histPath} className="stroke-brand" strokeWidth={2.25} fill="none" />

        {history.map((h, i) => (
          <circle key={h.period} cx={x(i)} cy={y(h.value)} r={2.5} className="fill-brand" />
        ))}

        {periods.map((p, i) =>
          labelled.has(i) ? (
            <text key={p} x={x(i)} y={H - 10} textAnchor="middle" className="fill-current text-[10px] opacity-60">
              {p.slice(2)}
            </text>
          ) : null,
        )}

        {/* Boundary between what happened and what is predicted. */}
        {forecast.length > 0 && (
          <line x1={x(bridge)} x2={x(bridge)} y1={PAD.top} y2={H - PAD.bottom} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="3 3" />
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-brand" /> Observed ({currencyLabel})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-brand" /> Forecast (p50)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 bg-brand/15" /> p10–p90 range
        </span>
        {useLog && <span>{logAxisLabel ?? 'Log scale'}</span>}
      </figcaption>
    </figure>
  );
}
