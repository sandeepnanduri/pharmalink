import { getTranslations } from 'next-intl/server';
import type { ContactTier } from '@/lib/contact-visibility';
import type { RedactedContact } from '@/lib/contact-queries';

/**
 * The supplier contact directory.
 *
 * This component receives **already-redacted** rows: the gate is applied in
 * `contact-queries.ts`, so a field the viewer may not see never reaches here,
 * never reaches the RSC payload, and never reaches view-source. Hiding with CSS
 * would put a named person's mobile number one devtools panel away.
 *
 * What it does own is telling the viewer what is withheld and how to unlock it.
 * A directory that silently shows less reads as a supplier who published less.
 */

const TIER_NOTE: Record<ContactTier, string> = {
  public: 'contactsSignedOut',
  email: 'contactsNoDeal',
  full: 'contactsFull',
};

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-xs">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? 'font-mono text-slate2' : 'text-slate2'}>{value}</dd>
    </div>
  );
}

export async function SupplierContacts({ tier, contacts }: { tier: ContactTier; contacts: RedactedContact[] }) {
  const t = await getTranslations('supplier');
  if (contacts.length === 0) return null;

  return (
    <>
      <h2 className="mb-1 mt-8 text-base font-bold">{t('contacts')}</h2>
      <p className="mb-3 text-xs text-muted" data-testid={`contact-tier-${tier}`}>
        {t(TIER_NOTE[tier])}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2" data-testid="supplier-contacts">
        {contacts.map((c) => (
          <li key={c.id} className="card" data-testid="contact-card">
            <p className="font-semibold">
              {[c.salutation, c.firstName, c.lastName].filter(Boolean).join(' ')}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {[c.jobTitle, c.department].filter(Boolean).join(' · ')}
            </p>

            <dl className="mt-3 space-y-1">
              <Row label={t('email')} value={c.businessEmail} mono />
              <Row label={t('mobile')} value={c.mobile} mono />
              <Row label={t('officePhone')} value={c.officePhone} mono />
              <Row label={t('territories')} value={c.territories} />
              <Row label={t('languages')} value={c.languages} />
              <Row label={t('bestContactTime')} value={c.bestContactTime} />
              {c.responseHours != null && <Row label={t('responseTime')} value={t('withinHours', { n: c.responseHours })} />}
            </dl>

            {/* Always shown, at every tier — the template is explicit. */}
            {c.linkedinUrl && (
              <a
                href={c.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-3 inline-block text-xs font-semibold text-brand hover:underline"
                data-testid="contact-linkedin"
              >
                {t('viewLinkedIn')} ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
