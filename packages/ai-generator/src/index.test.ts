/**
 * packages/ai-generator/src/index.test.ts
 *
 * Unit tests for the VAEO AI content generator.
 * All Anthropic API and Redis calls are mocked — no real network calls made.
 *
 * Tests confirm:
 *   1.  Generated title is always trimmed to 60 chars max (word boundary)
 *   2.  Generated meta desc is always trimmed to 155 chars max (sentence boundary)
 *   3.  confidence < 0.7 sets approval_required = true
 *   4.  confidence < 0.5 sets fix_source = 'manual'
 *   5.  API failure returns fallback result without throwing
 *   6.  Cache hit skips API call and returns cached result
 *   7.  All 5 issue_types have a prompt template defined
 *   8.  Cache miss proceeds to API call
 *   9.  confidence >= 0.7 → fix_source='ai_suggested', approval_required=false
 *  10.  trimAtWordBoundary and trimAtSentenceBoundary edge cases
 *  11.  renderTemplate fills all placeholders
 *  12.  ActionLog stages written correctly
 *  13.  Invalid JSON from API returns fallback
 *  14.  cacheKey format is tenant_id:url:issue_type
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generate,
  enforceCharLimit,
  trimAtWordBoundary,
  trimAtSentenceBoundary,
  applyConfidenceRouting,
  renderTemplate,
  cacheKey,
  PROMPT_TEMPLATES_V1,
  type GenerateRequest,
  type GenerateResult,
  type ApiResponse,
} from './index.js';

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
    return (result as Promise<void>).finally(() => {
      process.stdout.write = orig;
    }).then(() => captured);
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

/** Minimal valid GenerateRequest. */
function req(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    run_id:          'run-ai-001',
    tenant_id:       't-aaa',
    site_id:         's-bbb',
    cms:             'shopify',
    url:             'https://cococabanalife.com/products/sun-glow-bikini',
    issue_type:      'META_TITLE_MISSING',
    page_content:    'Sun Glow Bikini — our best-selling two-piece swimsuit.',
    gsc_keywords:    ['sun glow bikini', 'swimsuit', 'two piece'],
    brand_name:      'Coco Cabana',
    character_limit: 60,
    ...overrides,
  };
}

/** Builds a no-op ops object that makes the generate() call controllable. */
function mockOps(overrides: {
  apiResp?:    ApiResponse | Error;
  cached?:     GenerateResult | null;
  cacheSetFn?: (key: string, val: GenerateResult) => void;
} = {}) {
  let cacheSetCalled = false;
  let apiCallCount   = 0;

  const cacheGet = async (): Promise<GenerateResult | null> =>
    overrides.cached !== undefined ? overrides.cached : null;

  const callApi = async (): Promise<ApiResponse> => {
    apiCallCount++;
    if (overrides.apiResp instanceof Error) throw overrides.apiResp;
    if (overrides.apiResp) return overrides.apiResp;
    throw new Error('no apiResp configured');
  };

  const cacheSet = async (key: string, val: GenerateResult): Promise<void> => {
    cacheSetCalled = true;
    overrides.cacheSetFn?.(key, val);
  };

  return { ops: { callApi, cacheGet, cacheSet }, getCacheSetCalled: () => cacheSetCalled, getApiCallCount: () => apiCallCount };
}

// ── trimAtWordBoundary ────────────────────────────────────────────────────────

describe('trimAtWordBoundary', () => {
  it('returns text unchanged when within limit', () => {
    assert.equal(trimAtWordBoundary('short text', 60), 'short text');
  });

  it('trims at the last space before the limit', () => {
    const text = 'Sun Glow Bikini Two-Piece Swimsuit - Coco Cabana Summer Collection';
    const result = trimAtWordBoundary(text, 60);
    assert.ok(result.length <= 60, `length ${result.length} > 60`);
    assert.ok(!result.endsWith(' '), 'should not end with space');
  });

  it('hard-cuts when no space found in range', () => {
    const longWord = 'a'.repeat(80);
    const result = trimAtWordBoundary(longWord, 60);
    assert.equal(result.length, 60);
  });

  it('handles text exactly at limit', () => {
    const text = 'a'.repeat(60);
    assert.equal(trimAtWordBoundary(text, 60), text);
  });
});

