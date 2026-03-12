/**
 * tools/apply/aeo_apply.test.ts
 *
 * Tests for AEO fix applicator and apply engine AEO wiring.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAEOFix, type AEOApplyDeps } from './aeo_apply.js';
import { applyFix, type ApprovedItem, type ApplyDeps } from './apply_engine.js';
import type { ShopifyFixRequest, ShopifyFixResult } from '../../packages/adapters/shopify/src/index.js';

const CREDS = { access_token: 'shpat_test', store_url: 'https://example.myshopify.com' };

function makeItem(overrides: Partial<ApprovedItem> = {}): ApprovedItem {
  return {
    id:               'aeo-001',
    run_id:           'run-001',
    tenant_id:        'tenant-001',
    site_id:          'site-001',
    issue_type:       'SPEAKABLE_MISSING',
    url:              'https://example.com/pages/about',
    risk_score:       3,
    priority:         2,
    proposed_fix:     { page_title: 'About Us', page_type: 'page' },
    execution_status: 'approved',
    ...overrides,
  };
}

function makeMockDeps(overrides: Partial<AEOApplyDeps> = {}): AEOApplyDeps {
  return {
    generateSpeakable: async () => ({
      schema: { '@type': 'SpeakableSpecification', cssSelector: ['.main'] },
      liquid_snippet: '{% comment %}VAEO{% endcomment %}<script type="application/ld+json">...</script>',
      confidence: 0.9,
    }),
    buildFAQSchema: async () => ({
      schema: { '@type': 'FAQPage', mainEntity: [] },
      liquid_snippet: '{% comment %}VAEO{% endcomment %}<script type="application/ld+json">...</script>',
      confidence: 0.8,
      faq_items: [{ question: 'Q?', answer: 'A.' }],
    }),
    injectAnswerSchema: async () => ({
      html: '<html>updated</html>',
      schema_injected: { '@type': 'HowTo' },
      liquid_snippet: '{% comment %}VAEO{% endcomment %}<script>...</script>',
    }),
    fetchHTML: async () => '<html><body>Page content</body></html>',
    writeSnippet: async () => ({ success: true }),
    ...overrides,
  };
}

// ── applyAEOFix — SPEAKABLE_MISSING ─────────────────────────────────────────

describe('applyAEOFix — SPEAKABLE_MISSING', () => {
  it('generates speakable schema and writes snippet', async () => {
    const item = makeItem({ issue_type: 'SPEAKABLE_MISSING' });
    const result = await applyAEOFix(item, CREDS, makeMockDeps());
    assert.equal(result.success, true);
    assert.equal(result.action, 'speakable');
    assert.equal(result.schema_type, 'SpeakableSpecification');
  });

  it('fails when writeSnippet fails', async () => {
    const item = makeItem({ issue_type: 'SPEAKABLE_MISSING' });
    const result = await applyAEOFix(item, CREDS, makeMockDeps({
      writeSnippet: async () => ({ success: false, error: 'Theme write failed' }),
    }));
    assert.equal(result.success, false);
    assert.match(result.error!, /Theme write failed/);
  });
});

// ── applyAEOFix — AEO_SCHEMA_INCOMPLETE ─────────────────────────────────────

describe('applyAEOFix — AEO_SCHEMA_INCOMPLETE', () => {
  it('regenerates speakable with selectors', async () => {
    const item = makeItem({ issue_type: 'AEO_SCHEMA_INCOMPLETE' });
    const result = await applyAEOFix(item, CREDS, makeMockDeps());
    assert.equal(result.success, true);
    assert.equal(result.action, 'speakable');
  });
});

// ── applyAEOFix — FAQ_OPPORTUNITY ───────────────────────────────────────────

describe('applyAEOFix — FAQ_OPPORTUNITY', () => {
  it('builds FAQ schema and writes snippet', async () => {
    const item = makeItem({ issue_type: 'FAQ_OPPORTUNITY' });
    const result = await applyAEOFix(item, CREDS, makeMockDeps());
    assert.equal(result.success, true);
    assert.equal(result.action, 'faq');
    assert.equal(result.schema_type, 'FAQPage');
  });

  it('handles fetchHTML failure gracefully', async () => {
    const item = makeItem({ issue_type: 'FAQ_OPPORTUNITY' });
    const result = await applyAEOFix(item, CREDS, makeMockDeps({
      fetchHTML: async () => { throw new Error('Network error'); },
    }));
    assert.equal(result.success, true);
  });
});

// ── applyAEOFix — ANSWER_BLOCK_OPPORTUNITY ───────────────────────────────────

describe('applyAEOFix — ANSWER_BLOCK_OPPORTUNITY', () => {
  it('injects answer schema and writes snippet', async () => {
    const item = makeItem({
      issue_type: 'ANSWER_BLOCK_OPPORTUNITY',
      proposed_fix: {
        page_title: 'Guide',
        page_type: 'article',
        opportunity_type: 'how_to',
        recommended_schema: 'HowTo',
        steps: ['Step 1', 'Step 2'],
      },
    });
    const result = await applyAEOFix(item, CREDS, makeMockDeps());
    assert.equal(result.success, true);
    assert.equal(result.action, 'answer_block');
    assert.equal(result.schema_type, 'HowTo');
  });
});

// ── applyAEOFix — unknown type ──────────────────────────────────────────────

describe('applyAEOFix — unknown type', () => {
  it('returns error for unknown AEO issue type', async () => {
    const item = makeItem({ issue_type: 'UNKNOWN_AEO_TYPE' });
    const result = await applyAEOFix(item, CREDS, makeMockDeps());
    assert.equal(result.success, false);
    assert.match(result.error!, /Unknown AEO issue type/);
  });
});

// ── applyAEOFix — never throws ──────────────────────────────────────────────

describe('applyAEOFix — never throws', () => {
  it('catches errors from generators', async () => {
    const item = makeItem({ issue_type: 'SPEAKABLE_MISSING' });
    const result = await applyAEOFix(item, CREDS, makeMockDeps({
      generateSpeakable: async () => { throw new Error('Generator exploded'); },
    }));
    assert.equal(result.success, false);
    assert.match(result.error!, /Generator exploded/);
  });
});

// ── Apply engine AEO wiring ─────────────────────────────────────────────────

function makeEngineDeps(overrides: Partial<ApplyDeps> = {}): ApplyDeps {
  const logs: Array<Record<string, unknown>> = [];
  const marks: Array<{ type: string; id: string; error?: string }> = [];

  return {
    loadItem: async () => null,
    loadCredentials: async () => CREDS,
    shopifyApplyFix: async (req: ShopifyFixRequest): Promise<ShopifyFixResult> => ({
      action_id: req.action_id, success: true, fix_type: req.fix_type, sandbox: false,
    }),
    markDeployed: async (id) => { marks.push({ type: 'deployed', id }); },
    markFailed:   async (id, error) => { marks.push({ type: 'failed', id, error }); },
    writeLog:     (entry) => { logs.push(entry); },
    schemaApply:  undefined,
    ...overrides,
    _logs:  logs,
    _marks: marks,
  } as ApplyDeps & { _logs: unknown[]; _marks: unknown[] };
}

describe('apply engine — AEO wiring via aeoApply dep', () => {
  it('routes SPEAKABLE_MISSING to aeoApply dep', async () => {
    let aeoCalled = false;
    let shopifyCalled = false;
    const deps = makeEngineDeps({
      shopifyApplyFix: async (req) => { shopifyCalled = true; return { action_id: req.action_id, success: true, fix_type: req.fix_type, sandbox: false }; },
      aeoApply: async () => { aeoCalled = true; return { success: true, action: 'speakable', schema_type: 'SpeakableSpecification' }; },
    });
    const item = makeItem({ issue_type: 'SPEAKABLE_MISSING' });
    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
    assert.equal(aeoCalled, true);
    assert.equal(shopifyCalled, false);
  });

  it('routes FAQ_OPPORTUNITY to aeoApply dep', async () => {
    let aeoCalled = false;
    const deps = makeEngineDeps({
      aeoApply: async () => { aeoCalled = true; return { success: true, action: 'faq' }; },
    });
    const item = makeItem({ issue_type: 'FAQ_OPPORTUNITY' });
    const result = await applyFix(item, deps);

    assert.equal(result.success, true);
    assert.equal(aeoCalled, true);
  });

  it('aeoApply failure marks item as failed', async () => {
    const deps = makeEngineDeps({
      aeoApply: async () => ({ success: false, error: 'Snippet write failed' }),
    });
    const item = makeItem({ issue_type: 'SPEAKABLE_MISSING' });
    const result = await applyFix(item, deps);

    assert.equal(result.success, false);
    assert.match(result.error!, /Snippet write failed/);
    const marks = (deps as unknown as { _marks: Array<{ type: string }> })._marks;
    assert.equal(marks[0].type, 'failed');
  });
});
