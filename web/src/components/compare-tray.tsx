'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

/**
 * A localStorage-backed "compare tray" for suppliers. `AddToCompareButton`
 * toggles a supplier in the tray; `CompareBar` is a floating bar (mounted once
 * in the layout) that shows the selection and links to the compare table.
 */
const KEY = 'pl_compare';
const EVT = 'pl_compare_change';
const MAX = 4;

function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, MAX) : [];
  } catch {
    return [];
  }
}
function write(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  window.dispatchEvent(new Event(EVT));
}

function useCompare() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setIds(read());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const toggle = useCallback((id: string) => {
    const cur = read();
    write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }, []);
  const clear = useCallback(() => write([]), []);
  return { ids, toggle, clear };
}

export function AddToCompareButton({ id, className }: { id: string; className?: string }) {
  const t = useTranslations('compare');
  const { ids, toggle } = useCompare();
  const active = ids.includes(id);
  const full = ids.length >= MAX && !active;
  return (
    <button
      type="button"
      onClick={() => toggle(id)}
      disabled={full}
      className={className ?? `btn-ghost !py-1.5 text-xs ${active ? '!border-brand !text-brand' : ''}`}
      data-testid={`compare-toggle-${id}`}
      title={full ? t('full', { max: MAX }) : undefined}
    >
      {active ? `✓ ${t('added')}` : `⚖ ${t('add')}`}
    </button>
  );
}

export function CompareBar() {
  const t = useTranslations('compare');
  const router = useRouter();
  const { ids, clear } = useCompare();
  if (ids.length === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur" data-testid="compare-bar">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <span className="text-sm font-semibold">{t('selected', { n: ids.length })}</span>
        <button type="button" onClick={clear} className="text-xs text-muted hover:underline">
          {t('clear')}
        </button>
        <button
          type="button"
          disabled={ids.length < 2}
          onClick={() => router.push(`/suppliers/compare?ids=${ids.join(',')}`)}
          className="btn-primary ml-auto !py-1.5 text-sm"
          data-testid="compare-go"
        >
          {t('compareNow')} →
        </button>
      </div>
    </div>
  );
}
