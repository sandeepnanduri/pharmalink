'use client';

import { useLocale } from 'next-intl';
import type { SpecField, SpecGroup } from '@/lib/product-spec';

/**
 * The write-side twin of `<SpecTable>`, over the same registry.
 *
 * A 90-column product form is not fifteen more `<input>` tags copied into a
 * modal — it is a data structure. Rendering it from the registry is what stops
 * the form drifting from the action again: `saveProductAction` iterates the
 * same list, so a field cannot exist in one and not the other.
 *
 * Deliberately anchored sections on one page rather than tabs. Tabs hide
 * required fields behind a click and break browser find-in-page, which matters
 * exactly when a supplier is reconciling a listing against a spreadsheet.
 */

function inputFor(field: SpecField, value: string | undefined, zh: boolean) {
  const label = zh ? field.labelZh : field.label;
  const id = `spec-${field.key}`;
  const common = { id, name: field.key, className: 'input', 'data-testid': id, defaultValue: value ?? '' };

  if (field.kind === 'bool') {
    return (
      <select {...common} aria-label={label}>
        {/* Empty is a real, distinct answer: unknown is not "no". Storing false
            where the supplier simply has not said would exclude them from a
            dietary-compliance filter they might well pass. */}
        <option value="">—</option>
        <option value="yes">{zh ? '是' : 'Yes'}</option>
        <option value="no">{zh ? '否' : 'No'}</option>
      </select>
    );
  }

  if (field.kind === 'longtext') {
    return <textarea {...common} rows={2} placeholder={field.hint} />;
  }

  return (
    <input
      {...common}
      type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
      step={field.kind === 'number' ? 'any' : undefined}
      placeholder={field.hint}
    />
  );
}

export function FieldGroup({ group, values }: { group: SpecGroup; values: Record<string, string | undefined> }) {
  const zh = useLocale() === 'zh';

  return (
    <section id={`group-${group.id}`} className="scroll-mt-24" data-testid={`field-group-${group.id}`}>
      <h2 className="mb-3 text-sm font-bold text-ink">{zh ? group.labelZh : group.label}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {group.fields.map((field) => (
          <div key={field.key} className={field.kind === 'longtext' ? 'sm:col-span-2' : undefined}>
            <label className="label" htmlFor={`spec-${field.key}`}>
              {zh ? field.labelZh : field.label}
              {field.unit ? <span className="ml-1 font-normal text-muted">({field.unit})</span> : null}
            </label>
            {inputFor(field, values[field.key], zh)}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The left rail: one link per group with its own completeness, so a supplier
 * can see where the gaps are instead of scrolling a 140-field form to find out.
 */
export function GroupNav({
  groups,
  counts,
}: {
  groups: SpecGroup[];
  counts: Record<string, { filled: number; total: number }>;
}) {
  const zh = useLocale() === 'zh';
  return (
    <nav className="sticky top-24 space-y-0.5 text-sm" data-testid="spec-group-nav">
      {groups.map((g) => {
        const c = counts[g.id] ?? { filled: 0, total: g.fields.length };
        const done = c.total > 0 && c.filled === c.total;
        return (
          <a
            key={g.id}
            href={`#group-${g.id}`}
            className="flex items-center justify-between gap-2 rounded-control px-2.5 py-1.5 hover:bg-mist"
          >
            <span className="truncate">{zh ? g.labelZh : g.label}</span>
            <span className={`shrink-0 font-mono text-xs ${done ? 'text-ok' : 'text-muted'}`}>
              {c.filled}/{c.total}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
