/**
 * packages/commands/src/preview-verify.test.ts
 *
 * Tests for runPreviewVerify.
 * All external deps (Supabase, Shopify API, file I/O) are injected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runPreviewVerify,
  _inferTemplatePath,
  type PreviewVerifyRequest,
  type PreviewVerifyOps,
  type PreviewItem,
  type PreviewVerifyIssue,
} from './preview-verify.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const RUN_ID    = 'run-uuid-001';
const TENANT_ID = 'tenant-uuid-001';
const SITE_ID   = 'site-uuid-001';

function baseReq(overrides: Partial<PreviewVerifyRequest> = {}): PreviewVerifyRequest {
  return { run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID, ...overrides };
}

let itemCounter = 0;
function makeItem(overrides: Partial<PreviewItem> = {}): PreviewItem {
  itemCounter++;
  return {
    id:               `item-uuid-${itemCounter.toString().padStart(3, '0')}`,
    run_id:           RUN_ID,
    tenant_id:        TENANT_ID,
    site_id:          SITE_ID,
    issue_type:       'META_TITLE_MISSING',
    url:              `https://example.com/products/widget-${itemCounter}`,
    risk_score:       2,
    category:         'content',
    proposed_fix:     {},
    execution_status: 'queued',
    ...overrides,
  };
}

/** Template that produces all valid SEO fields when rendered. */
const VALID_TEMPLATE = `<html>
<head>
  <title>{{ product.title }} — Premium Store Name</title>
  <meta name="description" content="{{ product.description }}">
  <link rel="canonical" href="{{ product.url }}">
  <script type="application/ld+json">{"@type":"Product","name":"{{ product.title }}"}</script>
</head>
<body>
  <h1>{{ product.title }}</h1>
</body>
</html>`;

const VALID_CONTEXT = {
  product: {
    title: 'Premium Pool Float Deluxe Edition',
    description: 'Shop our premium pool float collection featuring luxury designs, durable materials, and vibrant colors. Free shipping on orders over $50.',
    url: 'https://example.com/products/pool-float-deluxe',
  },
};

/** Template missing all SEO fields. */
const BAD_TEMPLATE = '<html><body><p>No SEO here</p></body></html>';

/** Happy path ops: 1 item, valid template, valid context. */
function happy(overrides: Partial<PreviewVerifyOps> = {}): Partial<PreviewVerifyOps> {
  return {
    loadItems:        async () => [makeItem()],
    readPatchedFile:  async () => VALID_TEMPLATE,
    buildContext:     async () => VALID_CONTEXT,
    shopifyApiVerify: async () => ({ passed: true, issues: [] }),
    markVerified:     async () => {},
    markIssuesFound:  async () => {},
    ...overrides,
  };
}

// ── Request validation ───────────────────────────────────────────────────────

describe('runPreviewVerify — request validation', () => {
  it('returns failed for empty run_id', async () => {
    const result = await runPreviewVerify(baseReq({ run_id: '' }), happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('run_id'));
  });

  it('returns failed for empty tenant_id', async () => {
    const result = await runPreviewVerify(baseReq({ tenant_id: '' }), happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('tenant_id'));
  });

  it('returns failed for empty site_id', async () => {
    const result = await runPreviewVerify(baseReq({ site_id: '' }), happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('site_id'));
  });
});

// ── No items ─────────────────────────────────────────────────────────────────

describe('runPreviewVerify — no items', () => {
  it('returns passed with zero counts', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      loadItems: async () => [],
    }));
    assert.equal(result.status, 'passed');
    assert.equal(result.items_checked, 0);
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.fallbacks, 0);
    assert.deepStrictEqual(result.issues, []);
  });
});

// ── Local Liquid render: all pass ────────────────────────────────────────────

describe('runPreviewVerify — local Liquid render passes', () => {
  it('returns passed when template renders valid SEO fields', async () => {
    const result = await runPreviewVerify(baseReq(), happy());
    assert.equal(result.status, 'passed');
    assert.equal(result.items_checked, 1);
    assert.equal(result.passed, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.fallbacks, 0);
    assert.equal(result.issues.length, 0);
  });

  it('markVerified is called for passing items', async () => {
    const verifiedIds: string[] = [];
    const item = makeItem();
    await runPreviewVerify(baseReq(), happy({
      loadItems:    async () => [item],
      markVerified: async (id) => { verifiedIds.push(id); },
    }));
    assert.equal(verifiedIds.length, 1);
    assert.equal(verifiedIds[0], item.id);
  });

  it('shopifyApiVerify is NOT called when local render succeeds', async () => {
    let apiCalled = false;
    await runPreviewVerify(baseReq(), happy({
      shopifyApiVerify: async () => { apiCalled = true; return { passed: true, issues: [] }; },
    }));
    assert.equal(apiCalled, false);
  });

  it('3 items all pass → status=passed, passed=3', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      loadItems: async () => [makeItem(), makeItem(), makeItem()],
    }));
    assert.equal(result.status, 'passed');
    assert.equal(result.passed, 3);
    assert.equal(result.failed, 0);
  });
});

