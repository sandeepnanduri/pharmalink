import 'server-only';
import { prisma } from '@/lib/db';
import { assertSafeUrl } from '@/lib/net-guard.server';
import { ASSOCIATION_HOSTS, association, parseMemberList, sameCompany, type Association, type ParsedMember } from '@/lib/associations';
import { domainFrom } from '@/lib/logo';

/**
 * Association member import — the fetching half.
 *
 * Three safeguards, each protecting something different:
 *
 *  1. **Host allowlist + SSRF guard.** The URL is ours, not a user's, but a
 *     connector is exactly the code that grows a "configurable endpoint" later.
 *  2. **Imported organisations land as `draft`, never `verified`.** Association
 *     membership evidences that a company exists and pays a subscription. It is
 *     not a GMP certificate, and the ops queue must still see every one.
 *  3. **Deduplication against existing organisations.** A supplier who already
 *     signed up must not reappear as a scraped shell record — the import
 *     annotates the existing org instead of creating a rival.
 */

const FETCH_TIMEOUT_MS = 25_000;
const MAX_BYTES = 4 * 1024 * 1024;
const THROTTLE_MS = 1_500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(rawUrl: string): Promise<string> {
  const url = await assertSafeUrl(rawUrl, { schemes: ['https:'], defaultPortOnly: true });
  if (!url) throw new Error(`refused unsafe url: ${rawUrl}`);
  if (!ASSOCIATION_HOSTS.includes(url.hostname)) throw new Error(`host not in the association allowlist: ${url.hostname}`);

  const res = await fetch(url, {
    redirect: 'error',
    headers: { accept: 'text/html', 'user-agent': 'PharmaLink-AssociationImport/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${url.hostname} returned ${res.status}`);

  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('response too large');
  return text;
}

export interface ImportSummary {
  association: string;
  status: 'ok' | 'failed';
  found: number;
  created: number;
  linked: number;
  skipped: number;
  error?: string;
  /** Names that matched an existing organisation, for the operator to review. */
  linkedNames: string[];
}

/**
 * Imports one association's member register.
 *
 * `dryRun` is the default for a reason: an operator should see what an import
 * WOULD create before it creates it. A directory import that silently adds two
 * hundred shell organisations is very hard to unpick afterwards.
 */
export async function importAssociation(id: string, opts: { dryRun?: boolean } = {}): Promise<ImportSummary> {
  const assoc = association(id);
  if (!assoc) return { association: id, status: 'failed', found: 0, created: 0, linked: 0, skipped: 0, error: 'unknown association', linkedNames: [] };

  const dryRun = opts.dryRun ?? true;
  const run = await prisma.ingestRun.create({ data: { source: `assoc:${assoc.id}${dryRun ? ':dry' : ''}` } });

  try {
    const html = await fetchHtml(assoc.membersUrl);
    const members = parseMemberList(html, assoc);
    const summary = await persist(assoc, members, dryRun);

    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { status: 'ok', fetched: members.length, inserted: summary.created, skipped: summary.skipped, finishedAt: new Date() },
    });
    return summary;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.ingestRun.update({ where: { id: run.id }, data: { status: 'failed', error: error.slice(0, 500), finishedAt: new Date() } });
    return { association: assoc.id, status: 'failed', found: 0, created: 0, linked: 0, skipped: 0, error, linkedNames: [] };
  }
}

async function persist(assoc: Association, members: ParsedMember[], dryRun: boolean): Promise<ImportSummary> {
  // Load once and match in memory: `sameCompany` is fuzzy, so it cannot be
  // expressed as a WHERE clause, and one query per member would be N+1.
  const existing = await prisma.organization.findMany({ select: { id: true, name: true, associations: true } });

  let created = 0;
  let linked = 0;
  let skipped = 0;
  const linkedNames: string[] = [];

  for (const m of members) {
    const match = existing.find((o) => sameCompany(o.name, m.name));

    if (match) {
      linked++;
      linkedNames.push(m.name);
      if (!dryRun) {
        const tags = new Set((match.associations ?? '').split(',').map((s) => s.trim()).filter(Boolean));
        if (!tags.has(assoc.name)) {
          tags.add(assoc.name);
          await prisma.organization.update({ where: { id: match.id }, data: { associations: [...tags].join(',') } });
        }
      }
      continue;
    }

    if (!m.name || m.name.length < 4) {
      skipped++;
      continue;
    }

    created++;
    if (!dryRun) {
      const domain = domainFrom(m.website);
      await prisma.organization.create({
        data: {
          name: m.name,
          kind: 'seller',
          // DRAFT, always. Membership is not verification — see the file header.
          status: 'draft',
          country: assoc.id === 'ipa' || assoc.id === 'bdma' ? 'India' : 'India',
          city: m.city,
          website: domain ? `https://${domain}` : null,
          associations: assoc.name,
          about: `Imported from the ${assoc.fullName} member register. ${assoc.evidences}`,
        },
      });
      // Newly created rows must be visible to subsequent `sameCompany` checks
      // within the same run, or a member listed twice creates two records.
      existing.push({ id: 'pending', name: m.name, associations: assoc.name });
    }
  }

  return { association: assoc.id, status: 'ok', found: members.length, created, linked, skipped, linkedNames: linkedNames.slice(0, 25) };
}

/** Runs every association in sequence, pausing between hosts. */
export async function importAllAssociations(opts: { dryRun?: boolean } = {}): Promise<ImportSummary[]> {
  const out: ImportSummary[] = [];
  for (const id of ['bdma', 'pharmexcil', 'ipa']) {
    out.push(await importAssociation(id, opts));
    await sleep(THROTTLE_MS);
  }
  return out;
}
