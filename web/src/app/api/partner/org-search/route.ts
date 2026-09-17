import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { searchVerifiedOrgs } from '@/lib/partner-queries';

/**
 * Counterparty picker for deal registration (partner-network.tsx) — a
 * partner searching for the "other side" org when registering a deal.
 * Gated on partner:draft, the same permission createRfqAction/
 * submitQuoteAction already require for any delegated action.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !can(user.principal, 'partner:draft')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind');
  const q = (searchParams.get('q') ?? '').trim();
  if (kind !== 'buyer' && kind !== 'seller') return NextResponse.json([]);

  const results = await searchVerifiedOrgs(kind, q);
  return NextResponse.json(results);
}
