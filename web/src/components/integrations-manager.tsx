'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import {
  createApiKeyAction,
  revokeApiKeyAction,
  createWebhookAction,
  deleteWebhookAction,
  type ActionState,
} from '@/lib/actions';
import { API_SCOPES, WEBHOOK_EVENTS } from '@/lib/integrations.constants';
import { ButtonContent } from './spinner';
import { ActionForm } from '@/components/action-form';

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  active: boolean;
  lastUsedAt: string | null;
}
interface HookRow {
  id: string;
  url: string;
  events: string;
  failCount: number;
}

/** A value shown exactly once (raw API key / webhook secret) with copy. */
function RevealOnce({ label, value }: { label: string; value: string }) {
  const t = useTranslations('integrations');
  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-warn-pale p-3" data-testid="reveal-once">
      <p className="text-xs font-bold text-amber-900">⚠ {t('shownOnce')}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1.5 font-mono text-xs">{value}</code>
        <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => navigator.clipboard?.writeText(value)}>
          {t('copy')}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-amber-800">{label}</p>
    </div>
  );
}

export function IntegrationsManager({ keys, hooks }: { keys: KeyRow[]; hooks: HookRow[] }) {
  const t = useTranslations('integrations');
  const router = useRouter();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const [keyState, keyAction, keyPending] = useActionState<ActionState & { rawKey?: string }, FormData>(
    async (prev, fd) => {
      const res = await createApiKeyAction(prev, fd);
      if (res.ok && res.rawKey) {
        setNewKey(res.rawKey);
        router.refresh();
      }
      return res;
    },
    {}
  );

  const [hookState, hookAction, hookPending] = useActionState<ActionState & { secret?: string }, FormData>(
    async (prev, fd) => {
      const res = await createWebhookAction(prev, fd);
      if (res.ok && res.secret) {
        setNewSecret(res.secret);
        router.refresh();
      }
      return res;
    },
    {}
  );

  return (
    <div className="space-y-8">
      {/* API keys */}
      <section className="card">
        <h2 className="text-base font-bold">{t('apiKeys')}</h2>
        <p className="mt-1 text-sm text-muted">{t('apiKeysHint')}</p>

        <form action={keyAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="k-name">{t('keyName')}</label>
            <input id="k-name" name="name" required placeholder="e.g. ERP integration" className="input" data-testid="key-name" />
            <div className="mt-2 flex flex-wrap gap-3">
              {API_SCOPES.map((sc) => (
                <label key={sc} className="flex items-center gap-1.5 text-xs text-slate2">
                  <input type="checkbox" name="scopes" value={sc} defaultChecked={sc === 'catalog:read'} className="accent-brand" />
                  <code>{sc}</code>
                </label>
              ))}
            </div>
          </div>
          <button type="submit" disabled={keyPending} className="btn-primary" data-testid="create-key">
            <ButtonContent pending={keyPending} label={t('createKey')} />
          </button>
        </form>
        {keyState.error && <p className="mt-2 text-xs font-semibold text-red-700">{t(keyState.error)}</p>}
        {newKey && <RevealOnce label={t('keyRevealNote')} value={newKey} />}

        {keys.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">{t('name')}</th>
                  <th className="th">{t('key')}</th>
                  <th className="th">{t('scopes')}</th>
                  <th className="th">{t('lastUsed')}</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} data-testid="key-row">
                    <td className="td font-semibold">{k.name}</td>
                    <td className="td font-mono text-xs">{k.prefix}…</td>
                    <td className="td text-xs text-muted">{k.scopes}</td>
                    <td className="td text-xs text-muted">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : t('never')}</td>
                    <td className="td">
                      {k.active ? (
                        <ActionForm action={revokeApiKeyAction}>
                          <input type="hidden" name="id" value={k.id} />
                          <button type="submit" className="text-xs font-semibold text-red-700 hover:underline" data-testid={`revoke-${k.id}`}>
                            {t('revoke')}
                          </button>
                        </ActionForm>
                      ) : (
                        <span className="badge-rejected">{t('revoked')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Webhooks */}
      <section className="card">
        <h2 className="text-base font-bold">{t('webhooks')}</h2>
        <p className="mt-1 text-sm text-muted">{t('webhooksHint')}</p>

        <form action={hookAction} className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="w-url">{t('endpointUrl')}</label>
            <input id="w-url" name="url" type="url" required placeholder="https://your-app.com/webhooks/pharmalink" className="input" data-testid="hook-url" />
          </div>
          <div>
            <p className="label">{t('events')}</p>
            <div className="flex flex-wrap gap-3">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-1.5 text-xs text-slate2">
                  <input type="checkbox" name="events" value={ev} defaultChecked className="accent-brand" />
                  <code>{ev}</code>
                </label>
              ))}
            </div>
          </div>
          {hookState.error && <p className="text-xs font-semibold text-red-700">{t(hookState.error)}</p>}
          <button type="submit" disabled={hookPending} className="btn-primary" data-testid="create-hook">
            <ButtonContent pending={hookPending} label={t('addEndpoint')} />
          </button>
        </form>
        {newSecret && <RevealOnce label={t('secretRevealNote')} value={newSecret} />}

        {hooks.length > 0 && (
          <ul className="mt-5 space-y-2">
            {hooks.map((h) => (
              <li key={h.id} className="flex items-center gap-3 rounded-lg border border-line p-3" data-testid="hook-row">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{h.url}</p>
                  <p className="text-[11px] text-muted">
                    {h.events}
                    {h.failCount > 0 && <span className="ml-2 text-red-700">· {t('failures', { n: h.failCount })}</span>}
                  </p>
                </div>
                <form action={deleteWebhookAction}>
                  <input type="hidden" name="id" value={h.id} />
                  <button type="submit" className="text-xs font-semibold text-red-700 hover:underline" data-testid={`delete-hook-${h.id}`}>
                    {t('delete')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
