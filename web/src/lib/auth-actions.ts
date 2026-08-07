'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import type { ActionState } from '@/lib/actions';

/** Credentials sign-in. NextAuth signals success by throwing a redirect, so we rethrow. */
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const locale = String(formData.get('locale') ?? 'en');
  try {
    await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirectTo: `/${locale}`,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) return { error: 'invalidCredentials' };
    throw error; // NEXT_REDIRECT — must propagate
  }
}

export async function ssoAction(formData: FormData): Promise<void> {
  const provider = String(formData.get('provider') ?? '');
  const locale = String(formData.get('locale') ?? 'en');
  // Carry the role the visitor picked on the signup page through the OAuth
  // round-trip. Google returns only an email + name, so without this the choice
  // is lost and account setup has to ask for it a second time.
  const role = String(formData.get('role') ?? '');
  const intent = ['buyer', 'seller', 'both'].includes(role)
    ? `/${locale}/onboarding/account?role=${role}`
    : `/${locale}`;
  await signIn(provider, { redirectTo: intent });
}