// ── trimAtSentenceBoundary ────────────────────────────────────────────────────

describe('trimAtSentenceBoundary', () => {
  it('returns text unchanged when within limit', () => {
    const text = 'Short description.';
    assert.equal(trimAtSentenceBoundary(text, 155), text);
  });

  it('trims at sentence boundary when over limit', () => {
    const text = 'Shop the Sun Glow Bikini collection. Free shipping on orders over fifty dollars. Handcrafted with premium materials for the discerning beachgoer.';
    const result = trimAtSentenceBoundary(text, 100);
    assert.ok(result.length <= 100, `length ${result.length} > 100`);
    assert.ok(result.endsWith('.') || result.endsWith('!') || result.endsWith('?'),
      `expected sentence end, got: "${result.slice(-5)}"`);
  });

  it('falls back to word boundary when no sentence end in range', () => {
    const text = 'No sentence endings in this very long run-on text that just goes on and on without stopping for punctuation anywhere at all';
    const result = trimAtSentenceBoundary(text, 60);
    assert.ok(result.length <= 60);
  });
});

// ── enforceCharLimit ─────────────────────────────────────────────────────────

describe('enforceCharLimit', () => {
  const longTitle = 'Sun Glow Bikini Two-Piece Swimsuit Coco Cabana Best Seller Summer Beach';

  it('title types: trimmed to 60 chars at word boundary', () => {
    const result = enforceCharLimit(longTitle, 'META_TITLE_MISSING', 60);
    assert.ok(result.length <= 60, `title length ${result.length} > 60`);
  });

  it('META_TITLE_DUPLICATE trims at word boundary', () => {
    const result = enforceCharLimit(longTitle, 'META_TITLE_DUPLICATE', 60);
    assert.ok(result.length <= 60);
  });

  it('IMG_ALT_MISSING trims at word boundary (125 chars)', () => {
    const longAlt = 'A '.repeat(70); // 140 chars
    const result = enforceCharLimit(longAlt, 'IMG_ALT_MISSING', 125);
    assert.ok(result.length <= 125);
  });

  it('META_DESC_MISSING trimmed to 155 chars at sentence boundary', () => {
    const longDesc = 'Shop the Sun Glow collection now. Great deals await you here. Enjoy free shipping on all orders over fifty dollars this summer season only while supplies last.';
    const result = enforceCharLimit(longDesc, 'META_DESC_MISSING', 155);
    assert.ok(result.length <= 155, `desc length ${result.length} > 155`);
  });

  it('META_DESC_DUPLICATE uses sentence boundary', () => {
    const longDesc = 'Unique value proposition here. Another sentence follows with more content to push past the limit of one hundred and fifty five characters total.';
    const result = enforceCharLimit(longDesc, 'META_DESC_DUPLICATE', 155);
    assert.ok(result.length <= 155);
  });
});

// ── applyConfidenceRouting ────────────────────────────────────────────────────

