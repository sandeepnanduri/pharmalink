import { describe, it, expect, vi, afterEach } from 'vitest';

// `server-only` throws when imported outside a server runtime; stub it for tests.
vi.mock('server-only', () => ({}));

import { fetchLinkPreview } from './crawler.server';

afterEach(() => vi.unstubAllGlobals());

const HTML = `<!doctype html><html><head>
  <meta property="og:title" content="Crawled Title">
  <meta property="og:description" content="Crawled summary text">
  <meta property="og:image" content="https://cdn.example.com/x.jpg">
  <meta property="og:site_name" content="Example News">
</head><body></body></html>`;

describe('fetchLinkPreview — SSRF-safe crawl', () => {
  it('BLOCKS a metadata/loopback host and never issues the fetch', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const r = await fetchLinkPreview('http://169.254.169.254/latest/meta-data/');
    expect(r).toEqual({ ok: false, error: 'blockedUrl' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects javascript:/file: schemes up front', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect((await fetchLinkPreview('javascript:alert(1)')).ok).toBe(false);
    expect((await fetchLinkPreview('file:///etc/passwd')).ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches a public host (literal IP — no DNS) and extracts sanitized metadata', async () => {
    vi.stubGlobal('fetch', async () => new Response(HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
    const r = await fetchLinkPreview('http://93.184.216.34/article');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.title).toBe('Crawled Title');
      expect(r.data.summary).toBe('Crawled summary text');
      expect(r.data.imageUrl).toBe('https://cdn.example.com/x.jpg');
      expect(r.data.sourceName).toBe('Example News');
    }
  });

  it('rejects a non-HTML content type', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } }));
    expect(await fetchLinkPreview('http://93.184.216.34/api')).toEqual({ ok: false, error: 'notHtml' });
  });

  it('reports a failed upstream response', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500, headers: { 'content-type': 'text/html' } }));
    expect(await fetchLinkPreview('http://93.184.216.34/x')).toEqual({ ok: false, error: 'fetchFailed' });
  });
});
