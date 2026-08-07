import { getFormatter, getTranslations } from 'next-intl/server';

/**
 * The complete account-creation record for one organisation, for ops review.
 *
 * A verifier decides whether a company is who it claims to be, so the decision
 * must be made against everything the applicant actually submitted — not the
 * handful of fields that happened to fit on a queue card. Anything captured at
 * signup or onboarding is shown here, including the fields that are still empty:
 * a blank "Website" is itself a signal, and silently omitting it would hide the
 * gap rather than surface it.
 */

type Cert = {
  id: string;
  name: string;
  status: string;
  expiresAt: Date | null;
  verifiedVia: string | null;
  documentId: string | null;
  category: string;
  number: string | null;
  issuingAuthority: string | null;
};

type Doc = {
  id: string;
  kind: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  status: string;
  createdAt: Date;
};

type Member = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: string;
  orgRole: string;
  emailVerified: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  consentTermsAt: Date | null;
  consentPrivacyAt: Date | null;
  consentMarketingAt: Date | null;
};

type SiteRow = {
  id: string;
  name: string;
  location: string;
  certsClaimed: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  siteType: string;
  regulatoryId: string | null;
};

export type DossierOrg = {
  id: string;
  name: string;
  kind: string;
  status: string;
  country: string;
  city: string | null;
  regNumber: string | null;
  duns: string | null;
  website: string | null;
  about: string | null;
  companyType: string | null;
  sourcingCategories: string | null;
  regulatoryMarkets: string | null;
  preferredOrigins: string | null;
  exportMarkets: string | null;
  dmfNumbers: string | null;
  supplierType: string | null;
  defaultIncoterm: string | null;
  defaultPaymentTerms: string | null;
  defaultLeadTime: string | null;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
  users: Member[];
  sites: SiteRow[];
  certifications: Cert[];
  documents: Doc[];
};

const DASH = '—';

