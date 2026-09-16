/**
 * `node:crypto` in its own file, separate from lib/partner.ts — that module
 * is imported by client components (PARTNER_ARCHETYPES etc.), and a single
 * `node:` import anywhere in a module webpack traces into a client bundle
 * fails the whole build, not just the call site. This file is imported only
 * from 'use server' action files.
 */
import { randomBytes } from 'node:crypto';

/**
 * A short, shareable invite/attribution code — `PTR-XXXXXXXX`. Not a secret
 * (it's shown on the public profile and shared to invite orgs), so a plain
 * hex encoding is fine; uniqueness is enforced by `Partner.code`'s DB
 * constraint, with the caller retrying on collision.
 */
export function generatePartnerCode(): string {
  return `PTR-${randomBytes(4).toString('hex').toUpperCase()}`;
}