describe('applyConfidenceRouting', () => {
  it('confidence >= 0.7 → ai_suggested, approval_required=false', () => {
    const r = applyConfidenceRouting(0.7);
    assert.equal(r.fix_source, 'ai_suggested');
    assert.equal(r.approval_required, false);
  });

  it('confidence 0.85 → ai_suggested, approval_required=false', () => {
    const r = applyConfidenceRouting(0.85);
    assert.equal(r.fix_source, 'ai_suggested');
    assert.equal(r.approval_required, false);
  });

  it('confidence 0.65 → ai_suggested, approval_required=true', () => {
    const r = applyConfidenceRouting(0.65);
    assert.equal(r.fix_source, 'ai_suggested');
    assert.equal(r.approval_required, true);
  });

  it('confidence 0.6 → approval_required=true (< 0.7)', () => {
    const r = applyConfidenceRouting(0.6);
    assert.equal(r.approval_required, true);
  });

  it('confidence 0.49 → fix_source=manual, approval_required=true', () => {
    const r = applyConfidenceRouting(0.49);
    assert.equal(r.fix_source, 'manual');
    assert.equal(r.approval_required, true);
  });

  it('confidence 0.0 → fix_source=manual', () => {
    const r = applyConfidenceRouting(0.0);
    assert.equal(r.fix_source, 'manual');
  });
});

// ── renderTemplate ────────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('fills all placeholders', () => {
    const tpl = 'URL: {url}, Brand: {brand_name}, Keywords: {gsc_keywords}';
    const result = renderTemplate(tpl, {
      url:          'https://example.com',
      brand_name:   'ACME',
      gsc_keywords: 'a, b, c',
    });
    assert.equal(result, 'URL: https://example.com, Brand: ACME, Keywords: a, b, c');
  });

  it('leaves unknown placeholders as empty string', () => {
    const result = renderTemplate('Hello {unknown}!', {});
    assert.equal(result, 'Hello !');
  });
});

// ── cacheKey ─────────────────────────────────────────────────────────────────

describe('cacheKey', () => {
  it('format is tenant_id:url:issue_type', () => {
    const r = req();
    assert.equal(cacheKey(r), `${r.tenant_id}:${r.url}:${r.issue_type}`);
  });
});

// ── PROMPT_TEMPLATES_V1 ───────────────────────────────────────────────────────

describe('PROMPT_TEMPLATES_V1', () => {
  const issueTypes = [
    'META_TITLE_MISSING',
    'META_TITLE_DUPLICATE',
    'META_DESC_MISSING',
    'META_DESC_DUPLICATE',
    'IMG_ALT_MISSING',
  ] as const;

  it('has a template for all 5 issue_types', () => {
    for (const type of issueTypes) {
      assert.ok(
        typeof PROMPT_TEMPLATES_V1[type] === 'string' &&
        PROMPT_TEMPLATES_V1[type].length > 0,
        `missing template for ${type}`,
      );
    }
  });

  it('each template contains "JSON only, no preamble"', () => {
    for (const type of issueTypes) {
      assert.ok(
        PROMPT_TEMPLATES_V1[type].includes('JSON only, no preamble'),
        `${type} template missing "JSON only, no preamble"`,
      );
    }
  });

  it('each template includes {character_limit} placeholder', () => {
    for (const type of issueTypes) {
      assert.ok(
        PROMPT_TEMPLATES_V1[type].includes('{character_limit}'),
        `${type} template missing {character_limit}`,
      );
    }
  });
});

// ── generate() — cache hit ────────────────────────────────────────────────────

describe('generate — cache hit', () => {
  it('returns cached result and skips API call', async () => {
    const cached: GenerateResult = {
      generated_text:    'Cached Title',
      confidence_score:  0.9,
      reasoning:         'cached',
      fix_source:        'ai_suggested',
      approval_required: false,
      issue_type:        'META_TITLE_MISSING',
      url:               req().url,
    };

    const { ops, getApiCallCount } = mockOps({ cached });
    const lines = await captureStdout(async () => {
      const result = await generate(req(), ops);
      assert.equal(result.generated_text, 'Cached Title');
      assert.equal(result.confidence_score, 0.9);
    });

    assert.equal(getApiCallCount(), 0, 'API should not be called on cache hit');
    const entries = parseLines(lines);
    const hit = entries.find((e) => e['stage'] === 'ai-generator:cache_hit');
    assert.ok(hit, 'cache_hit ActionLog entry expected');
  });
});

// ── generate() — successful API call ─────────────────────────────────────────

