/**
 * packages/validators/src/w3c.test.ts
 *
 * Unit tests for the W3C HTML validator.
 * All HTTP calls mocked — no real W3C API calls.
 *
 * Tests confirm:
 *   1.  Valid HTML returns passed=true with empty errors[]
 *   2.  HTML with an unclosed tag returns passed=false
 *   3.  Warnings do not cause passed=false
 *   4.  Cache hit returns without making API call
 *   5.  API unreachable returns passed=true with warning message, no throw
 *   6.  SHA-256 cache key is consistent for identical HTML
 *   7.  parseW3CResponse separates errors and warnings correctly
 *   8.  error_count and warning_count match arrays
 *   9.  ActionLog: w3c:start + w3c:complete on success
 *  10.  ActionLog: w3c:blocked written when errors found
 *  11.  ActionLog: w3c:cache_hit on cache hit
 *  12.  ActionLog: w3c:api_unavailable when fetch fails
 *  13.  cached=true on cache hit, cached=false on fresh fetch
 *  14.  Multiple errors all reported in errors[]
 *  15.  cacheKey uses SHA-256 of HTML, not URL
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  runW3C,
  parseW3CResponse,
  htmlHash,
  cacheKey,
  type W3CRequest,
  type W3CResult,
  type W3COps,
} from './w3c.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureStdout(fn: () => Promise<void>): Promise<string[]>;
function captureStdout(fn: () => void): string[];
function captureStdout(fn: () => void | Promise<void>): string[] | Promise<string[]> {
  const captured: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  const result = fn();
  if (result && typeof (result as Promise<void>).then === 'function') {
    return (result as Promise<void>).finally(() => { process.stdout.write = orig; }).then(() => captured);
  }
  process.stdout.write = orig;
  return captured;
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((l) => {
    const t = l.trim();
    if (!t.startsWith('{')) return [];
    try { return [JSON.parse(t) as Record<string, unknown>]; } catch { return []; }
  });
}

function req(overrides: Partial<W3CRequest> = {}): W3CRequest {
  return {
    run_id:    'run-w3c-001',
    tenant_id: 't-aaa',
    site_id:   's-bbb',
    url:       'https://cococabanalife.com/products/sun-glow-bikini',
    html:      '<html><head><title>Test</title></head><body><p>Hello</p></body></html>',
    ...overrides,
  };
}

/** No-op sleep so tests never wait 2 seconds. */
const instantSleep = async (): Promise<void> => {};

function mockOps(overrides: {
  apiResp?:    { messages?: Array<{ type?: string; message?: string; lastLine?: number; lastColumn?: number }> } | Error;
  cached?:     W3CResult | null;
  cacheSetFn?: (key: string, val: W3CResult) => void;
} = {}): Partial<W3COps> {
  let apiCallCount = 0;
  return {
    sleep:    instantSleep,
    cacheGet: async () => (overrides.cached !== undefined ? overrides.cached : null),
    cacheSet: async (key, val) => { overrides.cacheSetFn?.(key, val); },
    postHtml: async () => {
      apiCallCount++;
      if (overrides.apiResp instanceof Error) throw overrides.apiResp;
      return overrides.apiResp ?? { messages: [] };
    },
    _apiCallCount: () => apiCallCount,
  } as Partial<W3COps> & { _apiCallCount: () => number };
}

function validApiResp() {
  return { messages: [] };
}

function errorApiResp(msgs: Array<{ type: string; message: string; lastLine?: number }>) {
  return { messages: msgs };
}

function w3cResult(overrides: Partial<W3CResult> = {}): W3CResult {
  return {
    url:           req().url,
    passed:        true,
    errors:        [],
    warnings:      [],
    error_count:   0,
    warning_count: 0,
    cached:        false,
    run_id:        'run-w3c-001',
    tenant_id:     't-aaa',
    ...overrides,
  };
}

// ── htmlHash + cacheKey ───────────────────────────────────────────────────────

