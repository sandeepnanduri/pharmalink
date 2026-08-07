'use client';

import { ErrorState, useErrorReport } from '@/components/error-state';

export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'locale');
  return (
    <ErrorState
      title="Something went wrong on this page"
      body="The page could not finish loading. This is our fault, not yours — nothing you were working on has been changed."
      safeMessage="No data was modified."
      digest={error.digest}
      reset={reset}
    />
  );
}
