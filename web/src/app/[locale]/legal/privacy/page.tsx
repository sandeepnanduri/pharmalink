import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalDoc, type LegalSection } from '@/components/legal-doc';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });
  return { title: t('title') };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal');

  return (
    <LegalDoc
      eyebrow={t('eyebrow')}
      title={t('privacy.title')}
      updated={t('updated')}
      intro={t('privacy.intro')}
      sections={t.raw('privacy.sections') as LegalSection[]}
      draftNote={t('draftNote')}
      otherHref="/legal/terms"
      otherLabel={t('terms.title')}
    />
  );
}
