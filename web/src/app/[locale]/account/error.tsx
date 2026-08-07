'use client';

import { ErrorState, useErrorReport } from '@/components/error-state';

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'account');
  return (
    <ErrorState
      title="Your account settings could not be loaded"
      body="We could not reach your organisation settings. Retrying usually resolves it."
      safeMessage="No setting was saved."
      digest={error.digest}
      reset={reset}
    />
  );
}
