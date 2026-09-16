import { getTranslations } from 'next-intl/server';

const CATEGORIES = ['logistics', 'finance', 'lab'] as const;

/**
 * Honest placeholder, not a working directory — PARTNER-ECOSYSTEM.md §3 rows
 * 2/4/5 (Logistics Partner directory, embedded trade finance, independent
 * lab/CoA verification) are explicitly "partner, not build": each needs a
 * real third-party relationship (a curated forwarder, a licensed NBFC, an
 * accredited lab) that doesn't exist yet. Building a clickable "marketplace"
 * here with nothing real behind it would be worse than not building it —
 * this says plainly what's planned and that it isn't live, nothing more.
 */
export async function EcosystemServicesSection() {
  const t = await getTranslations('partnerNetwork');

  return (
    <section className="card mt-6" data-testid="ecosystem-services-section">
      <h2 className="mb-1 text-base font-bold">{t('ecosystemTitle')}</h2>
      <p className="mb-4 text-xs text-muted">{t('ecosystemHint')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {CATEGORIES.map((c) => (
          <div key={c} className="rounded-panel border border-line bg-mist p-3" data-testid={`ecosystem-${c}`}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-bold">{t(`ecosystem${c[0].toUpperCase()}${c.slice(1)}Title`)}</p>
              <span className="badge-neutral shrink-0">{t('ecosystemComingSoon')}</span>
            </div>
            <p className="text-[11.5px] leading-snug text-slate2">{t(`ecosystem${c[0].toUpperCase()}${c.slice(1)}Desc`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
