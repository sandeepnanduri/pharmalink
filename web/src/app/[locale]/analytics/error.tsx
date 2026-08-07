'use client';

import { ErrorState, useErrorReport } from '@/components/error-state';

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'analytics');
  return (
    <ErrorState
      title="Price intelligence could not be loaded"
      body="The forecast data could not be read. This affects the display only — the underlying observations are intact."
      safeMessage="No data was modified."
      digest={error.digest}
      reset={reset}
    />
  );
}
