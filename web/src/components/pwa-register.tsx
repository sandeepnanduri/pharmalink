'use client';

import { useEffect } from 'react';

/**
 * Registers the installable-PWA service worker (public/sw.js) — feature-
 * detected so it's a true no-op on any browser without support. Renders
 * nothing; mounted once in the locale layout's body.
 */
export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
