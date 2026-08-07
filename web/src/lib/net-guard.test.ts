import { describe, it, expect } from 'vitest';
import { isPrivateAddress, checkPublicUrl } from './net-guard';

describe('isPrivateAddress — the SSRF blocklist', () => {
  it('flags loopback, private, link-local/metadata, CGNAT', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
  it('flags IPv6 loopback, ULA, link-local and IPv4-mapped private', () => {
    for (const ip of ['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false); // public
  });
  it('treats a non-IP string as unsafe', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('checkPublicUrl', () => {
  it('rejects non-allowed schemes', () => {
    expect(checkPublicUrl('ftp://example.com', { schemes: ['https:'] }).ok).toBe(false);
    expect(checkPublicUrl('javascript:alert(1)').ok).toBe(false);
  });
  it('allows http when configured (crawler)', () => {
    expect(checkPublicUrl('http://example.com', { schemes: ['http:', 'https:'] }).ok).toBe(true);
  });
  it('rejects embedded credentials', () => {
    expect(checkPublicUrl('https://user:pass@example.com').reason).toBe('embeddedCreds');
  });
  it('verifies a public literal IP without needing DNS', () => {
    const r = checkPublicUrl('https://8.8.8.8', { schemes: ['https:'] });
    expect(r.ok).toBe(true);
    expect(r.literalIpVerified).toBe(true);
  });
  it('BLOCKS a private literal IP up front', () => {
    expect(checkPublicUrl('https://169.254.169.254', { schemes: ['https:'] }).reason).toBe('privateHost');
    expect(checkPublicUrl('http://127.0.0.1:6379', { schemes: ['http:', 'https:'] }).reason).toBe('privateHost');
  });
  it('passes a hostname through for the caller to DNS-resolve', () => {
    const r = checkPublicUrl('https://example.com', { schemes: ['https:'] });
    expect(r.ok).toBe(true);
    expect(r.literalIpVerified).toBeUndefined();
  });
  it('rejects odd ports when defaultPortOnly is set (webhooks)', () => {
    expect(checkPublicUrl('https://example.com:8443', { defaultPortOnly: true }).reason).toBe('badPort');
  });
});
