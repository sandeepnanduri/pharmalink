import { NextResponse } from 'next/server';
import { findMatches } from '@/lib/actions';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';

/**
 * Preview the rule-based match for an RFQ before broadcasting (F4.2).
 * Gated: only a verified buyer may enumerate matching suppliers.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !can(user.principal, 'rfq:create')) {
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
