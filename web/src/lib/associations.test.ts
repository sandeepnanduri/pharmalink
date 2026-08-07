import { describe, it, expect } from 'vitest';
import { ASSOCIATIONS, ASSOCIATION_HOSTS, association, isPlausibleCompany, normaliseCompany, parseMemberList, sameCompany } from './associations';

const bdma = association('bdma')!;

describe('association registry', () => {
  it('lists only sources whose terms permit a member import', () => {
    for (const a of ASSOCIATIONS) {
      expect(a.host).toBeTruthy();
      expect(a.membersUrl).toContain(a.host.replace(/^www\./, ''));
      expect(a.evidences.length).toBeGreaterThan(20);
    }
  });

  it('never includes a source we are not permitted to retrieve from', () => {
    const hosts = ASSOCIATION_HOSTS.join(' ');
    // IndiaMART's ToU forbid building a directory from their content.
    expect(hosts).not.toContain('indiamart');
    expect(hosts).not.toContain('volza');
    expect(hosts).not.toContain('zauba');
  });

  it('states that membership is not a GMP certification', () => {
    for (const a of ASSOCIATIONS) expect(a.evidences).toMatch(/Not a GMP certification/);
  });
});

describe('normaliseCompany', () => {
  it('strips legal forms and punctuation', () => {
    expect(normaliseCompany('Sun Pharmaceutical Industries Ltd.')).toBe('sun');
    expect(normaliseCompany('CIPLA LIMITED')).toBe('cipla');
  });

  it('treats the same company written three ways as one', () => {
    expect(sameCompany('Sun Pharmaceutical Industries Ltd.', 'SUN PHARMA')).toBe(true);
    expect(sameCompany('Cipla Ltd', 'Cipla Limited')).toBe(true);
    expect(sameCompany("Divi's Laboratories Ltd", 'Divis Laboratories')).toBe(true);
  });

  it('does not merge genuinely different companies', () => {
    expect(sameCompany('Sun Pharma', 'Zydus Lifesciences')).toBe(false);
    expect(sameCompany('Aurobindo Pharma', 'Alembic Pharmaceuticals')).toBe(false);
  });

  it('refuses to match on an empty or suffix-only name', () => {
    expect(sameCompany('Ltd', 'Limited')).toBe(false);
    expect(sameCompany('', 'Cipla')).toBe(false);
  });
});

describe('isPlausibleCompany', () => {
  it('accepts real company names', () => {
    expect(isPlausibleCompany('Aurobindo Pharma Limited')).toBe(true);
    expect(isPlausibleCompany('Hetero Drugs Ltd')).toBe(true);
  });

  it('rejects navigation chrome that lives in the same markup', () => {
    for (const junk of ['Home', 'About Us', 'Contact', 'Read more', 'Login', 'Privacy Policy', 'Next »']) {
      expect(isPlausibleCompany(junk), junk).toBe(false);
    }
  });

  it('rejects single tokens and empty cells', () => {
    expect(isPlausibleCompany('Members')).toBe(false);
    expect(isPlausibleCompany('   ')).toBe(false);
    expect(isPlausibleCompany('12345')).toBe(false);
  });
});

describe('parseMemberList', () => {
  const html = `
    <ul class="nav"><li><a href="/">Home</a></li><li><a href="/about">About Us</a></li></ul>
    <table><tbody>
      <tr><td>Aurobindo Pharma Limited</td><td><a href="https://www.aurobindo.com">site</a></td></tr>
      <tr><td>Hetero Drugs Ltd</td><td><a href="https://hetero.com">site</a></td></tr>
      <tr><td>Aurobindo Pharma Ltd.</td><td><a href="https://www.aurobindo.com">dup</a></td></tr>
      <tr><td>Read more</td><td></td></tr>
    </tbody></table>`;

  it('extracts members and skips navigation', () => {
    const members = parseMemberList(html, bdma);
    const names = members.map((m) => m.name);
    expect(names).toContain('Aurobindo Pharma Limited');
    expect(names).toContain('Hetero Drugs Ltd');
    expect(names).not.toContain('Home');
    expect(names).not.toContain('Read more');
  });

  it('deduplicates the same company listed twice', () => {
    const members = parseMemberList(html, bdma);
    expect(members.filter((m) => m.name.startsWith('Aurobindo'))).toHaveLength(1);
  });

  it('captures the member website, not a link back to the association', () => {
    const withSelfLink = `<table><tr><td>Alembic Pharmaceuticals Ltd</td><td>
      <a href="https://bdmai.org/profile/123">profile</a><a href="https://alembicpharmaceuticals.com">site</a></td></tr></table>`;
    const [m] = parseMemberList(withSelfLink, bdma);
    expect(m.website).toBe('https://alembicpharmaceuticals.com');
  });

  it('produces a stable natural key so re-import is idempotent', () => {
    const a = parseMemberList(html, bdma);
    const b = parseMemberList(html, bdma);
    expect(a.map((m) => m.sourceRef)).toEqual(b.map((m) => m.sourceRef));
    expect(a[0].sourceRef).toMatch(/^bdma:/);
  });

  it('returns nothing rather than junk when the page shape changes', () => {
    expect(parseMemberList('<div>Site under maintenance</div>', bdma)).toEqual([]);
    expect(parseMemberList('', bdma)).toEqual([]);
  });
});
