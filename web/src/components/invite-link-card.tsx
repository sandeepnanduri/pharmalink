'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Shows the partner's own shareable signup link (?ref={code}) with a
 * copy-to-clipboard control — same inline `navigator.clipboard?.writeText`
 * pattern as the API-key reveal-once card in integrations-manager.tsx.
 *
 * This is the one place a partner's own invite code is ever shown to them —
 * see sealAttributionIfNew in lib/partner-actions.ts for what happens on the
 * other end when someone signs up through it.
 */
export function InviteLinkCard({ link }: { link: string }) {
  const t = useTranslations('partnerDash');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission can be denied — the link is still selectable text.
    }
  }

  return (
    <section className="card" data-testid="invite-link-card">
      <h2 className="text-[13.5px] font-bold">{t('inviteTitle')}</h2>
      <p className="mb-3 mt-0.5 text-[11px] text-muted">{t('inviteHint')}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-mist px-2 py-1.5 font-mono text-[11px]" data-testid="invite-link-value">
          {link}
        </code>
        <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={copy} data-testid="invite-link-copy">
          {copied ? t('inviteCopied') : t('inviteCopy')}
        </button>
      </div>
    </section>
  );
}
