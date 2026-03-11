/**
 * tools/schema/snippet_installer.test.ts
 *
 * Tests for getLiveThemeId and installSnippet.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLiveThemeId,
  installSnippet,
  _injectFetch,
  _resetInjections,
  _getSnippetContent,
} from './snippet_installer.js';

const SNIPPET_CONTENT_FOR_TEST = _getSnippetContent();

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockResponse(status: number, body: unknown): Response {
  return {
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
    text:   async () => JSON.stringify(body),
  } as unknown as Response;
}

type FetchCall = { url: string; method: string; body?: string };

function recordingFetch(responses: Array<{ status: number; body: unknown }>, calls: FetchCall[]) {
  let i = 0;
  return async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return mockResponse(r.status, r.body);
  };
}

const MINIMAL_THEME = `<!doctype html><html><head><title>Store</title></head><body></body></html>`;
const THEME_WITH_RENDER = `<!doctype html><html><head>{% render "velocity-schema" %}<title>Store</title></head><body></body></html>`;

// ── getLiveThemeId ────────────────────────────────────────────────────────────

describe('getLiveThemeId', () => {
  afterEach(() => _resetInjections());

  it('returns id of main theme', async () => {
    _injectFetch(async () => mockResponse(200, {
      themes: [
        { id: 100, role: 'unpublished' },
        { id: 200, role: 'main' },
      ],
    }));

    const id = await getLiveThemeId('example.myshopify.com', 'tok');
    assert.equal(id, '200');
  });

  it('returns null when no main theme', async () => {
    _injectFetch(async () => mockResponse(200, { themes: [{ id: 1, role: 'unpublished' }] }));
    const id = await getLiveThemeId('example.myshopify.com', 'tok');
    assert.equal(id, null);
  });

  it('returns null on 4xx', async () => {
    _injectFetch(async () => mockResponse(401, {}));
    const id = await getLiveThemeId('example.myshopify.com', 'tok');
    assert.equal(id, null);
  });

  it('returns null when fetch throws', async () => {
    _injectFetch(async () => { throw new Error('Network error'); });
    const id = await getLiveThemeId('example.myshopify.com', 'tok');
    assert.equal(id, null);
  });
});

// ── installSnippet — already installed ───────────────────────────────────────

describe('installSnippet — already installed', () => {
  afterEach(() => _resetInjections());

  it('detects render tag and skips theme.liquid PUT, but still checks snippet', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: THEME_WITH_RENDER } } },  // GET theme.liquid
      { status: 200, body: { asset: { value: SNIPPET_CONTENT_FOR_TEST } } },  // GET snippet (matches)
    ], calls));

    const result = await installSnippet('example.myshopify.com', 'tok', '42');

    assert.equal(result.ok, true);
    assert.equal(result.alreadyInstalled, true);
    assert.equal(result.snippetUpdated, false);
    assert.equal(calls.length, 2, 'GET theme.liquid + GET snippet');
  });

  it('re-uploads snippet when content differs even if render tag present', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: THEME_WITH_RENDER } } },  // GET theme.liquid
      { status: 200, body: { asset: { value: 'old snippet content' } } },  // GET snippet (stale)
      { status: 200, body: { asset: {} } },  // PUT snippet
    ], calls));

    const result = await installSnippet('example.myshopify.com', 'tok', '42');

    assert.equal(result.ok, true);
    assert.equal(result.alreadyInstalled, true);
    assert.equal(result.snippetUpdated, true);
    assert.equal(calls.length, 3, 'GET theme + GET snippet + PUT snippet');
    assert.equal(calls[2]!.method, 'PUT');
    const putBody = JSON.parse(calls[2]!.body ?? '{}') as { asset: { key: string } };
    assert.equal(putBody.asset.key, 'snippets/velocity-schema.liquid');
  });
});

// ── installSnippet — fresh install ───────────────────────────────────────────

describe('installSnippet — fresh install', () => {
  afterEach(() => _resetInjections());

  it('injects render tag and PUTs theme.liquid then snippet', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: MINIMAL_THEME } } },  // GET theme.liquid
      { status: 200, body: { asset: { key: 'layout/theme.liquid' } } },  // PUT theme.liquid
      { status: 404, body: {} },  // GET snippet (not found)
      { status: 200, body: { asset: { key: 'snippets/velocity-schema.liquid' } } },  // PUT snippet
    ], calls));

    const result = await installSnippet('example.myshopify.com', 'tok', '42');

    assert.equal(result.ok, true, result.error);
    assert.equal(result.alreadyInstalled, false);
    assert.equal(result.snippetUpdated, true);
    assert.equal(calls.length, 4);
    assert.equal(calls[0]!.method, 'GET');
    assert.equal(calls[1]!.method, 'PUT');
    assert.equal(calls[2]!.method, 'GET');
    assert.equal(calls[3]!.method, 'PUT');
  });

  it('theme.liquid PUT body contains updated content with render tag', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: MINIMAL_THEME } } },
      { status: 200, body: { asset: {} } },
      { status: 404, body: {} },
      { status: 200, body: { asset: {} } },
    ], calls));

    await installSnippet('example.myshopify.com', 'tok', '42');

    const putBody = JSON.parse(calls[1]!.body ?? '{}') as { asset: { key: string; value: string } };
    assert.ok(putBody.asset.value.includes('{% render "velocity-schema" %}'));
    assert.equal(putBody.asset.key, 'layout/theme.liquid');
  });

  it('snippet PUT body has correct asset key', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: MINIMAL_THEME } } },
      { status: 200, body: { asset: {} } },
      { status: 404, body: {} },
      { status: 200, body: { asset: {} } },
    ], calls));

    await installSnippet('example.myshopify.com', 'tok', '42');

    const putBody = JSON.parse(calls[3]!.body ?? '{}') as { asset: { key: string; value: string } };
    assert.equal(putBody.asset.key, 'snippets/velocity-schema.liquid');
    assert.ok(putBody.asset.value.length > 0, 'Snippet content must be non-empty');
  });

  it('injects render tag after <head>', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: '<html><head><title>Test</title></head></html>' } } },
      { status: 200, body: { asset: {} } },
      { status: 404, body: {} },
      { status: 200, body: { asset: {} } },
    ], calls));

    await installSnippet('example.myshopify.com', 'tok', '1');

    const putBody = JSON.parse(calls[1]!.body ?? '{}') as { asset: { value: string } };
    const headIdx = putBody.asset.value.indexOf('<head>');
    const renderIdx = putBody.asset.value.indexOf('{% render "velocity-schema" %}');
    assert.ok(renderIdx > headIdx, 'render tag should come after <head>');
  });

  it('injects render tag after <head> with attributes', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: '<html><head data-view="collection"><title>Test</title></head></html>' } } },
      { status: 200, body: { asset: {} } },
      { status: 404, body: {} },
      { status: 200, body: { asset: {} } },
    ], calls));

    await installSnippet('example.myshopify.com', 'tok', '1');

    const putBody = JSON.parse(calls[1]!.body ?? '{}') as { asset: { value: string } };
    const headIdx = putBody.asset.value.indexOf('<head data-view="collection">');
    const renderIdx = putBody.asset.value.indexOf('{% render "velocity-schema" %}');
    assert.ok(renderIdx > headIdx, 'render tag should come after <head data-view="collection">');
    assert.ok(renderIdx < putBody.asset.value.indexOf('</head>'), 'render tag should be inside <head>');
  });

  it('injects render tag after uppercase <HEAD>', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: '<html><HEAD><title>Test</title></HEAD></html>' } } },
      { status: 200, body: { asset: {} } },
      { status: 404, body: {} },
      { status: 200, body: { asset: {} } },
    ], calls));

    await installSnippet('example.myshopify.com', 'tok', '1');

    const putBody = JSON.parse(calls[1]!.body ?? '{}') as { asset: { value: string } };
    const headIdx = putBody.asset.value.indexOf('<HEAD>');
    const renderIdx = putBody.asset.value.indexOf('{% render "velocity-schema" %}');
    assert.ok(headIdx >= 0, '<HEAD> must be in output');
    assert.ok(renderIdx > headIdx, 'render tag should come after <HEAD>');
  });

  it('injects render tag after <head class="no-js">', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: '<html><head class="no-js"><title>Test</title></head></html>' } } },
      { status: 200, body: { asset: {} } },
      { status: 404, body: {} },
      { status: 200, body: { asset: {} } },
    ], calls));

    await installSnippet('example.myshopify.com', 'tok', '1');

    const putBody = JSON.parse(calls[1]!.body ?? '{}') as { asset: { value: string } };
    const headIdx = putBody.asset.value.indexOf('<head class="no-js">');
    const renderIdx = putBody.asset.value.indexOf('{% render "velocity-schema" %}');
    assert.ok(headIdx >= 0, '<head class="no-js"> must be in output');
    assert.ok(renderIdx > headIdx, 'render tag should come after <head class="no-js">');
    assert.ok(renderIdx < putBody.asset.value.indexOf('</head>'), 'render tag should be inside <head>');
  });
});

// ── installSnippet — errors ───────────────────────────────────────────────────

describe('installSnippet — errors', () => {
  afterEach(() => _resetInjections());

  it('returns error when GET theme.liquid fails', async () => {
    _injectFetch(async () => mockResponse(404, {}));
    const result = await installSnippet('example.myshopify.com', 'tok', '1');
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('404'));
  });

  it('returns error when PUT theme.liquid fails', async () => {
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: MINIMAL_THEME } } },
      { status: 500, body: {} },
    ], [] as FetchCall[]));
    const result = await installSnippet('example.myshopify.com', 'tok', '1');
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('500'));
  });

  it('returns error when PUT snippet fails', async () => {
    _injectFetch(recordingFetch([
      { status: 200, body: { asset: { value: MINIMAL_THEME } } },  // GET theme.liquid
      { status: 200, body: { asset: {} } },  // PUT theme.liquid
      { status: 404, body: {} },  // GET snippet (not found)
      { status: 422, body: {} },  // PUT snippet fails
    ], [] as FetchCall[]));
    const result = await installSnippet('example.myshopify.com', 'tok', '1');
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('422'));
  });

  it('returns error when fetch throws', async () => {
    _injectFetch(async () => { throw new Error('Timeout'); });
    const result = await installSnippet('example.myshopify.com', 'tok', '1');
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Timeout'));
  });

  it('never throws', async () => {
    _injectFetch(async () => { throw new Error('boom'); });
    await assert.doesNotReject(() => installSnippet('example.myshopify.com', 'tok', '1'));
  });
});
