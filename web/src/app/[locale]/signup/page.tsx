import { setRequestLocale } from 'next-intl/server';
import { googleEnabled, samlEnabled } from '@/auth';
import { SignupForm } from '@/components/signup-form';

// Reads live provider config — must not be cached into a static shell.
export const dynamic = 'force-dynamic';

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { locale } = await params;
  const { ref } = await searchParams;
  setRequestLocale(locale);

  return <SignupForm googleReady={googleEnabled()} samlReady={samlEnabled()} partnerCode={ref?.trim() || undefined} />;
}
