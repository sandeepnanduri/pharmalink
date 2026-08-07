'use client';

import { ErrorState, useErrorReport } from '@/components/error-state';

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'orders');
  return (
    <ErrorState
      title="Your orders could not be loaded"
      body="We could not reach your orders and shipments. Retrying usually resolves it."
      safeMessage="No order or shipment was changed."
      digest={error.digest}
      reset={reset}
    />
  );
}
