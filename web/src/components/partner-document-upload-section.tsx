'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DocumentUpload } from './document-upload';

interface Eligible {
  orgId: string;
  orgName: string;
}

/**
 * Lets a partner upload a document for a represented org that granted
 * `document_upload` scope (EPIC N7 follow-up — the scope existed in
 * REPRESENTATION_SCOPES since Phase 0 but nothing consumed it until now).
 * A picker rather than per-row embedding, so the network table itself stays
 * a plain read-only list.
 */
export function PartnerDocumentUploadSection({ eligible }: { eligible: Eligible[] }) {
  const t = useTranslations('partnerNetwork');
  const [selected, setSelected] = useState(eligible[0]?.orgId ?? '');

  if (eligible.length === 0) return null;

  return (
    <section className="card mt-6" data-testid="partner-doc-upload-section">
      <h2 className="mb-1 text-base font-bold">{t('uploadTitle')}</h2>
      <p className="mb-3 text-xs text-muted">{t('uploadHint')}</p>
      <div className="mb-3">
        <label className="label" htmlFor="upload-target-org">
          {t('uploadOrgLabel')}
        </label>
        <select id="upload-target-org" className="input" value={selected} onChange={(e) => setSelected(e.target.value)} data-testid="upload-target-org">
          {eligible.map((e) => (
            <option key={e.orgId} value={e.orgId}>
              {e.orgName}
            </option>
          ))}
        </select>
      </div>
      {selected && <DocumentUpload kind="company_reg" actingForOrgId={selected} />}
    </section>
  );
}
