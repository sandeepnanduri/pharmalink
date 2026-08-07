import { setRequestLocale } from 'next-intl/server';
import { googleEnabled, samlEnabled } from '@/auth';
import { LoginForm } from '@/components/login-form';

// Reads live provider config — must not be cached into a static shell.
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Sent here from signup after "this email already exists" — prefill it.
  const initialEmail = (await searchParams).email ?? '';

  // Single source of truth: whether a provider is *actually* registered in
  // src/auth.ts. No NEXT_PUBLIC_* mirror to drift out of sync.
  return <LoginForm googleReady={googleEnabled()} samlReady={samlEnabled()} initialEmail={initialEmail} />;
}
