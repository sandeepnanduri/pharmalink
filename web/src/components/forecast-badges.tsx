import type { Confidence } from '@/lib/forecast';
import type { RiskBand } from '@/lib/supply-risk';

/**
 * Confidence and risk badges.
 *
 * Both use the same colour vocabulary as the rest of the app (verified/pending/
 * rejected), and both carry their word as text — colour alone would leave a
 * colour-blind user unable to tell a high-confidence forecast from a guess.
 */

const CONFIDENCE_CLASS: Record<Confidence, string> = {
  high: 'badge-verified',
  medium: 'badge-info',
  low: 'badge-pending',
  insufficient: 'badge-neutral',
};

export function ConfidenceBadge({ confidence, label }: { confidence: Confidence; label: string }) {
  return (
    <span className={CONFIDENCE_CLASS[confidence]} data-testid="confidence-badge" data-confidence={confidence}>
      {label}
    </span>
  );
}

const RISK_CLASS: Record<RiskBand, string> = {
  low: 'badge-verified',
  moderate: 'badge-info',
  elevated: 'badge-pending',
  high: 'badge-rejected',
};

export function RiskBadge({ band, label }: { band: RiskBand; label: string }) {
  return (
    <span className={RISK_CLASS[band]} data-testid="risk-badge" data-risk={band}>
      {label}
    </span>
  );
}