describe('htmlHash', () => {
  it('produces a hex SHA-256 string', () => {
    const h = htmlHash('<html></html>');
    assert.match(h, /^[0-9a-f]{64}$/);
  });

  it('identical HTML produces identical hash', () => {
    const html = '<html><body>same</body></html>';
    assert.equal(htmlHash(html), htmlHash(html));
  });

  it('different HTML produces different hash', () => {
    assert.notEqual(htmlHash('<p>a</p>'), htmlHash('<p>b</p>'));
  });

  it('matches node:crypto sha256 directly', () => {
    const html     = '<html></html>';
    const expected = createHash('sha256').update(html, 'utf8').digest('hex');
    assert.equal(htmlHash(html), expected);
  });
});

describe('cacheKey', () => {
  it('format: w3c:{tenant_id}:{sha256_of_html}', () => {
    const r   = req();
    const key = cacheKey(r);
    assert.ok(key.startsWith(`w3c:${r.tenant_id}:`));
    assert.ok(key.endsWith(htmlHash(r.html)));
  });

  it('same HTML at different URLs produces same cache key', () => {
    const html = '<html><body>same</body></html>';
    const r1   = req({ url: 'https://example.com/a', html });
    const r2   = req({ url: 'https://example.com/b', html });
    assert.equal(cacheKey(r1), cacheKey(r2));
  });

  it('different HTML produces different cache key', () => {
    const r1 = req({ html: '<html><body>a</body></html>' });
    const r2 = req({ html: '<html><body>b</body></html>' });
    assert.notEqual(cacheKey(r1), cacheKey(r2));
  });
});

// ── parseW3CResponse ─────────────────────────────────────────────────────────

describe('parseW3CResponse', () => {
  it('returns empty arrays when messages is absent', () => {
    const { errors, warnings } = parseW3CResponse({});
    assert.deepEqual(errors,   []);
    assert.deepEqual(warnings, []);
  });

  it('separates errors from warnings', () => {
    const body = {
      messages: [
        { type: 'error',   message: 'Unclosed div',  lastLine: 10 },
        { type: 'warning', message: 'Obsolete attr', lastLine: 5  },
        { type: 'info',    message: 'Some info'                   },
      ],
    };
    const { errors, warnings } = parseW3CResponse(body);
    assert.equal(errors.length,   1);
    assert.equal(warnings.length, 1);
    assert.equal(errors[0].type,    'error');
    assert.equal(errors[0].message, 'Unclosed div');
    assert.equal(errors[0].line,    10);
    assert.equal(warnings[0].type,    'warning');
    assert.equal(warnings[0].message, 'Obsolete attr');
  });

  it('does not include info messages in errors or warnings', () => {
    const body = { messages: [{ type: 'info', message: 'informational' }] };
    const { errors, warnings } = parseW3CResponse(body);
    assert.equal(errors.length,   0);
    assert.equal(warnings.length, 0);
  });

  it('includes line and column when present', () => {
    const body = { messages: [{ type: 'error', message: 'Bad tag', lastLine: 42, lastColumn: 7 }] };
    const { errors } = parseW3CResponse(body);
    assert.equal(errors[0].line,   42);
    assert.equal(errors[0].column, 7);
  });

  it('omits line/column when absent', () => {
    const body = { messages: [{ type: 'error', message: 'Bad tag' }] };
    const { errors } = parseW3CResponse(body);
    assert.ok(!('line'   in errors[0]));
    assert.ok(!('column' in errors[0]));
  });
});

// ── runW3C — passing ──────────────────────────────────────────────────────────

describe('runW3C — valid HTML', () => {
  it('returns passed=true with empty errors[] for valid HTML', async () => {
    const ops = mockOps({ apiResp: validApiResp() });
    const r   = await runW3C(req(), ops);
    assert.equal(r.passed,      true);
    assert.deepEqual(r.errors,  []);
    assert.equal(r.error_count, 0);
    assert.equal(r.cached,      false);
  });

  it('includes run_id, tenant_id, url in result', async () => {
    const ops = mockOps();
    const r   = await runW3C(req(), ops);
    assert.equal(r.run_id,    'run-w3c-001');
    assert.equal(r.tenant_id, 't-aaa');
    assert.equal(r.url,       req().url);
  });
});

// ── runW3C — error detection ──────────────────────────────────────────────────

