import { NextResponse } from 'next/server';
import { findMatches } from '@/lib/actions';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';

/**
 * Preview the rule-based match for an RFQ before broadcasting (F4.2).
 * Gated: only a verified buyer, OR a Sourcing Partner drafting on a
 * represented buyer's behalf, may enumerate matching suppliers — the same
 * dual-path createRfqAction itself already checks (lib/actions.ts:
 * can(...,'rfq:create') for a direct post, can(...,'partner:draft') for a
 * delegated one). This preview endpoint was missed when that delegation was
 * built, so a partner's wizard always showed zero matches and the broadcast
 * button stayed permanently disabled — found by actually completing the
 * wizard end-to-end as a partner, not by code review alone.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !(can(user.principal, 'rfq:create') || can(user.principal, 'partner:draft'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cas = (searchParams.get('cas') ?? '').trim();
  if (!cas) return NextResponse.json([]);

  const certs = searchParams.getAll('cert').filter(Boolean);
  const matches = await findMatches(cas, certs);

  return NextResponse.json(
    matches.map((m) => ({ id: m.id, name: m.name, city: m.city, country: m.country }))
  );
}
