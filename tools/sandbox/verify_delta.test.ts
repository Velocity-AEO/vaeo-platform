/**
 * tools/sandbox/verify_delta.test.ts
 *
 * Tests for before/after delta comparison.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  measureDelta,
  captureSnapshot,
  type DeltaResult,
} from './verify_delta.js';
import type {
  MultiVerifyResult,
  SignalResult,
  VerifySignal,
} from './multi_verify.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const URL = 'https://example.com/page';

function mockFetch(html: string): typeof fetch {
  return (async () =>
    new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
  ) as unknown as typeof fetch;
}

function makeSnapshot(
  signalStatuses: Array<[VerifySignal, 'PASS' | 'FAIL' | 'SKIP']>,
): MultiVerifyResult {
  const signals: SignalResult[] = signalStatuses.map(([signal, status]) => ({
    signal,
    status,
  }));
  const pass_count = signals.filter((s) => s.status === 'PASS').length;
  const fail_count = signals.filter((s) => s.status === 'FAIL').length;
  return {
    url: URL,
    fetchedAt: new Date().toISOString(),
    signals,
    overall: fail_count === 0 ? 'PASS' : pass_count === 0 ? 'FAIL' : 'PARTIAL',
    pass_count,
    fail_count,
  };
}

const cleanHtml = `<html><head>
  <title>My Page</title>
  <meta name="description" content="A good description.">
  <link rel="canonical" href="https://example.com/page">
  <script type="application/ld+json">{"@type":"WebPage","@context":"https://schema.org"}</script>
  <script src="/app.js" defer></script>
</head><body>
  <h1>Welcome</h1>
  <img src="/hero.jpg" alt="Hero" loading="lazy" width="800" height="600">
</body></html>`;

const brokenHtml = `<html><head>
  <script src="/app.js"></script>
</head><body>
  <img src="/hero.jpg">
</body></html>`;

// ── captureSnapshot ──────────────────────────────────────────────────────────

describe('captureSnapshot', () => {
  it('returns a MultiVerifyResult', async () => {
    const snap = await captureSnapshot(URL, { fetch: mockFetch(cleanHtml) });
    assert.equal(snap.url, URL);
    assert.ok(snap.signals.length > 0);
    assert.ok(snap.fetchedAt);
  });

  it('captures failing signals', async () => {
    const snap = await captureSnapshot(URL, {
      signals: ['schema', 'title'],
      fetch: mockFetch(brokenHtml),
    });
    const schema = snap.signals.find((s) => s.signal === 'schema')!;
    assert.equal(schema.status, 'FAIL');
  });
});

// ── measureDelta — improvement ───────────────────────────────────────────────

describe('measureDelta — improvement', () => {
  it('detects FAIL→PASS as improved', async () => {
    const before = makeSnapshot([
      ['title', 'FAIL'],
      ['schema', 'FAIL'],
    ]);

    const result = await measureDelta(URL, before, {
      signals: ['title', 'schema'],
      fetch: mockFetch(cleanHtml),
    });

    assert.equal(result.verdict, 'improved');
    assert.ok(result.improved_signals.includes('title'));
    assert.ok(result.improved_signals.includes('schema'));
    assert.equal(result.net_improvement, 2);
  });

  it('net_improvement counts correctly', async () => {
    const before = makeSnapshot([
      ['title', 'FAIL'],
      ['h1', 'PASS'],
      ['schema', 'FAIL'],
    ]);

    const result = await measureDelta(URL, before, {
      signals: ['title', 'h1', 'schema'],
      fetch: mockFetch(cleanHtml),
    });

    assert.ok(result.net_improvement >= 1);
    assert.equal(result.verdict, 'improved');
  });
});

// ── measureDelta — regression ────────────────────────────────────────────────

describe('measureDelta — regression', () => {
  it('detects PASS→FAIL as regressed', async () => {
    const before = makeSnapshot([
      ['title', 'PASS'],
      ['schema', 'PASS'],
      ['render_blocking', 'PASS'],
    ]);

    const result = await measureDelta(URL, before, {
      signals: ['title', 'schema', 'render_blocking'],
      fetch: mockFetch(brokenHtml),
    });

    assert.equal(result.verdict, 'regressed');
    assert.ok(result.regressed_signals.length > 0);
    assert.ok(result.net_improvement < 0);
  });

  it('regressed_signals contains the right signals', async () => {
    const before = makeSnapshot([
      ['title', 'PASS'],
      ['schema', 'PASS'],
    ]);

    const result = await measureDelta(URL, before, {
      signals: ['title', 'schema'],
      fetch: mockFetch(brokenHtml),
    });

    assert.ok(result.regressed_signals.includes('title'));
    assert.ok(result.regressed_signals.includes('schema'));
  });
});

// ── measureDelta — unchanged ─────────────────────────────────────────────────

describe('measureDelta — unchanged', () => {
  it('verdict=unchanged when no transitions', async () => {
    const before = makeSnapshot([
      ['title', 'PASS'],
      ['schema', 'PASS'],
    ]);

    const result = await measureDelta(URL, before, {
      signals: ['title', 'schema'],
      fetch: mockFetch(cleanHtml),
    });

    assert.equal(result.verdict, 'unchanged');
    assert.equal(result.net_improvement, 0);
    assert.equal(result.improved_signals.length, 0);
    assert.equal(result.regressed_signals.length, 0);
  });

  it('SKIP signals are treated as unchanged', async () => {
    const before = makeSnapshot([
      ['font_display', 'SKIP'],
      ['lazy_images', 'SKIP'],
    ]);

    const result = await measureDelta(URL, before, {
      signals: ['font_display', 'lazy_images'],
      fetch: mockFetch('<html><head><title>X</title></head><body></body></html>'),
    });

    assert.equal(result.unchanged_signals.length, 2);
    assert.equal(result.verdict, 'unchanged');
  });

  it('FAIL→FAIL is unchanged', async () => {
    const before = makeSnapshot([
      ['title', 'FAIL'],
      ['schema', 'FAIL'],
    ]);

    const result = await measureDelta(URL, before, {
      signals: ['title', 'schema'],
      fetch: mockFetch(brokenHtml),
    });

    assert.ok(result.unchanged_signals.includes('title'));
    assert.ok(result.unchanged_signals.includes('schema'));
  });
});

// ── measureDelta — mixed ─────────────────────────────────────────────────────

describe('measureDelta — mixed', () => {
  it('handles mixed improvements and regressions', async () => {
    // Before: title=FAIL, render_blocking=PASS
    // After (cleanHtml): title=PASS, render_blocking=PASS
    const before = makeSnapshot([
      ['title', 'FAIL'],
      ['render_blocking', 'PASS'],
    ]);

    const result = await measureDelta(URL, before, {
      signals: ['title', 'render_blocking'],
      fetch: mockFetch(cleanHtml),
    });

    assert.ok(result.improved_signals.includes('title'));
    assert.equal(result.regressed_signals.length, 0);
  });

  it('includes both before and after snapshots in result', async () => {
    const before = makeSnapshot([['title', 'FAIL']]);

    const result = await measureDelta(URL, before, {
      signals: ['title'],
      fetch: mockFetch(cleanHtml),
    });

    assert.ok(result.before);
    assert.ok(result.after);
    assert.equal(result.before.signals[0].status, 'FAIL');
    assert.equal(result.after.signals[0].status, 'PASS');
  });

  it('sets measured_at timestamp', async () => {
    const before = makeSnapshot([['title', 'PASS']]);
    const result = await measureDelta(URL, before, {
      signals: ['title'],
      fetch: mockFetch(cleanHtml),
    });
    assert.ok(result.measured_at);
    assert.ok(new Date(result.measured_at).getTime() > 0);
  });
});
