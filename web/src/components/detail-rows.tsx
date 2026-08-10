'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import {
  saveFacilityAction,
  saveFilingAction,
  type DetailActionState,
} from '@/lib/supplier-detail-actions';
import { FDA_OUTCOMES, EMA_OUTCOMES, FILING_STATUSES } from '@/lib/vocab';
import { ButtonContent } from './spinner';
import { ActionFeedback } from './action-feedback';

/**
 * Add / edit forms for a supplier's own facilities and regulatory filings.
 *
 * Both are dialogs rather than pages: unlike a 90-column product, a site is
 * about twenty fields and a filing about fifteen, which fits without the
 * deep-link, resume and validation problems that pushed the product editor onto
 * its own route.
 *
 * The vocabularies come from `vocab.ts` rather than being retyped here, so the
 * options a supplier can pick are exactly the values the importer accepts and
 * the badges know how to colour.
 */

function Field({
  name,
  label,
  type = 'text',
  value,
  placeholder,
  options,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number | null;
  placeholder?: string;
  options?: readonly string[];
}) {
  const id = `f-${name}`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {options ? (
        <select id={id} name={name} defaultValue={value == null ? '' : String(value)} className="input" data-testid={id}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          defaultValue={value == null ? '' : String(value)}
          placeholder={placeholder}
          className="input"
          data-testid={id}
        />
      )}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="close" className="text-xl text-muted">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface FacilityValues {
  id?: string;
  name?: string;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  siteType?: string;
  regulatoryId?: string | null;
  emaSiteRef?: string | null;
  fdaGmpStatus?: string | null;
  euGmpStatus?: string | null;
  whoGmpStatus?: string | null;
  fdaInspectionOutcome?: string | null;
  euInspectionOutcome?: string | null;
  form483Count?: number | null;
  capacityValue?: number | null;
  capacityUnit?: string | null;
  utilizationPct?: number | null;
  manufacturingType?: string | null;
  containmentLevel?: string | null;
  productionLines?: number | null;
  qcLabs?: number | null;
  yearEstablished?: number | null;
  employees?: number | null;
}

export function FacilityDialog({ trigger, facility }: { trigger: string; facility?: FacilityValues }) {
  const t = useTranslations('facilities');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DetailActionState, FormData>(async (prev, fd) => {
    const res = await saveFacilityAction(prev, fd);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
    return res;
  }, {});

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={facility ? 'btn-ghost !py-1 text-xs' : 'btn-primary'} data-testid={facility ? `edit-facility-${facility.id}` : 'add-facility'}>
        {trigger}
      </button>
      {open && (
        <Dialog title={facility ? t('editTitle') : t('addTitle')} onClose={() => setOpen(false)}>
          <form action={action} className="mt-4 space-y-4">
            {facility?.id && <input type="hidden" name="id" value={facility.id} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="name" label={t('name')} value={facility?.name} />
              <Field name="siteType" label={t('siteType')} value={facility?.siteType ?? 'manufacturing'} options={['manufacturing', 'packaging', 'warehouse', 'laboratory']} />
              <Field name="addressLine" label={t('address')} value={facility?.addressLine} />
              <Field name="city" label={t('city')} value={facility?.city} />
              <Field name="state" label={t('state')} value={facility?.state} />
              <Field name="country" label={t('country')} value={facility?.country} />
              {/* The FEI is what lets a buyer check every other claim on this
                  row in the FDA's own register. */}
              <Field name="regulatoryId" label={t('fei')} value={facility?.regulatoryId} placeholder="3002807546" />
              <Field name="emaSiteRef" label={t('emaRef')} value={facility?.emaSiteRef} />
              <Field name="fdaGmpStatus" label={t('fdaGmp')} value={facility?.fdaGmpStatus} placeholder="Current (Active)" />
              <Field name="euGmpStatus" label={t('euGmp')} value={facility?.euGmpStatus} />
              <Field name="lastFdaInspectionAt" label={t('lastFdaInspection')} type="date" />
              {/* Exact terms only: the template is explicit that an informal
                  description of an inspection outcome is not acceptable. */}
              <Field name="fdaInspectionOutcome" label={t('fdaOutcome')} value={facility?.fdaInspectionOutcome} options={FDA_OUTCOMES} />
              <Field name="lastEuInspectionAt" label={t('lastEuInspection')} type="date" />
              <Field name="euInspectionOutcome" label={t('euOutcome')} value={facility?.euInspectionOutcome} options={EMA_OUTCOMES} />
              <Field name="form483Count" label={t('form483')} type="number" value={facility?.form483Count} />
              <Field name="capacityValue" label={t('capacity')} type="number" value={facility?.capacityValue} />
              <Field name="capacityUnit" label={t('capacityUnit')} value={facility?.capacityUnit} placeholder="MT/year" />
              <Field name="utilizationPct" label={t('utilization')} type="number" value={facility?.utilizationPct} />
              <Field name="manufacturingType" label={t('manufacturingType')} value={facility?.manufacturingType} />
              <Field name="containmentLevel" label={t('containment')} value={facility?.containmentLevel} />
              <Field name="productionLines" label={t('lines')} type="number" value={facility?.productionLines} />
              <Field name="qcLabs" label={t('qcLabs')} type="number" value={facility?.qcLabs} />
              <Field name="yearEstablished" label={t('established')} type="number" value={facility?.yearEstablished} />
              <Field name="employees" label={t('employees')} type="number" value={facility?.employees} />
            </div>
            {state.error && <p role="alert" className="field-error">{state.error}</p>}
            <button type="submit" disabled={pending} className="btn-primary w-full" data-testid="save-facility">
              <ButtonContent pending={pending} label={t('save')} />
            </button>
            <ActionFeedback state={state} success={t('saved')} />
          </form>
        </Dialog>
      )}
    </>
  );
}

export interface FilingValues {
  id?: string;
  filingType?: string;
  filingNumber?: string;
  authority?: string | null;
  country?: string | null;
  status?: string;
  cas?: string | null;
  productName?: string | null;
  holderName?: string | null;
  scope?: string | null;
  openToReference?: boolean | null;
  referencingCount?: number | null;
  sitesCovered?: string | null;
  sourceUrl?: string | null;
}

/** The filing types the template enumerates, in the order it lists them. */
const FILING_TYPES = [
  'US FDA Type II DMF',
  'ASMF (EU)',
  'CEP (EDQM)',
  'US FDA ANDA',
  'US FDA NDA',
  'EU MAA',
  'WHO PQ',
  'CDSCO',
  'PMDA (Japan)',
] as const;

export function FilingDialog({ trigger, filing }: { trigger: string; filing?: FilingValues }) {
  const t = useTranslations('filings');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DetailActionState, FormData>(async (prev, fd) => {
    const res = await saveFilingAction(prev, fd);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
    return res;
  }, {});

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={filing ? 'btn-ghost !py-1 text-xs' : 'btn-primary'} data-testid={filing ? `edit-filing-${filing.id}` : 'add-filing'}>
        {trigger}
      </button>
      {open && (
        <Dialog title={filing ? t('editTitle') : t('addTitle')} onClose={() => setOpen(false)}>
          <form action={action} className="mt-4 space-y-4">
            {filing?.id && <input type="hidden" name="id" value={filing.id} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="filingType" label={t('type')} value={filing?.filingType} options={FILING_TYPES} />
              <Field name="filingNumber" label={t('number')} value={filing?.filingNumber} placeholder="Type II DMF #23412" />
              <Field name="authority" label={t('authority')} value={filing?.authority} placeholder="US FDA CDER" />
              <Field name="country" label={t('country')} value={filing?.country} />
              <Field name="status" label={t('status')} value={filing?.status ?? 'active'} options={FILING_STATUSES} />
              <Field name="cas" label="CAS" value={filing?.cas} />
              <Field name="productName" label={t('product')} value={filing?.productName} />
              <Field name="holderName" label={t('holder')} value={filing?.holderName} />
              <Field name="filedAt" label={t('filed')} type="date" />
              <Field name="approvedAt" label={t('approved')} type="date" />
              {/* Deliberately optional. A DMF has no expiry, and the register
                  reports that as unknown rather than inventing a date. */}
              <Field name="expiresAt" label={t('expires')} type="date" />
              <Field name="renewalDueAt" label={t('renewalDue')} type="date" />
              <Field name="openToReference" label={t('openToReference')} value={filing?.openToReference == null ? '' : filing.openToReference ? 'yes' : 'no'} options={['yes', 'no']} />
              <Field name="referencingCount" label={t('referencingCount')} type="number" value={filing?.referencingCount} />
              <Field name="sitesCovered" label={t('sitesCovered')} value={filing?.sitesCovered} placeholder="3002807546,3002808041" />
              <Field name="sourceUrl" label={t('sourceUrl')} value={filing?.sourceUrl} placeholder="https://accessdata.fda.gov/…" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="f-scope">{t('scope')}</label>
              <textarea id="f-scope" name="scope" rows={2} defaultValue={filing?.scope ?? ''} className="input" />
            </div>
            {state.error && <p role="alert" className="field-error">{state.error}</p>}
            <button type="submit" disabled={pending} className="btn-primary w-full" data-testid="save-filing">
              <ButtonContent pending={pending} label={t('save')} />
            </button>
            <ActionFeedback state={state} success={t('saved')} />
          </form>
        </Dialog>
      )}
    </>
  );
}
