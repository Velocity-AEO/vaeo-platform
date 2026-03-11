/**
 * tools/sandbox/lighthouse_runner.test.ts
 *
 * Tests for Lighthouse/PageSpeed Insights integration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runLighthouse, type LighthouseResult } from './lighthouse_runner.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const URL = 'https://example.com/page';

function mockPSI(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  ) as unknown as typeof fetch;
}

const fullResponse = {
  lighthouseResult: {
    categories: {
      performance:       { score: 0.85 },
      accessibility:     { score: 0.92 },
      'best-practices':  { score: 0.78 },
      seo:               { score: 0.95 },
    },
    audits: {
      'largest-contentful-paint': { numericValue: 2500 },
      'max-potential-fid':        { numericValue: 150 },
      'cumulative-layout-shift':  { numericValue: 0.12 },
      'render-blocking-resources': {
        score: 0.5,
        title: 'Eliminate render-blocking resources',
        details: { overallSavingsMs: 800 },
      },
      'unused-css-rules': {
        score: 0.8,
        title: 'Reduce unused CSS',
        details: { overallSavingsMs: 200 },
      },
      'unused-javascript': {
        score: 1,
        title: 'Reduce unused JavaScript',
      },
      'font-display': {
        score: 0,
        title: 'Ensure text remains visible during webfont load',
      },
    },
  },
};

// ── Score extraction ─────────────────────────────────────────────────────────

describe('runLighthouse — scores', () => {
  it('extracts category scores (0-100)', async () => {
    const result = await runLighthouse(URL, { fetch: mockPSI(fullResponse) });
    assert.equal(result.performance, 85);
    assert.equal(result.accessibility, 92);
    assert.equal(result.best_practices, 78);
    assert.equal(result.seo, 95);
  });

  it('returns 0 for missing categories', async () => {
    const partial = { lighthouseResult: { categories: {}, audits: {} } };
    const result = await runLighthouse(URL, { fetch: mockPSI(partial) });
    assert.equal(result.performance, 0);
    assert.equal(result.seo, 0);
  });
});

// ── Core Web Vitals ──────────────────────────────────────────────────────────

describe('runLighthouse — web vitals', () => {
  it('extracts LCP, FID, CLS', async () => {
    const result = await runLighthouse(URL, { fetch: mockPSI(fullResponse) });
    assert.equal(result.lcp, 2500);
    assert.equal(result.fid, 150);
    assert.equal(result.cls, 0.12);
  });

  it('returns 0 for missing metrics', async () => {
    const noMetrics = { lighthouseResult: { categories: {}, audits: {} } };
    const result = await runLighthouse(URL, { fetch: mockPSI(noMetrics) });
    assert.equal(result.lcp, 0);
    assert.equal(result.fid, 0);
    assert.equal(result.cls, 0);
  });
});

// ── Opportunities ────────────────────────────────────────────────────────────

describe('runLighthouse — opportunities', () => {
  it('extracts failed audit opportunities', async () => {
    const result = await runLighthouse(URL, { fetch: mockPSI(fullResponse) });
    assert.ok(result.opportunities.length >= 2); // render-blocking + font-display at least
  });

  it('includes savings_ms when available', async () => {
    const result = await runLighthouse(URL, { fetch: mockPSI(fullResponse) });
    const renderBlock = result.opportunities.find((o) => o.id === 'render-blocking-resources');
    assert.ok(renderBlock);
    assert.equal(renderBlock!.savings_ms, 800);
  });

  it('excludes passing audits (score=1)', async () => {
    const result = await runLighthouse(URL, { fetch: mockPSI(fullResponse) });
    const unused = result.opportunities.find((o) => o.id === 'unused-javascript');
    assert.equal(unused, undefined);
  });

  it('includes audits with score=0', async () => {
    const result = await runLighthouse(URL, { fetch: mockPSI(fullResponse) });
    const fontDisplay = result.opportunities.find((o) => o.id === 'font-display');
    assert.ok(fontDisplay);
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('runLighthouse — error handling', () => {
  it('returns error on HTTP error', async () => {
    const result = await runLighthouse(URL, { fetch: mockPSI({}, 500) });
    assert.ok(result.error?.includes('500'));
    assert.equal(result.performance, 0);
  });

  it('returns error on network failure', async () => {
    const failFetch = (() => { throw new Error('Network timeout'); }) as unknown as typeof fetch;
    const result = await runLighthouse(URL, { fetch: failFetch });
    assert.ok(result.error?.includes('Network timeout'));
  });

  it('returns error when API returns error object', async () => {
    const errResp = { error: { message: 'Invalid URL' } };
    const result = await runLighthouse(URL, { fetch: mockPSI(errResp) });
    assert.ok(result.error?.includes('Invalid URL'));
  });

  it('returns error when no lighthouseResult', async () => {
    const result = await runLighthouse(URL, { fetch: mockPSI({}) });
    assert.ok(result.error?.includes('No lighthouseResult'));
  });

  it('never throws', async () => {
    const badFetch = (() => { throw new TypeError('fetch is not defined'); }) as unknown as typeof fetch;
    const result = await runLighthouse(URL, { fetch: badFetch });
    assert.ok(result.error);
    assert.equal(result.performance, 0);
  });
});

// ── Options ──────────────────────────────────────────────────────────────────

describe('runLighthouse — options', () => {
  it('defaults to mobile strategy', async () => {
    let capturedUrl = '';
    const captureFetch = (async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ lighthouseResult: { categories: {}, audits: {} } }), { status: 200 });
    }) as unknown as typeof fetch;

    await runLighthouse(URL, { fetch: captureFetch });
    assert.ok(capturedUrl.includes('strategy=mobile'));
  });

  it('respects desktop strategy', async () => {
    let capturedUrl = '';
    const captureFetch = (async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ lighthouseResult: { categories: {}, audits: {} } }), { status: 200 });
    }) as unknown as typeof fetch;

    await runLighthouse(URL, { strategy: 'desktop', fetch: captureFetch });
    assert.ok(capturedUrl.includes('strategy=desktop'));
  });

  it('includes API key when provided', async () => {
    let capturedUrl = '';
    const captureFetch = (async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ lighthouseResult: { categories: {}, audits: {} } }), { status: 200 });
    }) as unknown as typeof fetch;

    await runLighthouse(URL, { apiKey: 'test-key-123', fetch: captureFetch });
    assert.ok(capturedUrl.includes('key=test-key-123'));
  });

  it('sets url and fetchedAt in result', async () => {
    const result = await runLighthouse(URL, {
      fetch: mockPSI({ lighthouseResult: { categories: {}, audits: {} } }),
    });
    assert.equal(result.url, URL);
    assert.ok(result.fetchedAt);
  });
});
