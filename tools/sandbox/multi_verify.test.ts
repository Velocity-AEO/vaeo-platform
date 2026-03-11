/**
 * tools/sandbox/multi_verify.test.ts
 *
 * Tests for multi-signal verifier.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  multiVerify,
  ALL_SIGNALS,
  type MultiVerifyResult,
  type VerifySignal,
} from './multi_verify.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const URL = 'https://example.com/page';

function mockFetch(html: string, status = 200): typeof fetch {
  return (async () =>
    new Response(html, { status, headers: { 'Content-Type': 'text/html' } })
  ) as unknown as typeof fetch;
}

function cleanHtml(overrides: Partial<{
  title: string;
  metaDesc: string;
  h1: string;
  canonical: string;
  schema: string;
  scripts: string;
  images: string;
  styles: string;
}> = {}): string {
  const {
    title = '<title>My Page</title>',
    metaDesc = '<meta name="description" content="A good description.">',
    h1 = '<h1>Welcome</h1>',
    canonical = '<link rel="canonical" href="https://example.com/page">',
    schema = '<script type="application/ld+json">{"@type":"WebPage","@context":"https://schema.org"}</script>',
    scripts = '<script src="/app.js" defer></script>',
    images = '<img src="/hero.jpg" alt="Hero" loading="lazy" width="800" height="600">',
    styles = '',
  } = overrides;

  return `<html><head>${title}${metaDesc}${canonical}${schema}${scripts}${styles}</head><body>${h1}${images}</body></html>`;
}

// ── Schema signal ────────────────────────────────────────────────────────────

describe('multiVerify — schema', () => {
  it('passes when valid JSON-LD exists', async () => {
    const result = await multiVerify(URL, { signals: ['schema'], fetch: mockFetch(cleanHtml()) });
    const sig = result.signals.find((s) => s.signal === 'schema')!;
    assert.equal(sig.status, 'PASS');
  });

  it('fails when no JSON-LD found', async () => {
    const html = cleanHtml({ schema: '' });
    const result = await multiVerify(URL, { signals: ['schema'], fetch: mockFetch(html) });
    const sig = result.signals.find((s) => s.signal === 'schema')!;
    assert.equal(sig.status, 'FAIL');
  });

  it('validates expected schema_type', async () => {
    const result = await multiVerify(URL, {
      signals: ['schema'],
      expected: { schema_type: 'Product' },
      fetch: mockFetch(cleanHtml()),
    });
    const sig = result.signals.find((s) => s.signal === 'schema')!;
    assert.equal(sig.status, 'FAIL'); // WebPage != Product
  });
});

// ── Title signal ─────────────────────────────────────────────────────────────

describe('multiVerify — title', () => {
  it('passes when title exists', async () => {
    const result = await multiVerify(URL, { signals: ['title'], fetch: mockFetch(cleanHtml()) });
    const sig = result.signals.find((s) => s.signal === 'title')!;
    assert.equal(sig.status, 'PASS');
    assert.equal(sig.actual, 'My Page');
  });

  it('fails when title is missing', async () => {
    const html = cleanHtml({ title: '' });
    const result = await multiVerify(URL, { signals: ['title'], fetch: mockFetch(html) });
    const sig = result.signals.find((s) => s.signal === 'title')!;
    assert.equal(sig.status, 'FAIL');
  });

  it('fails when title does not match expected', async () => {
    const result = await multiVerify(URL, {
      signals: ['title'],
      expected: { title: 'Expected Title' },
      fetch: mockFetch(cleanHtml()),
    });
    const sig = result.signals.find((s) => s.signal === 'title')!;
    assert.equal(sig.status, 'FAIL');
    assert.equal(sig.expected, 'Expected Title');
    assert.equal(sig.actual, 'My Page');
  });
});

// ── Meta description signal ──────────────────────────────────────────────────

describe('multiVerify — meta_description', () => {
  it('passes when meta description exists', async () => {
    const result = await multiVerify(URL, { signals: ['meta_description'], fetch: mockFetch(cleanHtml()) });
    const sig = result.signals.find((s) => s.signal === 'meta_description')!;
    assert.equal(sig.status, 'PASS');
  });

  it('fails when meta description missing', async () => {
    const html = cleanHtml({ metaDesc: '' });
    const result = await multiVerify(URL, { signals: ['meta_description'], fetch: mockFetch(html) });
    const sig = result.signals.find((s) => s.signal === 'meta_description')!;
    assert.equal(sig.status, 'FAIL');
  });
});

// ── H1 signal ────────────────────────────────────────────────────────────────

describe('multiVerify — h1', () => {
  it('passes with exactly one H1', async () => {
    const result = await multiVerify(URL, { signals: ['h1'], fetch: mockFetch(cleanHtml()) });
    const sig = result.signals.find((s) => s.signal === 'h1')!;
    assert.equal(sig.status, 'PASS');
    assert.equal(sig.actual, 'Welcome');
  });

  it('fails with multiple H1s', async () => {
    const html = cleanHtml({ h1: '<h1>First</h1><h1>Second</h1>' });
    const result = await multiVerify(URL, { signals: ['h1'], fetch: mockFetch(html) });
    const sig = result.signals.find((s) => s.signal === 'h1')!;
    assert.equal(sig.status, 'FAIL');
    assert.ok(sig.error?.includes('Multiple'));
  });
});

// ── Canonical signal ─────────────────────────────────────────────────────────

describe('multiVerify — canonical', () => {
  it('passes when canonical matches expected', async () => {
    const result = await multiVerify(URL, {
      signals: ['canonical'],
      expected: { canonical: 'https://example.com/page' },
      fetch: mockFetch(cleanHtml()),
    });
    const sig = result.signals.find((s) => s.signal === 'canonical')!;
    assert.equal(sig.status, 'PASS');
  });

  it('fails when canonical missing', async () => {
    const html = cleanHtml({ canonical: '' });
    const result = await multiVerify(URL, { signals: ['canonical'], fetch: mockFetch(html) });
    const sig = result.signals.find((s) => s.signal === 'canonical')!;
    assert.equal(sig.status, 'FAIL');
  });
});

// ── Render blocking signal ───────────────────────────────────────────────────

describe('multiVerify — render_blocking', () => {
  it('passes when all scripts are deferred', async () => {
    const result = await multiVerify(URL, { signals: ['render_blocking'], fetch: mockFetch(cleanHtml()) });
    const sig = result.signals.find((s) => s.signal === 'render_blocking')!;
    assert.equal(sig.status, 'PASS');
  });

  it('fails when sync script in head', async () => {
    const html = cleanHtml({ scripts: '<script src="/app.js"></script>' });
    const result = await multiVerify(URL, { signals: ['render_blocking'], fetch: mockFetch(html) });
    const sig = result.signals.find((s) => s.signal === 'render_blocking')!;
    assert.equal(sig.status, 'FAIL');
  });
});

// ── Lazy images signal ───────────────────────────────────────────────────────

describe('multiVerify — lazy_images', () => {
  it('skips when no images on page', async () => {
    const html = cleanHtml({ images: '' });
    const result = await multiVerify(URL, { signals: ['lazy_images'], fetch: mockFetch(html) });
    const sig = result.signals.find((s) => s.signal === 'lazy_images')!;
    assert.equal(sig.status, 'SKIP');
  });

  it('fails when images lack loading attribute', async () => {
    const html = cleanHtml({ images: '<img src="/hero.jpg" alt="Hero">' });
    const result = await multiVerify(URL, { signals: ['lazy_images'], fetch: mockFetch(html) });
    const sig = result.signals.find((s) => s.signal === 'lazy_images')!;
    assert.equal(sig.status, 'FAIL');
  });
});

// ── Font display signal ──────────────────────────────────────────────────────

describe('multiVerify — font_display', () => {
  it('fails when @font-face missing font-display', async () => {
    const html = cleanHtml({ styles: "<style>@font-face { font-family: 'X'; src: url('/x.woff2'); }</style>" });
    const result = await multiVerify(URL, { signals: ['font_display'], fetch: mockFetch(html) });
    const sig = result.signals.find((s) => s.signal === 'font_display')!;
    assert.equal(sig.status, 'FAIL');
  });

  it('passes when @font-face has font-display: swap', async () => {
    const html = cleanHtml({ styles: "<style>@font-face { font-family: 'X'; src: url('/x.woff2'); font-display: swap; }</style>" });
    const result = await multiVerify(URL, { signals: ['font_display'], fetch: mockFetch(html) });
    const sig = result.signals.find((s) => s.signal === 'font_display')!;
    assert.equal(sig.status, 'PASS');
  });
});

// ── Overall result ───────────────────────────────────────────────────────────

describe('multiVerify — overall', () => {
  it('overall=PASS when all signals pass', async () => {
    const result = await multiVerify(URL, { fetch: mockFetch(cleanHtml()) });
    assert.equal(result.overall, 'PASS');
    assert.equal(result.fail_count, 0);
  });

  it('overall=FAIL on fetch error', async () => {
    const failFetch = (() => { throw new Error('Network error'); }) as unknown as typeof fetch;
    const result = await multiVerify(URL, { signals: ['title'], fetch: failFetch });
    assert.equal(result.overall, 'FAIL');
    assert.equal(result.fail_count, 1);
  });

  it('overall=FAIL on HTTP error', async () => {
    const result = await multiVerify(URL, { signals: ['title'], fetch: mockFetch('', 500) });
    assert.equal(result.overall, 'FAIL');
  });

  it('overall=PARTIAL when some pass some fail', async () => {
    const html = cleanHtml({ schema: '' }); // schema fails, others pass
    const result = await multiVerify(URL, { signals: ['schema', 'title'], fetch: mockFetch(html) });
    assert.equal(result.overall, 'PARTIAL');
    assert.equal(result.pass_count, 1);
    assert.equal(result.fail_count, 1);
  });

  it('uses all signals by default', async () => {
    const result = await multiVerify(URL, { fetch: mockFetch(cleanHtml()) });
    assert.equal(result.signals.length, ALL_SIGNALS.length);
  });

  it('respects custom signal subset', async () => {
    const result = await multiVerify(URL, { signals: ['title', 'h1'], fetch: mockFetch(cleanHtml()) });
    assert.equal(result.signals.length, 2);
  });
});
