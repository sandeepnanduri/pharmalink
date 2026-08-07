import { prisma } from '@/lib/db';

/** Users belonging to an organization (the team), owners first. */
export async function getOrgMembers(orgId: string) {
  return prisma.user.findMany({
    where: { orgId },
    orderBy: [{ orgRole: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, email: true, name: true, role: true, orgRole: true, active: true, lastLoginAt: true },
  });
}

/** Count of active seats currently used by an org. */
export async function getSeatUsage(orgId: string): Promise<number> {
  return prisma.user.count({ where: { orgId, active: true } });
}

/** The caller's org membership (orgRole + orgId + role), for authorization. */
export async function getMembership(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { orgRole: true, orgId: true, role: true } });
}