// ── Local Liquid render: validation fails ────────────────────────────────────

describe('runPreviewVerify — local render finds SEO issues', () => {
  it('returns failed when template has no SEO fields', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      readPatchedFile: async () => BAD_TEMPLATE,
    }));
    assert.equal(result.status, 'failed');
    assert.equal(result.failed, 1);
    assert.ok(result.issues.length > 0);
  });

  it('issues include title_missing, meta_missing, h1_missing', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      readPatchedFile: async () => BAD_TEMPLATE,
    }));
    const rules = result.issues.map((i) => i.rule);
    assert.ok(rules.includes('title_missing'));
    assert.ok(rules.includes('meta_missing'));
    assert.ok(rules.includes('h1_missing'));
  });

  it('issues have source=liquid', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      readPatchedFile: async () => BAD_TEMPLATE,
    }));
    for (const issue of result.issues) {
      assert.equal(issue.source, 'liquid');
    }
  });

  it('markIssuesFound is called for failing items', async () => {
    const markedIds: string[] = [];
    const item = makeItem();
    await runPreviewVerify(baseReq(), happy({
      loadItems:       async () => [item],
      readPatchedFile: async () => BAD_TEMPLATE,
      markIssuesFound: async (id) => { markedIds.push(id); },
    }));
    assert.equal(markedIds.length, 1);
    assert.equal(markedIds[0], item.id);
  });

  it('mixed results: 1 pass + 1 fail → status=partial', async () => {
    let callCount = 0;
    const result = await runPreviewVerify(baseReq(), happy({
      loadItems: async () => [makeItem(), makeItem()],
      readPatchedFile: async () => {
        callCount++;
        return callCount === 1 ? VALID_TEMPLATE : BAD_TEMPLATE;
      },
    }));
    assert.equal(result.status, 'partial');
    assert.equal(result.passed, 1);
    assert.equal(result.failed, 1);
  });

  it('issues include item_id and url', async () => {
    const item = makeItem({ url: 'https://example.com/products/special' });
    const result = await runPreviewVerify(baseReq(), happy({
      loadItems:       async () => [item],
      readPatchedFile: async () => BAD_TEMPLATE,
    }));
    assert.ok(result.issues.length > 0);
    assert.equal(result.issues[0].item_id, item.id);
    assert.equal(result.issues[0].url, 'https://example.com/products/special');
  });
});

// ── Fallback to Shopify API ──────────────────────────────────────────────────

