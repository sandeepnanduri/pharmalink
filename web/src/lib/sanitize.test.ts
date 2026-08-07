import { describe, it, expect } from 'vitest';
import { cleanText, cleanBody, safeHttpUrl, decodeEntities } from './sanitize';

describe('cleanText', () => {
  it('strips HTML tags so markup can never reach an attribute/script context', () => {
    // Tags become spaces; the script's inert text survives but the markup is gone.
    expect(cleanText('<b>Hello</b> <script>alert(1)</script>world')).toBe('Hello alert(1) world');
    expect(cleanText('<img src=x onerror=alert(1)>caption')).toBe('caption');
  });
  it('decodes entities and collapses whitespace', () => {
    expect(cleanText('Tom &amp; Jerry\n\n  spaced')).toBe('Tom & Jerry spaced');
  });
  it('caps length with an ellipsis', () => {
    expect(cleanText('x'.repeat(20), 5)).toBe('xxxxx…');
  });
  it('returns empty string for nullish input', () => {
    expect(cleanText(null)).toBe('');
    expect(cleanText(undefined)).toBe('');
  });
});

describe('safeHttpUrl — the href XSS guard', () => {
  it('accepts http and https', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/');
  });
  it('REJECTS javascript:, data:, vbscript:, file:', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpUrl('vbscript:msgbox(1)')).toBeNull();
    expect(safeHttpUrl('file:///etc/passwd')).toBeNull();
  });
  it('rejects garbage', () => {
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl('')).toBeNull();
  });
});

describe('cleanBody', () => {
  it('preserves paragraph breaks but collapses runs of blank lines', () => {
    expect(cleanBody('Para one.\n\n\n\nPara two.')).toBe('Para one.\n\nPara two.');
  });
  it('strips tags from a body too', () => {
    expect(cleanBody('<p>Hi</p>')).toBe('Hi');
  });
});

describe('decodeEntities', () => {
  it('handles numeric and hex entities', () => {
    expect(decodeEntities('A&#66;C')).toBe('ABC');
    expect(decodeEntities('&#x41;&#x42;')).toBe('AB');
  });
});