describe('generate — successful API call', () => {
  it('title: trims to 60 chars max', async () => {
    const { ops } = mockOps({
      apiResp: {
        generated_text:   'Sun Glow Bikini Two-Piece Swimsuit Coco Cabana Best Seller Summer Beach',
        confidence_score: 0.85,
        reasoning:        'Includes keyword, under limit.',
      },
    });

    const result = await generate(req({ character_limit: 60 }), ops);
    assert.ok(
      result.generated_text.length <= 60,
      `title length ${result.generated_text.length} > 60`,
    );
    assert.equal(result.fix_source, 'ai_suggested');
    assert.equal(result.approval_required, false);
  });

  it('meta desc: trims to 155 chars max at sentence boundary', async () => {
    const longDesc = 'Shop our stunning Sun Glow Bikini collection today. Enjoy free shipping on all orders. Handcrafted with premium sustainable materials for the modern beachgoer. Limited time offer.';
    const { ops } = mockOps({
      apiResp: {
        generated_text:   longDesc,
        confidence_score: 0.91,
        reasoning:        'Includes keyword and CTA.',
      },
    });

    const result = await generate(req({
      issue_type:      'META_DESC_MISSING',
      character_limit: 155,
    }), ops);

    assert.ok(
      result.generated_text.length <= 155,
      `meta desc length ${result.generated_text.length} > 155`,
    );
  });

  it('confidence 0.65 → approval_required=true, fix_source=ai_suggested', async () => {
    const { ops } = mockOps({
      apiResp: {
        generated_text:   'Sun Glow Bikini - Coco Cabana',
        confidence_score: 0.65,
        reasoning:        'Moderate confidence.',
      },
    });

    const result = await generate(req(), ops);
    assert.equal(result.approval_required, true);
    assert.equal(result.fix_source, 'ai_suggested');
  });

  it('confidence 0.49 → fix_source=manual, approval_required=true', async () => {
    const { ops } = mockOps({
      apiResp: {
        generated_text:   'Some title attempt',
        confidence_score: 0.49,
        reasoning:        'Low confidence.',
      },
    });

    const result = await generate(req(), ops);
    assert.equal(result.fix_source, 'manual');
    assert.equal(result.approval_required, true);
  });

  it('confidence 0.9 → approval_required=false, fix_source=ai_suggested', async () => {
    const { ops } = mockOps({
      apiResp: {
        generated_text:   'Sun Glow Bikini - Coco Cabana',
        confidence_score: 0.9,
        reasoning:        'High confidence.',
      },
    });

    const result = await generate(req(), ops);
    assert.equal(result.fix_source, 'ai_suggested');
    assert.equal(result.approval_required, false);
  });

  it('result always has issue_type and url', async () => {
    const { ops } = mockOps({
      apiResp: {
        generated_text:   'Sun Glow Bikini',
        confidence_score: 0.85,
        reasoning:        'ok',
      },
    });
    const r = req();
    const result = await generate(r, ops);
    assert.equal(result.issue_type, r.issue_type);
    assert.equal(result.url, r.url);
  });
});

// ── generate() — API failure ──────────────────────────────────────────────────

describe('generate — API failure', () => {
  it('returns fallback without throwing when API throws', async () => {
    const { ops } = mockOps({ apiResp: new Error('Network error') });

    let result: GenerateResult | undefined;
    const lines = await captureStdout(async () => {
      result = await generate(req(), ops); // must NOT throw
    });

    assert.ok(result, 'result must be defined');
    assert.equal(result!.fix_source, 'manual');
    assert.equal(result!.approval_required, true);
    assert.equal(result!.confidence_score, 0);
    assert.equal(result!.generated_text, '');

    const entries = parseLines(lines);
    const fallback = entries.find((e) => e['stage'] === 'ai-generator:fallback');
    assert.ok(fallback, 'fallback ActionLog entry expected');
  });

  it('returns fallback when API returns invalid JSON shape', async () => {
    const { ops } = mockOps({
      apiResp: { generated_text: 123 as unknown as string, confidence_score: 'high' as unknown as number, reasoning: '' },
    });

    const result = await generate(req(), ops);
    assert.equal(result.fix_source, 'manual');
    assert.equal(result.approval_required, true);
  });
});