describe('runPreviewVerify — Shopify API fallback', () => {
  it('falls back when readPatchedFile returns null', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      readPatchedFile:  async () => null,
      shopifyApiVerify: async () => ({ passed: true, issues: [] }),
    }));
    assert.equal(result.status, 'passed');
    assert.equal(result.fallbacks, 1);
    assert.equal(result.passed, 1);
  });

  it('falls back when renderTemplate throws', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      readPatchedFile:  async () => '{% invalid_tag %}',
      shopifyApiVerify: async () => ({ passed: true, issues: [] }),
    }));
    assert.equal(result.fallbacks, 1);
    assert.equal(result.passed, 1);
  });

  it('fallback API issues have source=shopify_api', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      readPatchedFile:  async () => null,
      shopifyApiVerify: async () => ({
        passed: false,
        issues: [{ field: 'title', rule: 'title_missing', severity: 'critical', message: 'No title' }],
      }),
    }));
    assert.equal(result.fallbacks, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.issues[0].source, 'shopify_api');
  });

  it('both liquid and API fail → render_failed issue', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      readPatchedFile:  async () => null,
      shopifyApiVerify: async () => { throw new Error('API timeout'); },
    }));
    assert.equal(result.failed, 1);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].rule, 'render_failed');
    assert.ok(result.issues[0].message.includes('API timeout'));
  });

  it('fallback count is accurate across multiple items', async () => {
    let callCount = 0;
    const result = await runPreviewVerify(baseReq(), happy({
      loadItems: async () => [makeItem(), makeItem(), makeItem()],
      readPatchedFile: async () => {
        callCount++;
        if (callCount === 2) return null; // only 2nd item falls back
        return VALID_TEMPLATE;
      },
      shopifyApiVerify: async () => ({ passed: true, issues: [] }),
    }));
    assert.equal(result.fallbacks, 1);
    assert.equal(result.passed, 3);
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('runPreviewVerify — never throws', () => {
  it('does not throw when loadItems throws', async () => {
    await assert.doesNotReject(() =>
      runPreviewVerify(baseReq(), happy({
        loadItems: async () => { throw new Error('DB down'); },
      })),
    );
  });

  it('returns status=failed when loadItems throws', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      loadItems: async () => { throw new Error('connection refused'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('connection refused'));
  });

  it('markVerified failure is non-blocking', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      markVerified: async () => { throw new Error('db write failed'); },
    }));
    assert.equal(result.status, 'passed');
    assert.equal(result.passed, 1);
  });

  it('markIssuesFound failure is non-blocking', async () => {
    const result = await runPreviewVerify(baseReq(), happy({
      readPatchedFile: async () => BAD_TEMPLATE,
      markIssuesFound: async () => { throw new Error('db timeout'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.issues.length > 0);
  });
});

// ── Template path inference ──────────────────────────────────────────────────

describe('inferTemplatePath', () => {
  it('infers product template for /products/ URLs', () => {
    const item = makeItem({ url: 'https://example.com/products/widget' });
    assert.equal(_inferTemplatePath(item), 'templates/product.liquid');
  });

  it('infers collection template for /collections/ URLs', () => {
    const item = makeItem({ url: 'https://example.com/collections/summer' });
    assert.equal(_inferTemplatePath(item), 'templates/collection.liquid');
  });

  it('infers page template for /pages/ URLs', () => {
    const item = makeItem({ url: 'https://example.com/pages/about' });
    assert.equal(_inferTemplatePath(item), 'templates/page.liquid');
  });

  it('infers article template for /blogs/ URLs', () => {
    const item = makeItem({ url: 'https://example.com/blogs/news/post' });
    assert.equal(_inferTemplatePath(item), 'templates/article.liquid');
  });

  it('infers index template for homepage', () => {
    const item = makeItem({ url: 'https://example.com/' });
    assert.equal(_inferTemplatePath(item), 'templates/index.liquid');
  });

  it('defaults to page template for unknown paths', () => {
    const item = makeItem({ url: 'https://example.com/custom-path' });
    assert.equal(_inferTemplatePath(item), 'templates/page.liquid');
  });

  it('uses explicit template_path when set', async () => {
    const readCalls: string[] = [];
    const item = makeItem({ template_path: 'sections/custom-header.liquid' });
    await runPreviewVerify(baseReq(), happy({
      loadItems:       async () => [item],
      readPatchedFile: async (_siteId, path) => { readCalls.push(path); return VALID_TEMPLATE; },
    }));
    assert.equal(readCalls[0], 'sections/custom-header.liquid');
  });
});

// ── Result shape ─────────────────────────────────────────────────────────────

describe('runPreviewVerify — result shape', () => {
  it('result has all required fields', async () => {
    const result = await runPreviewVerify(baseReq(), happy());
    assert.equal(typeof result.run_id, 'string');
    assert.equal(typeof result.site_id, 'string');
    assert.equal(typeof result.tenant_id, 'string');
    assert.equal(typeof result.items_checked, 'number');
    assert.equal(typeof result.passed, 'number');
    assert.equal(typeof result.failed, 'number');
    assert.equal(typeof result.fallbacks, 'number');
    assert.ok(Array.isArray(result.issues));
    assert.equal(typeof result.completed_at, 'string');
    assert.ok(!isNaN(Date.parse(result.completed_at)));
  });

  it('passed + failed === items_checked', async () => {
    let callCount = 0;
    const result = await runPreviewVerify(baseReq(), happy({
      loadItems: async () => [makeItem(), makeItem(), makeItem(), makeItem()],
      readPatchedFile: async () => {
        callCount++;
        return callCount % 2 === 0 ? BAD_TEMPLATE : VALID_TEMPLATE;
      },
    }));
    assert.equal(result.passed + result.failed, result.items_checked);
  });
});

// ── ActionLog entries ────────────────────────────────────────────────────────

/** Capture JSON log lines written to stdout. */
async function captureLog(fn: () => Promise<void>): Promise<Record<string, unknown>[]> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // @ts-expect-error — test-only stdout capture
  process.stdout.write = (chunk: unknown): boolean => { chunks.push(String(chunk)); return true; };
  try { await fn(); } finally { process.stdout.write = orig; }
  return chunks
    .join('')
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => JSON.parse(l.trim()) as Record<string, unknown>);
}

describe('runPreviewVerify — ActionLog entries', () => {
  it('writes preview-verify:start and preview-verify:complete', async () => {
    const entries = await captureLog(() => runPreviewVerify(baseReq(), happy()));
    const start    = entries.find((e) => e['stage'] === 'preview-verify:start');
    const complete = entries.find((e) => e['stage'] === 'preview-verify:complete');
    assert.ok(start, 'preview-verify:start not found');
    assert.ok(complete, 'preview-verify:complete not found');
  });

  it('writes preview-verify:liquid_fallback when falling back', async () => {
    const entries = await captureLog(() =>
      runPreviewVerify(baseReq(), happy({
        readPatchedFile:  async () => null,
        shopifyApiVerify: async () => ({ passed: true, issues: [] }),
      })),
    );
    const fallback = entries.find((e) => e['stage'] === 'preview-verify:liquid_fallback');
    assert.ok(fallback, 'preview-verify:liquid_fallback not found');
  });

  it('writes preview-verify:failed when loadItems throws', async () => {
    const entries = await captureLog(() =>
      runPreviewVerify(baseReq(), happy({
        loadItems: async () => { throw new Error('db error'); },
      })),
    );
    const failed   = entries.find((e) => e['stage'] === 'preview-verify:failed');
    const complete = entries.find((e) => e['stage'] === 'preview-verify:complete');
    assert.ok(failed, 'preview-verify:failed not found');
    assert.equal(complete, undefined);
  });
});