describe('runW3C — HTML errors', () => {
  it('returns passed=false when response contains error messages', async () => {
    const ops = mockOps({
      apiResp: errorApiResp([{ type: 'error', message: 'Unclosed element "div"', lastLine: 15 }]),
    });
    const r = await runW3C(req(), ops);
    assert.equal(r.passed,      false);
    assert.equal(r.error_count, 1);
    assert.equal(r.errors[0].message, 'Unclosed element "div"');
    assert.equal(r.errors[0].line,    15);
  });

  it('reports multiple errors', async () => {
    const ops = mockOps({
      apiResp: errorApiResp([
        { type: 'error', message: 'Unclosed div',    lastLine: 10 },
        { type: 'error', message: 'Bad attribute',   lastLine: 20 },
        { type: 'error', message: 'Missing end tag', lastLine: 30 },
      ]),
    });
    const r = await runW3C(req(), ops);
    assert.equal(r.passed,      false);
    assert.equal(r.error_count, 3);
    assert.equal(r.errors.length, 3);
  });

  it('warnings do not cause passed=false', async () => {
    const ops = mockOps({
      apiResp: {
        messages: [
          { type: 'warning', message: 'Obsolete element "font"', lastLine: 5 },
          { type: 'warning', message: 'Missing lang attribute',  lastLine: 1 },
        ],
      },
    });
    const r = await runW3C(req(), ops);
    assert.equal(r.passed,        true);
    assert.equal(r.error_count,   0);
    assert.equal(r.warning_count, 2);
    assert.equal(r.warnings.length, 2);
  });

  it('errors and warnings can coexist — passed=false when errors present', async () => {
    const ops = mockOps({
      apiResp: {
        messages: [
          { type: 'error',   message: 'Unclosed div'          },
          { type: 'warning', message: 'Obsolete attr'         },
          { type: 'warning', message: 'Missing lang'          },
          { type: 'warning', message: 'Trailing slash on void' },
        ],
      },
    });
    const r = await runW3C(req(), ops);
    assert.equal(r.passed,        false);
    assert.equal(r.error_count,   1);
    assert.equal(r.warning_count, 3);
  });
});

// ── runW3C — cache hit ────────────────────────────────────────────────────────

describe('runW3C — cache hit', () => {
  it('returns cached result and skips API call', async () => {
    const cached = w3cResult({ error_count: 0, passed: true });
    const ops    = mockOps({ cached }) as Partial<W3COps> & { _apiCallCount: () => number };
    const r      = await runW3C(req(), ops);
    assert.equal(r.cached, true);
    assert.equal(ops._apiCallCount(), 0, 'API must not be called on cache hit');
  });
});

// ── runW3C — API unavailable ─────────────────────────────────────────────────

describe('runW3C — API unavailable', () => {
  it('returns passed=true with warning message when fetch throws', async () => {
    const ops = mockOps({ apiResp: new Error('ECONNREFUSED') });
    let r: W3CResult | undefined;
    await assert.doesNotReject(async () => { r = await runW3C(req(), ops); });
    assert.ok(r);
    assert.equal(r!.passed,      true,  'should pass when API unavailable');
    assert.equal(r!.error_count, 0);
    assert.ok(
      r!.warnings.some((w) => w.message.includes('w3c_api_unreachable')),
      'warning message about unavailability expected',
    );
  });

  it('does not throw on API failure', async () => {
    const ops = mockOps({ apiResp: new Error('Network timeout') });
    await assert.doesNotReject(() => runW3C(req(), ops));
  });
});

// ── runW3C — ActionLog ────────────────────────────────────────────────────────

