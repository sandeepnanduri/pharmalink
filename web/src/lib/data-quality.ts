/**
 * How good the curated data is — pure, no DB imports.
 *
 * The importer can put 46 companies on the platform in one upload. Whether that
 * made the catalogue better or merely bigger is a different question, and this
 * module is the one that answers it: what fraction of each record is filled in,
 * how old the last verification is, what is missing a source, and how the price
 * corpus splits by confidence.
 *
 * Nothing here is stored. The template defines an "Outdated (>6 months)"
 * verification status, and a stored status is wrong the day after it is
 * written — `schema.prisma` already forbids a second column holding a fact
 * another column implies. Every number below is computed at read time.
 */

/** Age buckets for `lastVerifiedAt`, in the template's own terms. */
export type FreshnessBucket = 'fresh' | 'ageing' | 'outdated' | 'never';

/**
 * `fresh` ≤90d · `ageing` ≤180d · `outdated` >180d · `never` unverified.
 *
 * 180 days is the template's own "Outdated (>6 months)" line, not a number
 * chosen here.
 */
export function freshness(lastVerifiedAt: Date | null | undefined, now: Date = new Date()): FreshnessBucket {
  if (!lastVerifiedAt) return 'never';
  const days = Math.floor((now.getTime() - lastVerifiedAt.getTime()) / 86_400_000);
  if (days <= 90) return 'fresh';
  if (days <= 180) return 'ageing';
  return 'outdated';
}

export interface Coverage {
  filled: number;
  total: number;
  /** 0–100, rounded. */
  pct: number;
}

/**
 * What share of the fields we care about are actually populated.
 *
 * Counts only the fields passed in, so the caller decides what "complete"
 * means for each entity. A blank string counts as missing — a cell containing
 * a space is not data — and `false` counts as **present**, because "not
 * sterile" is an answer.
 */
export function coverage(values: unknown[]): Coverage {
  const filled = values.filter((v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim() !== '';
    return true;
  }).length;
  return { filled, total: values.length, pct: values.length === 0 ? 0 : Math.round((filled / values.length) * 100) };
}

/** Weighted roll-up, so a company with 40 products counts more than one with 2. */
export function combineCoverage(parts: Coverage[]): Coverage {
  const filled = parts.reduce((n, p) => n + p.filled, 0);
  const total = parts.reduce((n, p) => n + p.total, 0);
  return { filled, total, pct: total === 0 ? 0 : Math.round((filled / total) * 100) };
}

export interface OrgQuality {
  orgId: string;
  name: string;
  country: string;
  /** Ops approval — shown so nobody reads a curation score as an approval. */
  status: string;
  externalId: string | null;
  coverage: Coverage;
  products: number;
  sites: number;
  filings: number;
  contacts: number;
  freshness: FreshnessBucket;
  lastVerifiedAt: Date | null;
  /** Records with no `sourceUrl`: an unsourced claim about a supplier. */
  missingSource: number;
}

/** Sorted worst-first: this is a work queue, not a leaderboard. */
export function rankByQuality(rows: OrgQuality[]): OrgQuality[] {
  const FRESHNESS_RANK: Record<FreshnessBucket, number> = { never: 0, outdated: 1, ageing: 2, fresh: 3 };
  return [...rows].sort(
    (a, b) =>
      a.coverage.pct - b.coverage.pct ||
      FRESHNESS_RANK[a.freshness] - FRESHNESS_RANK[b.freshness] ||
      b.missingSource - a.missingSource ||
      a.name.localeCompare(b.name),
  );
}

export interface DuplicateCandidate {
  a: { id: string; name: string };
  b: { id: string; name: string };
  reason: 'name' | 'fei' | 'gstin';
}

/**
 * Pairs that may be the same company twice.
 *
 * Reported, never merged. Two subsidiaries of one parent genuinely share an
 * address and sometimes a name stem, and auto-merging the wrong Sun Pharma
 * entity is unrecoverable — so this is a verifier's queue, exactly like the
 * importer's `needs-review`.
 *
 * `sameName` is injected rather than imported so this module stays free of the
 * association-matching dependency and testable on its own.
 */
export function findDuplicates(
  orgs: { id: string; name: string; feiNumber: string | null; gstin: string | null }[],
  sameName: (a: string, b: string) => boolean,
): DuplicateCandidate[] {
  const out: DuplicateCandidate[] = [];
  for (let i = 0; i < orgs.length; i += 1) {
    for (let j = i + 1; j < orgs.length; j += 1) {
      const [a, b] = [orgs[i], orgs[j]];
      // A shared registration number is a much stronger signal than a similar
      // name, so it is reported as its own reason rather than lumped together.
      const reason: DuplicateCandidate['reason'] | null =
        a.feiNumber && a.feiNumber === b.feiNumber
          ? 'fei'
          : a.gstin && a.gstin === b.gstin
            ? 'gstin'
            : sameName(a.name, b.name)
              ? 'name'
              : null;
      if (reason) out.push({ a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, reason });
    }
  }
  return out;
}