// ── generate() — ActionLog stages ────────────────────────────────────────────

describe('generate — ActionLog', () => {
  it('writes ai-generator:start and ai-generator:complete on success', async () => {
    const { ops } = mockOps({
      apiResp: {
        generated_text:   'Sun Glow Bikini',
        confidence_score: 0.85,
        reasoning:        'ok',
      },
    });

    const lines = await captureStdout(async () => {
      await generate(req(), ops);
    });

    const entries = parseLines(lines);
    const start    = entries.find((e) => e['stage'] === 'ai-generator:start');
    const complete = entries.find((e) => e['stage'] === 'ai-generator:complete');

    assert.ok(start,    'ai-generator:start entry expected');
    assert.ok(complete, 'ai-generator:complete entry expected');

    const meta = complete!['metadata'] as Record<string, unknown>;
    assert.equal(meta['confidence_score'], 0.85);
    assert.equal(meta['fix_source'], 'ai_suggested');
    assert.equal(meta['approval_required'], false);
  });

  it('writes ai-generator:fallback on API error', async () => {
    const { ops } = mockOps({ apiResp: new Error('timeout') });

    const lines = await captureStdout(async () => {
      await generate(req(), ops);
    });

    const entries  = parseLines(lines);
    const fallback = entries.find((e) => e['stage'] === 'ai-generator:fallback');
    assert.ok(fallback, 'ai-generator:fallback entry expected');
  });

  it('ActionLog for successful title generation with confidence 0.85 matches spec', async () => {
    const { ops } = mockOps({
      apiResp: {
        generated_text:   'Sun Glow Bikini - Coco Cabana',
        confidence_score: 0.85,
        reasoning:        'Includes primary keyword, within limit.',
      },
    });

    const lines = await captureStdout(async () => {
      await generate(req({
        issue_type:      'META_TITLE_MISSING',
        character_limit: 60,
      }), ops);
    });

    const entries  = parseLines(lines);
    const complete = entries.find((e) => e['stage'] === 'ai-generator:complete');

    assert.ok(complete, 'complete entry expected');
    assert.equal(complete!['status'], 'ok');
    assert.equal(complete!['run_id'],    'run-ai-001');
    assert.equal(complete!['tenant_id'], 't-aaa');
    assert.equal(complete!['site_id'],   's-bbb');
    assert.equal(complete!['cms'],       'shopify');
    assert.equal(complete!['command'],   'ai-generator');

    const meta = complete!['metadata'] as Record<string, unknown>;
    assert.equal(meta['issue_type'],       'META_TITLE_MISSING');
    assert.equal(meta['confidence_score'], 0.85);
    assert.equal(meta['fix_source'],       'ai_suggested');
    assert.equal(meta['approval_required'], false);
  });
});

// ── generate() — cache write ──────────────────────────────────────────────────

describe('generate — cache write', () => {
  it('writes result to cache after successful generation', async () => {
    let cachedKey   = '';
    let cachedValue: GenerateResult | undefined;

    const { ops } = mockOps({
      apiResp: {
        generated_text:   'Sun Glow Bikini',
        confidence_score: 0.85,
        reasoning:        'ok',
      },
      cacheSetFn: (k, v) => { cachedKey = k; cachedValue = v; },
    });

    const r = req();
    await generate(r, ops);

    // Give fire-and-forget a tick
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(cachedKey, `${r.tenant_id}:${r.url}:${r.issue_type}`);
    assert.ok(cachedValue, 'cache should have been written');
    assert.equal(cachedValue!.generated_text, 'Sun Glow Bikini');
  });
});
