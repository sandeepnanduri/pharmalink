'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { isAtLimit } from '@/lib/plans';
import { getMembership, getSeatUsage } from '@/lib/team-queries';

export type TeamState = { error?: string; ok?: boolean };

async function audit(action: string, entityId: string, actorId?: string) {
  await prisma.auditLog.create({ data: { action, entity: 'User', entityId, actorId: actorId ?? null } });
}

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  password: z.string().min(8).max(200),
});

/** Org owner adds a teammate (same org + trading capability), within seat limits. */
export async function inviteTeammateAction(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const actor = await currentUser();
  if (!actor) return { error: 'unauthorized' };
  const me = await getMembership(actor.id);
  if (!me?.orgId || me.orgRole !== 'owner') return { error: 'notOwner' };

  const org = await prisma.organization.findUnique({ where: { id: me.orgId }, select: { plan: true } });
  const used = await getSeatUsage(me.orgId);
  if (isAtLimit(org?.plan, 'seats', used)) return { error: 'seatLimit' };

  const parsed = InviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const p = parsed.error.issues[0].path[0];
    return { error: p === 'password' ? 'weakPassword' : p === 'email' ? 'invalidEmail' : 'error' };
  }
  const email = parsed.data.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return { error: 'emailTaken' };

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: me.role, // teammate trades with the same capability as the org
      orgRole: 'member',
      orgId: me.orgId,
      emailVerified: new Date(),
      consentTermsAt: new Date(),
      consentPrivacyAt: new Date(),
    },
  });
  await audit('team.invited', user.id, actor.id);
  revalidatePath('/[locale]/account/team', 'page');
  return { ok: true };
}

/** Owner deactivates/reactivates a member. Cannot touch self or another owner. */
export async function setTeammateActiveAction(formData: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) return;
  const me = await getMembership(actor.id);
  if (!me?.orgId || me.orgRole !== 'owner') return;

  const userId = String(formData.get('userId') ?? '');
  if (userId === actor.id) return; // not self
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { orgId: true, orgRole: true, active: true } });
  if (!target || target.orgId !== me.orgId || target.orgRole === 'owner') return; // same org, members only

  await prisma.user.update({ where: { id: userId }, data: { active: !target.active } });
  await audit(target.active ? 'team.deactivated' : 'team.reactivated', userId, actor.id);
  revalidatePath('/[locale]/account/team', 'page');
}
