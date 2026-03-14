/**
 * tools/schema/schema_writer.test.ts
 *
 * Tests for writeSchema using injectable fetch.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeSchema, _injectFetch, _resetInjections, type SchemaWriteInput } from './schema_writer.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

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

function validProductSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type':    'Product',
    name:       'Widget',
    offers:     { '@type': 'Offer', price: '10.00', priceCurrency: 'USD' },
  };
}

function makeInput(overrides: Partial<SchemaWriteInput> = {}): SchemaWriteInput {
  return {
    shopDomain:   'example.myshopify.com',
    accessToken:  'shpat_test',
    resourceType: 'product',
    resourceId:   '12345',
    schemaJson:   validProductSchema(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('writeSchema — POST (create new metafield)', () => {
  afterEach(() => _resetInjections());

  it('GETs existing, finds none, POSTs new metafield', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { metafields: [] } },                               // GET — no existing
      { status: 201, body: { metafield: { id: 999, value: '{}' } } },          // POST create
    ], calls));

    const result = await writeSchema(makeInput());

    assert.equal(result.ok, true, result.error);
    assert.equal(result.metafieldId, '999');
    assert.equal(calls.length, 2);
    assert.ok(calls[0]!.url.includes('/metafields.json'));
    assert.equal(calls[0]!.method, 'GET');
    assert.equal(calls[1]!.method, 'POST');
    assert.ok(calls[1]!.url.includes('/metafields.json'));
  });

  it('POST body includes velocity_seo namespace and json type', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { metafields: [] } },
      { status: 201, body: { metafield: { id: 1, value: '{}' } } },
    ], calls));

    await writeSchema(makeInput());

    const postBody = JSON.parse(calls[1]!.body ?? '{}') as {
      metafield: { namespace: string; key: string; type: string };
    };
    assert.equal(postBody.metafield.namespace, 'velocity_seo');
    assert.equal(postBody.metafield.key, 'schema_json');
    assert.equal(postBody.metafield.type, 'json');
  });

  it('uses custom_collection as owner_resource for collections', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { metafields: [] } },
      { status: 201, body: { metafield: { id: 2, value: '{}' } } },
    ], calls));

    const collectionSchema: Record<string, unknown> = {
      '@context':      'https://schema.org',
      '@type':         'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Shoes' }],
    };

    await writeSchema(makeInput({ resourceType: 'collection', schemaJson: collectionSchema }));

    assert.ok(calls[0]!.url.includes('owner_resource=custom_collection'));
  });
});

describe('writeSchema — PUT (update existing metafield)', () => {
  afterEach(() => _resetInjections());

  it('GETs existing, finds one, PUTs update', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { metafields: [{ id: 77, value: '{"old":true}' }] } }, // GET — existing
      { status: 200, body: { metafield: { id: 77, value: '{}' } } },              // PUT update
    ], calls));

    const result = await writeSchema(makeInput());

    assert.equal(result.ok, true, result.error);
    assert.equal(result.metafieldId, '77');
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.method, 'PUT');
    assert.ok(calls[1]!.url.includes('/metafields/77.json'));
  });

  it('PUT body contains only value', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { metafields: [{ id: 88, value: '{}' }] } },
      { status: 200, body: { metafield: { id: 88, value: '{}' } } },
    ], calls));

    await writeSchema(makeInput());

    const putBody = JSON.parse(calls[1]!.body ?? '{}') as { metafield: { value: string } };
    assert.ok('value' in putBody.metafield);
    // No namespace/key/type in PUT body
    assert.ok(!('namespace' in putBody.metafield));
  });
});

describe('writeSchema — validation failure', () => {
  afterEach(() => _resetInjections());

  it('returns error without any API call when schema invalid', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([], calls));

    const result = await writeSchema(makeInput({ schemaJson: { '@context': 'wrong', '@type': 'Product' } }));

    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('validation failed') || result.error?.includes('@context'));
    assert.equal(calls.length, 0, 'No API calls should be made for invalid schema');
  });

  it('returns error for empty schema', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([], calls));

    const result = await writeSchema(makeInput({ schemaJson: {} }));

    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });
});

describe('writeSchema — API errors', () => {
  afterEach(() => _resetInjections());

  it('returns error when GET returns 4xx', async () => {
    _injectFetch(async () => mockResponse(401, { error: 'Unauthorized' }));

    const result = await writeSchema(makeInput());

    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('401'));
  });

  it('returns error when POST returns 4xx', async () => {
    const calls: FetchCall[] = [];
    _injectFetch(recordingFetch([
      { status: 200, body: { metafields: [] } },
      { status: 422, body: { error: 'Invalid value' } },
    ], calls));

    const result = await writeSchema(makeInput());

    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('422'));
  });

  it('returns error when PUT returns 4xx', async () => {
    _injectFetch(recordingFetch([
      { status: 200, body: { metafields: [{ id: 1, value: '{}' }] } },
      { status: 500, body: { error: 'Server error' } },
    ], [] as FetchCall[]));

    const result = await writeSchema(makeInput());

    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('500'));
  });

  it('returns error when fetch throws', async () => {
    _injectFetch(async () => { throw new Error('Network failure'); });

    const result = await writeSchema(makeInput());

    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('Network failure'));
  });
});

describe('writeSchema — never throws', () => {
  afterEach(() => _resetInjections());

  it('does not throw on complete failure', async () => {
    _injectFetch(async () => { throw new Error('boom'); });
    await assert.doesNotReject(() => writeSchema(makeInput()));
  });
});
