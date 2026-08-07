import { describe, it, expect } from 'vitest';
import { extractMetadata } from './crawler';

const OG_PAGE = `
<!doctype html><html><head>
  <title>Fallback Title</title>
  <meta property="og:title" content="FDA updates GMP guidance" />
  <meta property="og:description" content="A refreshed guidance restates ALCOA+ expectations." />
  <meta property="og:image" content="/images/hero.jpg" />
  <meta property="og:site_name" content="Regulatory Times" />
  <meta property="og:url" content="https://news.example.com/fda-gmp" />
  <link rel="canonical" href="https://news.example.com/fda-gmp" />
</head><body>...</body></html>`;

describe('extractMetadata', () => {
  it('prefers Open Graph tags and resolves a relative image against the base URL', () => {
    const m = extractMetadata(OG_PAGE, 'https://news.example.com/articles/123');
    expect(m.title).toBe('FDA updates GMP guidance');
    expect(m.summary).toContain('ALCOA+');
    expect(m.imageUrl).toBe('https://news.example.com/images/hero.jpg');
    expect(m.sourceName).toBe('Regulatory Times');
    expect(m.canonicalUrl).toBe('https://news.example.com/fda-gmp');
  });

  it('falls back to <title> and <meta name=description> when OG is absent', () => {
    const html = `<html><head><title>Plain Title</title>
      <meta name="description" content="Plain description."></head></html>`;
    const m = extractMetadata(html, 'https://plain.example.org/x');
    expect(m.title).toBe('Plain Title');
    expect(m.summary).toBe('Plain description.');
    // site_name falls back to the hostname (www stripped).
    expect(m.sourceName).toBe('plain.example.org');
  });

  it('handles reversed attribute order (content before property)', () => {
    const html = `<meta content="Reversed" property="og:title">`;
    expect(extractMetadata(html, 'https://e.com').title).toBe('Reversed');
  });

  it('sanitizes title/description (tags stripped, entities decoded)', () => {
    const html = `<meta property="og:title" content="Buy &amp; sell &lt;b&gt;APIs&lt;/b&gt;">`;
    // Entity-encoded markup is decoded to text, not executed; it is plain text.
    expect(extractMetadata(html, 'https://e.com').title).toBe('Buy & sell <b>APIs</b>');
  });

  it('DROPS a javascript: og:image (never yields an unsafe URL)', () => {
    const html = `<meta property="og:image" content="javascript:alert(1)">`;
    expect(extractMetadata(html, 'https://e.com').imageUrl).toBeNull();
  });

  it('is resilient to a page with no usable metadata', () => {
    const m = extractMetadata('<html><body>nothing</body></html>', 'https://bare.example.com/p');
    expect(m.title).toBe('');
    expect(m.imageUrl).toBeNull();
    expect(m.sourceName).toBe('bare.example.com');
  });
});
