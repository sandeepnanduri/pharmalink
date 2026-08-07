'use client';

import { useState } from 'react';
import type { FilterSection, ParsedFilters } from '@/lib/filters';

/**
 * The catalogue filter rail.
 *
 * Three decisions worth naming:
 *
 *  1. **Every section shows what backs it.** "Verified" means ops or an external
 *     feed checked it; "supplier-stated" means they typed it. A buyer filtering
 *     on purity is entitled to know nobody independently measured it.
 *  2. **It is a plain form that submits.** No client-side fetching, so results
 *     are shareable and bookmarkable by URL, work with the back button, and
 *     survive JavaScript failing to load.
 *  3. **Advanced sections start collapsed.** Seventeen sections expanded is a
 *     wall; the six a buyer usually needs are open, the long tail is one click
 *     away, and the count of active filters inside a collapsed section is shown
 *     so nothing hides.
 */

const BACKING_LABEL = {
  verified: { text: 'Verified', cls: 'bg-ok-pale text-ok' },
  declared: { text: 'Supplier-stated', cls: 'bg-warn-pale text-warn' },
  derived: { text: 'Computed', cls: 'bg-accent-pale text-accent-dark' },
} as const;

function Backing({ kind }: { kind: FilterSection['backing'] }) {
  const b = BACKING_LABEL[kind];
  return <span className={`rounded-pill px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${b.cls}`}>{b.text}</span>;
}

export function FilterRail({
  sections,
  filters,
  counts,
  activeTotal,
}: {
  sections: FilterSection[];
  filters: ParsedFilters;
  counts: { certs: Record<string, number>; countries: Record<string, number>; types: Record<string, number> };
  activeTotal: number;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const selected = (key: string): string[] => {
    const v = (filters as unknown as Record<string, unknown>)[key];
    return Array.isArray(v) ? (v as string[]) : [];
  };

  const countFor = (key: string, value: string): number | null => {
    if (key === 'cert') return counts.certs[value] ?? 0;
    if (key === 'country') return counts.countries[value] ?? 0;
    if (key === 'type') return counts.types[value] ?? 0;
    return null;
  };

  /** How many filters are set inside a section — shown when it is collapsed. */
  const activeIn = (s: FilterSection): number => {
    if (s.kind === 'multi') return selected(s.key).length;
    if (s.kind === 'toggle') return (filters as unknown as Record<string, unknown>)[s.key] ? 1 : 0;
    if (s.kind === 'range') {
      const keys = s.key === 'price' ? ['priceMin', 'priceMax'] : [`${s.key}Min`, `${s.key}Max`];
      return keys.filter((k) => (filters as unknown as Record<string, unknown>)[k] != null).length;
    }
    return 0;
  };

  return (
    <div className="space-y-1" data-testid="filter-rail">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold">Filters</h2>
        {activeTotal > 0 && (
          <a href="?" className="text-xs font-semibold text-brand hover:underline" data-testid="clear-filters">
            Clear all ({activeTotal})
          </a>
        )}
      </div>

      {sections.map((s) => {
        const isOpen = open[s.key] ?? !s.advanced;
        const active = activeIn(s);
        return (
          <section key={s.key} className="border-b border-line py-3 last:border-0" data-testid={`filter-${s.key}`}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [s.key]: !isOpen }))}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 text-left"
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate2">{s.label}</span>
              {active > 0 && !isOpen && (
                <span className="rounded-pill bg-brand-pale px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand">{active}</span>
              )}
              <Backing kind={s.backing} />
              <svg
                className={`ml-auto h-3.5 w-3.5 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {isOpen && (
              <div className="mt-2">
                {s.why && <p className="mb-2 text-[11px] leading-relaxed text-muted">{s.why}</p>}

                {s.kind === 'multi' && s.options && (
                  <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
                    {s.options.map((o) => {
                      const n = countFor(s.key, o.value);
                      return (
                        <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded-control px-1 py-1 hover:bg-mist">
                          <input
                            type="checkbox"
                            name={s.key}
                            value={o.value}
                            defaultChecked={selected(s.key).includes(o.value)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] leading-snug text-slate2">{o.label}</span>
                            {o.note && <span className="block text-[10.5px] leading-snug text-muted">{o.note}</span>}
                          </span>
                          {n != null && <span className="shrink-0 font-mono text-[10.5px] text-muted">{n}</span>}
                        </label>
                      );
                    })}
                  </div>
                )}

                {s.kind === 'toggle' && (
                  <label className="flex cursor-pointer items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      name={s.key}
                      value="1"
                      defaultChecked={Boolean((filters as unknown as Record<string, unknown>)[s.key])}
                      className="h-4 w-4 accent-brand"
                    />
                    <span className="text-[12.5px] text-slate2">Only show these</span>
                  </label>
                )}

                {s.kind === 'range' && (
                  <div className="flex items-center gap-2">
                    {s.key === 'price' ? (
                      <>
                        <input name="priceMin" type="number" min={0} placeholder="Min" defaultValue={filters.priceMin ?? ''} className="input !py-1.5 text-xs" />
                        <span className="text-xs text-muted">–</span>
                        <input name="priceMax" type="number" min={0} placeholder="Max" defaultValue={filters.priceMax ?? ''} className="input !py-1.5 text-xs" />
                      </>
                    ) : (
                      <input
                        name={s.key === 'purity' ? 'purityMin' : s.key === 'moq' ? 'moqMax' : s.key === 'leadTime' ? 'leadTimeMax' : 'matchMin'}
                        type="number"
                        min={0}
                        placeholder={s.key === 'purity' ? 'Minimum' : 'Maximum'}
                        defaultValue={
                          (s.key === 'purity' ? filters.purityMin : s.key === 'moq' ? filters.moqMax : s.key === 'leadTime' ? filters.leadTimeMax : filters.matchMin) ?? ''
                        }
                        className="input !py-1.5 text-xs"
                      />
                    )}
                    {s.unit && <span className="shrink-0 text-[11px] text-muted">{s.unit}</span>}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      <button type="submit" className="btn-primary mt-4 w-full" data-testid="apply-filters">
        Apply filters
      </button>
    </div>
  );
}
