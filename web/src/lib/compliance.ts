/**
 * Compliance-hub domain — pure + unit tested. Certificate-expiry classification
 * and the regulatory-framework reference set. Real dates only; a cert with no
 * expiry is "unknown", never silently "ok".
 */

export type CertExpiryLevel = 'expired' | 'critical' | 'warning' | 'soon' | 'ok' | 'unknown';

/** Whole days from `now` until `date` (negative if past). */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.floor((date.getTime() - now.getTime()) / 86_400_000);
}

/**
 * Buckets a certificate by how close it is to expiry:
 *  expired (past) · critical (≤7d) · warning (≤30d) · soon (≤60d) · ok · unknown.
 */
export function certExpiryLevel(expiresAt: Date | null | undefined, now: Date = new Date()): CertExpiryLevel {
  if (!expiresAt) return 'unknown';
  const d = daysUntil(expiresAt, now);
  if (d < 0) return 'expired';
  if (d <= 7) return 'critical';
  if (d <= 30) return 'warning';
  if (d <= 60) return 'soon';
  return 'ok';
}

/** True when a cert needs attention (expired or within the 60-day window). */
export function needsAttention(level: CertExpiryLevel): boolean {
  return level === 'expired' || level === 'critical' || level === 'warning' || level === 'soon';
}

export interface ComplianceSummary {
  total: number;
  expired: number;
  expiring: number; // critical + warning + soon
  ok: number;
  unknown: number;
}

export function summarize(certs: { expiresAt: Date | null }[], now: Date = new Date()): ComplianceSummary {
  const s: ComplianceSummary = { total: certs.length, expired: 0, expiring: 0, ok: 0, unknown: 0 };
  for (const c of certs) {
    const level = certExpiryLevel(c.expiresAt, now);
    if (level === 'expired') s.expired += 1;
    else if (level === 'ok') s.ok += 1;
    else if (level === 'unknown') s.unknown += 1;
    else s.expiring += 1;
  }
  return s;
}

/** Static regulatory-framework reference shown in the compliance hub. */
export const REGULATORY_FRAMEWORKS = [
  { authority: 'US FDA', regulation: '21 CFR Part 211', scope: 'cGMP for finished pharmaceuticals', region: 'United States' },
  { authority: 'EMA', regulation: 'EudraLex Volume 4', scope: 'EU GMP guidelines for APIs', region: 'European Union' },
  { authority: 'WHO', regulation: 'TRS 986 / Prequalification', scope: 'WHO GMP & prequalification', region: 'Global' },
  { authority: 'ICH', regulation: 'Q7', scope: 'GMP guide for active pharmaceutical ingredients', region: 'Global' },
  { authority: 'CDSCO', regulation: 'Schedule M', scope: 'Indian GMP for drugs & APIs', region: 'India' },
  { authority: 'NMPA', regulation: 'GMP 2010 (rev.)', scope: 'China GMP', region: 'China' },
] as const;
