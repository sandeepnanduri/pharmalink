import { setRequestLocale } from 'next-intl/server';
import { googleEnabled, samlEnabled } from '@/auth';
import { SignupForm } from '@/components/signup-form';

// Reads live provider config — must not be cached into a static shell.
export const dynamic = 'force-dynamic';

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SignupForm googleReady={googleEnabled()} samlReady={samlEnabled()} />;
}
