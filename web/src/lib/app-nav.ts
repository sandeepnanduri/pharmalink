import { canBuy, canSell, isPlatformRole, type Permission, type Principal, type Role } from '@/lib/rbac';
import { can } from '@/lib/rbac';

/**
 * The signed-in navigation, for every role, in one place.
 *
 * Previously this lived as an if-ladder inside `site-header.tsx`, which meant
 * the ops console and the trading app each grew their own copy. One model, two
 * consumers: the shell renders it, and nothing else decides what a role may
 * open.
 *
 * Grouped rather than flat because the console rail has section labels — and
 * because the grouping says something true about the work: sourcing is not
 * trading is not administration.
 *
 * **Every item is permission-filtered.** A link that redirects the moment it is
 * clicked is worse than an absent one: it teaches people the navigation lies.
 */

export type NavIcon =
  | 'dashboard'
  | 'shield'
  | 'cube'
  | 'book'
  | 'users'
  | 'chart'
  | 'upload'
  | 'search'
  | 'rfq'
  | 'orders'
  | 'bookmark'
  | 'factory'
  | 'account'
  | 'billing';

export interface NavItem {
  href: string;
  /** Key into the `nav` message namespace. */
  labelKey: string;
  icon: NavIcon;
  /** A live count, e.g. organisations awaiting review. */
  count?: number;
}

export interface NavGroup {
  /** Key into the `nav` message namespace. */
  labelKey: string;
  items: NavItem[];
}

export interface NavContext {
  role: Role;
  principal: Principal;
  /** Organisations waiting on a verifier — the one count worth carrying. */
  pendingVerifications?: number;
}

const allow = (principal: Principal, permission: Permission, items: NavItem[]): NavItem[] =>
  can(principal, permission) ? items : [];

/** The ops console: three groups, each gated on the narrow staff permission it needs. */
function staffGroups(ctx: NavContext): NavGroup[] {
  return [
    {
      labelKey: 'groupOverview',
      items: allow(ctx.principal, 'admin:verify', [
        { href: '/admin', labelKey: 'verification', icon: 'shield', count: ctx.pendingVerifications },
      ]),
    },
    {
      labelKey: 'groupMarketplace',
      items: allow(ctx.principal, 'admin:moderate', [
        { href: '/admin/products', labelKey: 'moderation', icon: 'cube' },
        { href: '/admin/news', labelKey: 'news', icon: 'book' },
        { href: '/admin/market-data', labelKey: 'marketData', icon: 'chart' },
        { href: '/admin/imports', labelKey: 'dataImport', icon: 'upload' },
      ]),
    },
    {
      labelKey: 'groupAdministration',
      items: [
        ...allow(ctx.principal, 'admin:users', [{ href: '/admin/users', labelKey: 'users', icon: 'users' }]),
        // Staff manage their own profile and password like anyone else.
        { href: '/account', labelKey: 'account', icon: 'account' },
      ],
    },
  ];
}

/** Buyers and suppliers. A "both" org sees sourcing and supply, in that order. */
function tradingGroups(ctx: NavContext): NavGroup[] {
  const groups: NavGroup[] = [];

  if (canBuy(ctx.role)) {
    groups.push({
      labelKey: 'groupSourcing',
      items: [
        { href: '/catalog', labelKey: 'marketplace', icon: 'search' },
        { href: '/buyer', labelKey: 'dashboard', icon: 'dashboard' },
        { href: '/buyer/rfqs', labelKey: 'rfqs', icon: 'rfq' },
        { href: '/buyer/saved', labelKey: 'saved', icon: 'bookmark' },
      ],
    });
  }

  if (canSell(ctx.role)) {
    groups.push({
      labelKey: 'groupSupply',
      items: [
        // A supplier who also buys already has a dashboard above, so theirs is
        // labelled by what it actually contains.
        { href: '/seller', labelKey: canBuy(ctx.role) ? 'inquiries' : 'dashboard', icon: 'dashboard' },
        { href: '/seller/products', labelKey: 'products', icon: 'cube' },
        { href: '/seller/facilities', labelKey: 'facilities', icon: 'factory' },
        { href: '/seller/filings', labelKey: 'filings', icon: 'shield' },
      ],
    });
  }

  groups.push({
    labelKey: 'groupTrade',
    items: [
      { href: '/orders', labelKey: 'orders', icon: 'orders' },
      { href: '/compliance', labelKey: 'compliance', icon: 'shield' },
      { href: '/analytics', labelKey: 'analytics', icon: 'chart' },
    ],
  });

  groups.push({
    labelKey: 'groupAccount',
    items: [
      { href: '/account', labelKey: 'account', icon: 'account' },
      { href: '/billing', labelKey: 'billing', icon: 'billing' },
    ],
  });

  return groups;
}

export function navGroups(ctx: NavContext): NavGroup[] {
  const groups = isPlatformRole(ctx.role) ? staffGroups(ctx) : tradingGroups(ctx);
  // An empty group would render a section heading over nothing.
  return groups.filter((g) => g.items.length > 0);
}

/** What the breadcrumb calls this workspace. */
export function consoleKey(role: Role): string {
  if (isPlatformRole(role)) return 'consoleOps';
  return canSell(role) && !canBuy(role) ? 'consoleSupplier' : 'consoleBuyer';
}
