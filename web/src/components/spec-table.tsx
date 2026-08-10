import { getLocale } from 'next-intl/server';
import { formatTemplateDate } from '@/lib/dates';
import { groupsFor, parseSpec, type SpecField, type SpecValues } from '@/lib/product-spec';
import type { ProductType } from '@/lib/taxonomy';

/**
 * Registry-driven specification sheet.
 *
 * Product detail, the catalogue card and the compare table each hand-rolled
 * their own `<dl>` against a hard-coded list of six or seven fields. With ~140
 * fields across four product shapes that does not scale, and it is how the
 * detail page came to omit two-thirds of what the schema already held.
 *
 * Everything here comes from `src/lib/product-spec.ts`: which groups apply to
 * this segment, which fields apply within them, their labels in both locales,
 * their units, and whether the value lives in a column or in `specJson`. Adding
 * a field to the registry makes it appear here, in the seller form, in the
 * importer and in the export, with no change to this file.
 *
 * A group with nothing filled in is not rendered. A spec sheet padded with
 * twenty em dashes reads as "this supplier told us nothing" even when they told
 * us plenty about the fields that matter for their segment.
 */

export interface SpecTableProps {
  productType: string;
  /** The `Product` row — real columns are read from here by key. */
  columns: Record<string, unknown>;
  /** Raw `Product.specJson`; parsed and filtered against the registry. */
  specJson?: string | null;
  /**
   * Show groups that are entirely empty, with every field as an em dash.
   * The seller's own view wants this (it is a to-do list); a buyer's does not.
   */
  showEmpty?: boolean;
}

function formatValue(field: SpecField, value: unknown, locale: string): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (field.kind === 'bool') {
    if (typeof value !== 'boolean') return String(value);
    // Tri-state: null already returned above, so this is a real yes or no.
    return value ? (locale === 'zh' ? '是' : 'Yes') : locale === 'zh' ? '否' : 'No';
  }

  if (field.kind === 'date') {
    const d = value instanceof Date ? value : new Date(String(value));
    // Template format, deliberately not `getFormatter()`: this is a
    // specification value that must read the same as the document it came from,
    // and must survive a round-trip through the export in any locale.
    return Number.isNaN(d.getTime()) ? String(value) : formatTemplateDate(d);
  }

  if (field.kind === 'list') {
    return String(value)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' · ');
  }

  return String(value);
}

export async function SpecTable({ productType, columns, specJson, showEmpty = false }: SpecTableProps) {
  const locale = await getLocale();
  const zh = locale === 'zh';
  const spec: SpecValues = parseSpec(specJson);
  const groups = groupsFor(productType as ProductType);

  const rendered = groups
    .map((group) => ({
      group,
      rows: group.fields
        .map((field) => ({
          field,
          text: formatValue(field, field.column ? columns[field.key] : spec[field.key], locale),
        }))
        .filter((r) => showEmpty || r.text !== null),
    }))
    .filter((g) => g.rows.length > 0);

  if (rendered.length === 0) return null;

  return (
    <div className="space-y-6" data-testid="spec-table">
      {rendered.map(({ group, rows }) => (
        <section key={group.id} data-testid={`spec-group-${group.id}`}>
          <h3 className="mb-2.5 text-sm font-bold text-ink">{zh ? group.labelZh : group.label}</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ field, text }) => (
              <div
                key={field.key}
                // A long value gets the full width rather than being squeezed
                // into a third of a row and truncated.
                className={field.kind === 'longtext' ? 'sm:col-span-2 lg:col-span-3' : undefined}
                data-testid={`spec-${field.key}`}
              >
                <dt className="text-xs text-muted">{zh ? field.labelZh : field.label}</dt>
                <dd className="mt-0.5 break-words text-sm font-semibold">
                  {text ?? <span className="font-normal text-muted">—</span>}
                  {text && field.unit ? <span className="ml-1 font-normal text-muted">{field.unit}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
