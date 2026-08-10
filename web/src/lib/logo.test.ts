import { describe, it, expect } from 'vitest';
import { LOGO_HOSTS, domainFrom, monogram, monogramHue, resolveLogo } from './logo';

describe('domainFrom', () => {
  it('accepts a bare domain, a full URL, and mixed case', () => {
    expect(domainFrom('sunpharma.com')).toBe('sunpharma.com');
    expect(domainFrom('https://www.sunpharma.com/about?x=1')).toBe('sunpharma.com');
    expect(domainFrom('WWW.Cipla.COM')).toBe('cipla.com');
    expect(domainFrom('  http://api.zhejiang-huahai.cn/  ')).toBe('api.zhejiang-huahai.cn');
  });

  it('rejects anything that would build a URL that 404s on every render', () => {
    // A supplier typing their company name into the website field is the common
    // case; asking the aggregator for "sun pharma" burns a request per render.
    expect(domainFrom('Sun Pharma')).toBeNull();
    expect(domainFrom('localhost')).toBeNull();
    expect(domainFrom('http://')).toBeNull();
    expect(domainFrom('')).toBeNull();
    expect(domainFrom('   ')).toBeNull();
    expect(domainFrom(null)).toBeNull();
    expect(domainFrom(undefined)).toBeNull();
  });
});

describe('monogram', () => {
  it('takes the first letter of the first two meaningful words', () => {
    expect(monogram('Sun Pharma API Division')).toBe('SP');
    expect(monogram('Zhejiang Huahai Pharmaceutical')).toBe('ZH');
  });

  it('drops legal-form noise so the initials name the company', () => {
    // "Sun Pharmaceutical Industries Ltd" must be SP, not SL.
    expect(monogram('Sun Pharmaceutical Industries Ltd')).toBe('SP');
    expect(monogram('Cipla Ltd')).toBe('CI');
    expect(monogram('Divis Laboratories Pvt Ltd')).toBe('DL');
  });

  it('falls back to two letters of a single-word name', () => {
    expect(monogram('Cipla')).toBe('CI');
    expect(monogram('Ltd')).toBe('??'); // nothing left once the noise is dropped
  });

  it('survives punctuation and non-Latin names rather than emitting markup', () => {
    expect(monogram('Dr. Reddy’s Laboratories')).toBe('DR');
    expect(monogram('<script>alert(1)</script>')).toBe('SA'); // letters only — never markup
    expect(monogram('浙江 华海')).toBe('浙华');
    expect(monogram('')).toBe('??');
  });
});

describe('monogramHue', () => {
  it('is deterministic — the same supplier is always the same colour', () => {
    expect(monogramHue('Sun Pharma')).toBe(monogramHue('Sun Pharma'));
  });

  it('stays inside the hue circle for every name', () => {
    for (const name of ['', 'A', 'Sun Pharma API Division', '浙江华海', 'x'.repeat(500)]) {
      const h = monogramHue(name);
      expect(h, name).toBeGreaterThanOrEqual(0);
      expect(h, name).toBeLessThan(360);
      expect(Number.isInteger(h), name).toBe(true);
    }
  });

  it('separates different companies', () => {
    expect(monogramHue('Cipla Ltd')).not.toBe(monogramHue('Sun Pharma API Division'));
  });
});

describe('resolveLogo', () => {
  it('prefers an operator-set logo over the aggregator', () => {
    const r = resolveLogo({ name: 'Cipla Ltd', website: 'cipla.com', logoUrl: '/uploads/cipla.png' });
    expect(r.kind).toBe('image');
    expect(r.src).toBe('/uploads/cipla.png');
  });

  it('points at the keyless aggregator when no token is configured', () => {
    const r = resolveLogo({ name: 'Cipla Ltd', website: 'https://www.cipla.com/x' });
    expect(r.kind).toBe('image');
    const url = new URL(r.src!);
    expect(url.host).toBe(LOGO_HOSTS.keyless);
    expect(url.pathname).toBe('/cipla.com');
  });

  it('asks the keyless aggregator NOT to substitute a generic icon', () => {
    // Left at its default, unavatar answers 200 with a grey placeholder that is
    // byte-identical across every domain it has nothing for. The browser counts
    // that as a successful load, so the company would show an anonymous icon
    // rather than its own initials -- strictly worse than the monogram, and
    // invisible to `onError`. This flag is the difference.
    const url = new URL(resolveLogo({ name: 'Cipla Ltd', website: 'cipla.com' }).src!);
    expect(url.searchParams.get('fallback')).toBe('false');
  });

  it('switches to the licensed aggregator when a token is configured', () => {
    const r = resolveLogo({ name: 'Cipla Ltd', website: 'https://www.cipla.com/x' }, { size: 80, token: 'pk_live_x' });
    const url = new URL(r.src!);
    expect(url.host).toBe(LOGO_HOSTS.licensed);
    expect(url.pathname).toBe('/cipla.com');
    expect(url.searchParams.get('size')).toBe('80');
    expect(url.searchParams.get('token')).toBe('pk_live_x');
  });

  it('never points anywhere but an aggregator', () => {
    // Hotlinking the owner's own server is the thing this module exists to
    // avoid: it spends their bandwidth and breaks when they reorganise.
    for (const token of [undefined, 'pk_live_x']) {
      const url = new URL(resolveLogo({ name: 'Sun Pharma', website: 'sunpharma.com' }, { token }).src!);
      expect(Object.values(LOGO_HOSTS)).toContain(url.host);
    }
  });

  it('falls back to the monogram when there is no usable domain', () => {
    const r = resolveLogo({ name: 'Sun Pharma API Division', website: 'not a domain' });
    expect(r.kind).toBe('monogram');
    expect(r.src).toBeUndefined();
  });

  it('always carries the fallback, so the UI can recover from a 404 image', () => {
    const r = resolveLogo({ name: 'Cipla Ltd', website: 'cipla.com' });
    expect(r.initials).toBe('CI');
    expect(r.hue).toBe(monogramHue('Cipla Ltd'));
  });

  it('caps size — the licensed aggregator bills per pixel bucket, so an unbounded caller is a cost bug', () => {
    // Only meaningful on the billed provider; the keyless one takes no size.
    const t = { token: 'pk_live_x' };
    const huge = resolveLogo({ name: 'Cipla', website: 'cipla.com' }, { ...t, size: 100_000 });
    expect(new URL(huge.src!).searchParams.get('size')).toBe('512');
    const tiny = resolveLogo({ name: 'Cipla', website: 'cipla.com' }, { ...t, size: 1 });
    expect(new URL(tiny.src!).searchParams.get('size')).toBe('32');
  });

  it('omits the token when there is none rather than sending "undefined"', () => {
    const without = resolveLogo({ name: 'Cipla', website: 'cipla.com' });
    expect(new URL(without.src!).searchParams.has('token')).toBe(false);
    const with_ = resolveLogo({ name: 'Cipla', website: 'cipla.com' }, { token: 'pk_test' });
    expect(new URL(with_.src!).searchParams.get('token')).toBe('pk_test');
  });
});
