import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalDoc, type LegalSection } from '@/components/legal-doc';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.terms' });
  return { title: t('title') };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal');

  return (
    <LegalDoc
      eyebrow={t('eyebrow')}
      title={t('terms.title')}
      updated={t('updated')}
      intro={t('terms.intro')}
      sections={t.raw('terms.sections') as LegalSection[]}
      draftNote={t('draftNote')}
      otherHref="/legal/privacy"
      otherLabel={t('privacy.title')}
    />
  );
}