function bytes(n: number | null): string {
  if (n === null) return DASH;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** A label/value pair. Missing values render as an em dash, never as nothing. */
function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-0.5 text-sm ${empty ? 'text-muted' : ''} ${mono ? 'font-mono text-xs' : ''}`}>
        {empty ? DASH : value}
      </dd>
    </div>
  );
}

/** Comma-separated vocabularies are stored as one string; show them as chips. */
function Chips({ label, value }: { label: string; value: string | null }) {
  const items = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 flex flex-wrap gap-1">
        {items.length === 0 ? (
          <span className="text-sm text-muted">{DASH}</span>
        ) : (
          items.map((i) => (
            <span key={i} className="chip">
              {i}
            </span>
          ))
        )}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-3">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-brand">{title}</h4>
      {children}
    </section>
  );
}

export async function OrgDossier({ org }: { org: DossierOrg }) {
  const t = await getTranslations('dossier');
  const format = await getFormatter();
  const isSeller = org.kind === 'seller' || org.kind === 'both';
  const isBuyer = org.kind === 'buyer' || org.kind === 'both';
  const date = (d: Date | null) => (d ? format.dateTime(d, { dateStyle: 'medium' }) : null);

  return (
    <details className="mt-3 rounded-lg border border-line bg-slate-50/60" data-testid={`dossier-${org.id}`}>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-brand hover:underline">
        {t('toggle')}
      </summary>

      <div className="space-y-4 px-3 pb-4 pt-1">
        <Section title={t('company')}>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t('legalName')} value={org.name} />
            <Field label={t('accountType')} value={org.kind} />
            <Field label={t('companyType')} value={org.companyType} />
            <Field label={t('regNumber')} value={org.regNumber} mono />
            <Field label={t('duns')} value={org.duns} mono />
            <Field label={t('country')} value={[org.city, org.country].filter(Boolean).join(', ')} />
            <Field label={t('website')} value={org.website} />
            <Field label={t('plan')} value={org.plan} />
            <Field label={t('registered')} value={date(org.createdAt)} />
          </dl>
          <div className="mt-3">
            <Field label={t('about')} value={org.about} />
          </div>
        </Section>

        {/* Contacts — a verifier needs a human to call, and the consent record. */}
        <Section title={t('contacts')}>
          {org.users.length === 0 ? (
            <p className="text-sm text-muted">{DASH}</p>
          ) : (
            <ul className="space-y-2">
              {org.users.map((u) => (
                <li key={u.id} className="rounded-md border border-line bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{u.name ?? DASH}</span>
                    <span className="badge-neutral">{u.orgRole}</span>
                    <span className="text-xs text-muted">{u.role}</span>
                    {u.emailVerified ? (
                      <span className="badge-verified">{t('emailVerified')}</span>
                    ) : (
                      <span className="badge-pending">{t('emailUnverified')}</span>
                    )}
                  </div>
                  <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label={t('email')} value={u.email} />
                    <Field label={t('phone')} value={u.phone} />
                    <Field label={t('lastLogin')} value={date(u.lastLoginAt)} />
                    <Field label={t('consent')} value={[
                      u.consentTermsAt ? t('terms') : null,
                      u.consentPrivacyAt ? t('privacy') : null,
                      u.consentMarketingAt ? t('marketing') : null,
                    ].filter(Boolean).join(' · ') || null} />
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Sites carry the GMP claim — certificates are issued per site, not per company. */}
        <Section title={t('sites')}>
          {org.sites.length === 0 ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {/* A manufacturer with no site is the shape a reseller takes. */}
              {isSeller && org.supplierType && ['manufacturer', 'cdmo'].includes(org.supplierType)
                ? t('noSitesButManufacturer')
                : t('noSites')}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {org.sites.map((s) => {
                const addr = [s.addressLine, s.city, s.state, s.postalCode, s.country].filter(Boolean).join(', ');
                return (
                  <li key={s.id} className="rounded-md border border-line bg-white px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{s.name}</span>
                      <span className="badge-neutral">{s.siteType}</span>
                      {s.regulatoryId && (
                        <span className="font-mono text-[11px] text-muted">{t('regulatoryId')} {s.regulatoryId}</span>
                      )}
                    </div>
                    <span className="mt-0.5 block text-xs text-muted">{addr || s.location || DASH}</span>
                    {s.certsClaimed && (
                      <span className="mt-1 block text-xs text-muted">{t('claimed')}: {s.certsClaimed}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {isSeller && (
          <Section title={t('supplyProfile')}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label={t('supplierType')}
                value={org.supplierType ? t(`supplierType_${org.supplierType}`) : null}
              />
              <Chips label={t('exportMarkets')} value={org.exportMarkets} />
              <Field label={t('dmfNumbers')} value={org.dmfNumbers} mono />
              <Field label={t('defaultIncoterm')} value={org.defaultIncoterm} />
              <Field label={t('defaultPaymentTerms')} value={org.defaultPaymentTerms} />
              <Field label={t('defaultLeadTime')} value={org.defaultLeadTime} />
            </dl>
          </Section>
        )}

        {isBuyer && (
          <Section title={t('sourcingProfile')}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Chips label={t('sourcingCategories')} value={org.sourcingCategories} />
              <Chips label={t('regulatoryMarkets')} value={org.regulatoryMarkets} />
              <Chips label={t('preferredOrigins')} value={org.preferredOrigins} />
            </dl>
          </Section>
        )}

        {/* Licences and certificates are split because they answer different
            questions: a licence says the company is permitted to trade at all,
            a certificate says how well it manufactures. */}
        {(['licence', 'certification'] as const).map((cat) => {
          const rows = org.certifications.filter((c) => (c.category ?? 'certification') === cat);
          return (
            <Section key={cat} title={cat === 'licence' ? t('licences') : t('certifications')}>
              {rows.length === 0 ? (
                <p className="text-sm text-muted">
                  {cat === 'licence' ? t('noLicences') : DASH}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {rows.map((c) => (
                    <li key={c.id} className="rounded-md border border-line bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-bold">{cat === 'licence' ? '📜' : '🛡️'} {c.name}</span>
                        <span className="badge-neutral">{c.status}</span>
                        {c.expiresAt && (
                          <span className="text-xs text-muted">{t('expires')} {date(c.expiresAt)}</span>
                        )}
                        {c.verifiedVia && <span className="text-xs text-muted">{t('via')} {c.verifiedVia}</span>}
                        {/* No linked file means the claim is unevidenced. */}
                        {!c.documentId && <span className="badge-pending">{t('noEvidence')}</span>}
                      </div>
                      <dl className="mt-1.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Field label={t('credNumber')} value={c.number} mono />
                        <Field label={t('credAuthority')} value={c.issuingAuthority} />
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          );
        })}

        <Section title={t('documents')}>
          {org.documents.length === 0 ? (
            <p className="text-sm text-muted">{DASH}</p>
          ) : (
            <ul className="space-y-1.5">
              {org.documents.map((d) => (
                <li key={d.id} className="rounded-md border border-line bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold">📄 {d.filename}</span>
                    <span className="badge-neutral">{d.kind}</span>
                    <span className="badge-neutral">{d.status}</span>
                    <span className="text-xs text-muted">{bytes(d.sizeBytes)}</span>
                  </div>
                  {/* The hash is what makes the file tamper-evident; show it in full. */}
                  <div className="mt-1 break-all font-mono text-[10px] text-muted">
                    sha256 {d.sha256 ?? DASH}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </details>
  );
}
