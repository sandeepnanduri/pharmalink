import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OnboardingForm } from '@/components/onboarding-form';
import { requireUser } from '@/lib/session';

export default async function BuyerOnboarding({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale);
  const t = await getTranslations('onboarding');
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('buyerTitle')}</h1>
      <p className="mb-7 mt-1 text-sm text-muted">{t('buyerSubtitle')}</p>
      <OnboardingForm kind="buyer" />
    </div>
  );
}
