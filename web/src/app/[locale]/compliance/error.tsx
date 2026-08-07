'use client';

import { ErrorState, useErrorReport } from '@/components/error-state';

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'compliance');
  return (
    <ErrorState
      title="The compliance register could not be loaded"
      body="Certificate data could not be read just now. Retrying usually resolves it."
      safeMessage="No certificate was changed."
      digest={error.digest}
      reset={reset}
    />
  );
}
