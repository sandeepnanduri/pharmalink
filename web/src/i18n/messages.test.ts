import { describe, it, expect } from 'vitest';
import en from '../../messages/en.json';
import zh from '../../messages/zh.json';

// Arrays are legitimate catalogue values (the legal documents hold a list of
// sections). Object.entries walks them by index, so a section added in one
// locale but not the other shows up as a missing key like `…sections.7.h`.
type JsonValue = string | JsonObject | JsonValue[];
interface JsonObject {
  [k: string]: JsonValue;
}
type Json = JsonObject | JsonValue[];

/** Flattens a nested message catalogue into dotted key paths. */
function keyPaths(obj: Json, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? [path] : keyPaths(v as Json, path);
  });
}

/** Extracts {placeholder} names, ignoring ICU plural bodies. */
function placeholders(value: string): Set<string> {
  const out = new Set<string>();
  const re = /\{(\w+)(?:,|\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) out.add(m[1]);
  return out;
}

function flatten(obj: Json, prefix = ''): Record<string, string> {
  const acc: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') acc[path] = v;
    else Object.assign(acc, flatten(v as Json, path));
  }
  return acc;
}

const enKeys = keyPaths(en as unknown as Json).sort();
const zhKeys = keyPaths(zh as unknown as Json).sort();
const enFlat = flatten(en as unknown as Json);
const zhFlat = flatten(zh as unknown as Json);

describe('i18n catalogue parity (en ⇄ zh)', () => {
  it('has at least one key', () => {
    expect(enKeys.length).toBeGreaterThan(50);
  });

  it('zh is not missing any key present in en', () => {
    const missing = enKeys.filter((k) => !zhKeys.includes(k));
    expect(missing, `Missing Chinese translations for: ${missing.join(', ')}`).toEqual([]);
  });

  it('zh has no extra keys absent from en', () => {
    const extra = zhKeys.filter((k) => !enKeys.includes(k));
    expect(extra, `Chinese has orphan keys: ${extra.join(', ')}`).toEqual([]);
  });

  it('no message is left untranslated (identical to English) except brand names', () => {
    // Strings with nothing in them to translate: a product name, or a company
    // name followed by a licence number. Translating "Rheinwerk Chemie ·
    // EU-WDA/DE-4471" would mean inventing a Chinese name for a German company
    // and mangling the identifier a reader would check it against.
    const allowIdentical = new Set(['brand.name', 'home.d2Meta']);
    const untranslated = enKeys.filter(
      (k) => !allowIdentical.has(k) && enFlat[k] === zhFlat[k] && /[a-zA-Z]{4,}/.test(enFlat[k])
    );
    expect(untranslated, `Appears untranslated in zh: ${untranslated.join(', ')}`).toEqual([]);
  });

  it('placeholders match between locales', () => {
    const mismatches: string[] = [];
    for (const k of enKeys) {
      const a = placeholders(enFlat[k]);
      const b = placeholders(zhFlat[k] ?? '');
      if (a.size !== b.size || [...a].some((p) => !b.has(p))) {
        mismatches.push(`${k}: en{${[...a]}} vs zh{${[...b]}}`);
      }
    }
    expect(mismatches, `Placeholder mismatch: ${mismatches.join(' | ')}`).toEqual([]);
  });
});