describe('runW3C — ActionLog', () => {
  it('writes w3c:start and w3c:complete on success', async () => {
    const ops   = mockOps({ apiResp: validApiResp() });
    const lines = await captureStdout(async () => { await runW3C(req(), ops); });
    const entries = parseLines(lines);

    const start    = entries.find((e) => e['stage'] === 'w3c:start');
    const complete = entries.find((e) => e['stage'] === 'w3c:complete');

    assert.ok(start,    'w3c:start expected');
    assert.ok(complete, 'w3c:complete expected');
    assert.equal(complete!['status'], 'ok');
    const meta = complete!['metadata'] as Record<string, unknown>;
    assert.equal(meta['error_count'],   0);
    assert.equal(meta['warning_count'], 0);
    assert.equal(meta['passed'],        true);
  });

  it('writes w3c:blocked when errors found — first 3 errors in metadata', async () => {
    const ops = mockOps({
      apiResp: errorApiResp([
        { type: 'error', message: 'Unclosed element "div"',   lastLine: 15 },
        { type: 'error', message: 'Bad value for attribute',  lastLine: 22 },
        { type: 'error', message: 'Element not allowed here', lastLine: 35 },
        { type: 'error', message: 'Fourth error ignored',     lastLine: 40 },
      ]),
    });
    const lines   = await captureStdout(async () => { await runW3C(req(), ops); });
    const entries = parseLines(lines);
    const blocked = entries.find((e) => e['stage'] === 'w3c:blocked');

    assert.ok(blocked, 'w3c:blocked expected');
    assert.equal(blocked!['status'], 'failed');

    const meta = blocked!['metadata'] as Record<string, unknown>;
    const firstErrors = meta['first_errors'] as string[];
    assert.equal(firstErrors.length, 3, 'only first 3 errors in ActionLog');
    assert.ok(firstErrors[0].includes('Unclosed'));
  });

  it('does NOT write w3c:blocked when passed', async () => {
    const ops   = mockOps({ apiResp: validApiResp() });
    const lines = await captureStdout(async () => { await runW3C(req(), ops); });
    const entries = parseLines(lines);
    const blocked = entries.find((e) => e['stage'] === 'w3c:blocked');
    assert.ok(!blocked, 'w3c:blocked should not be written on success');
  });

  it('writes w3c:cache_hit when returning from cache', async () => {
    const ops   = mockOps({ cached: w3cResult() });
    const lines = await captureStdout(async () => { await runW3C(req(), ops); });
    const entries = parseLines(lines);
    const hit = entries.find((e) => e['stage'] === 'w3c:cache_hit');
    assert.ok(hit, 'w3c:cache_hit expected');
    assert.equal(hit!['status'], 'ok');
  });

  it('writes w3c:api_unavailable when fetch fails', async () => {
    const ops   = mockOps({ apiResp: new Error('timeout') });
    const lines = await captureStdout(async () => { await runW3C(req(), ops); });
    const entries = parseLines(lines);
    const unavail = entries.find((e) => e['stage'] === 'w3c:api_unavailable');
    assert.ok(unavail, 'w3c:api_unavailable expected');
    assert.equal(unavail!['status'], 'skipped');
  });

  it('ActionLog for blocked deployment matches spec — unclosed div', async () => {
    const ops = mockOps({
      apiResp: errorApiResp([
        { type: 'error', message: 'Unclosed element "div"', lastLine: 42 },
      ]),
    });
    const lines   = await captureStdout(async () => {
      await runW3C(req({ url: 'https://cococabanalife.com/products/sun-glow' }), ops);
    });
    const entries = parseLines(lines);

    const complete = entries.find((e) => e['stage'] === 'w3c:complete');
    const blocked  = entries.find((e) => e['stage'] === 'w3c:blocked');

    assert.ok(complete);
    assert.equal(complete!['status'], 'failed');
    assert.equal((complete!['metadata'] as Record<string, unknown>)['error_count'], 1);

    assert.ok(blocked);
    assert.equal(blocked!['run_id'],    'run-w3c-001');
    assert.equal(blocked!['tenant_id'], 't-aaa');
    assert.equal(blocked!['command'],   'w3c');
    const blockedMeta = blocked!['metadata'] as Record<string, unknown>;
    const firstErrors = blockedMeta['first_errors'] as string[];
    assert.ok(firstErrors[0].includes('div'));
  });
});

// ── runW3C — cache write ──────────────────────────────────────────────────────

describe('runW3C — cache write', () => {
  it('writes result to cache after fresh fetch', async () => {
    let cachedKey   = '';
    let cachedValue: W3CResult | undefined;

    const ops = mockOps({
      apiResp: validApiResp(),
      cacheSetFn: (k, v) => { cachedKey = k; cachedValue = v; },
    });

    const r = req();
    await runW3C(r, ops);
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(cachedKey, cacheKey(r));
    assert.ok(cachedValue, 'cache should be written');
    assert.equal(cachedValue!.passed, true);
  });
});
