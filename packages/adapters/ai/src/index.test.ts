/**
 * packages/adapters/ai/src/index.test.ts
 *
 * Unit tests for generateContent() — all API calls are injected (no real HTTP).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateContent,
  truncateAtWordBoundary,
  type GenerateInput,
  type ApiFetch,
} from './index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(
  body:   { generated_text: string; confidence_score: number; reasoning: string },
  status = 200,
): ApiFetch {
  return async (_url, _init) => {
    if (status !== 200) {
      return new Response(`error ${status}`, { status });
    }
    const anthropicResponse = {
      content: [{ type: 'text', text: JSON.stringify(body) }],
    };
    return new Response(JSON.stringify(anthropicResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

const BASE_TITLE_INPUT: GenerateInput = {
  fix_type:        'META_TITLE_MISSING',
  page_url:        'https://example.com/products/shirt',
  page_title:      'Blue Shirt',
  body_preview:    'A comfortable 100% cotton blue shirt for everyday wear.',
  top_keywords:    [{ query: 'blue cotton shirt', impressions: 500, position: 3.2 }],
  brand_name:      'ExampleBrand',
  character_limit: 60,
};

const BASE_DESC_INPUT: GenerateInput = {
  fix_type:        'META_DESC_MISSING',
  page_url:        'https://example.com/products/shirt',
  page_title:      'Blue Shirt',
  body_preview:    'A comfortable 100% cotton blue shirt for everyday wear.',
  top_keywords:    [],
  brand_name:      'ExampleBrand',
  character_limit: 155,
};

const BASE_ALT_INPUT: GenerateInput = {
  fix_type:         'IMG_ALT_MISSING',
  image_src:        'https://cdn.example.com/images/blue-cotton-shirt-front.jpg',
  surrounding_text: 'Shop our collection of cotton shirts. Free shipping on all orders.',
  page_title:       'Blue Shirt | ExampleBrand',
  character_limit:  125,
};

// ── truncateAtWordBoundary ────────────────────────────────────────────────────

describe('truncateAtWordBoundary', () => {
  it('returns text unchanged when under limit', () => {
    assert.equal(truncateAtWordBoundary('Hello world', 20), 'Hello world');
  });

  it('truncates at last word boundary', () => {
    const result = truncateAtWordBoundary('Hello world foo bar', 14);
    assert.ok(result.length <= 14, `Expected ≤14 chars, got "${result}" (${result.length})`);
    assert.equal(result, 'Hello world');
  });

  it('handles text with no spaces within limit', () => {
    const result = truncateAtWordBoundary('Superlongwordwithoutspaces', 10);
    assert.ok(result.length <= 10);
  });

  it('handles exact limit without truncation', () => {
    assert.equal(truncateAtWordBoundary('Hello', 5), 'Hello');
  });
});

// ── generateContent — character limit guardrail ───────────────────────────────

describe('generateContent — output is within character limit', () => {
  it('meta title: trims output that AI returned too long', async () => {
    const longTitle = 'A' + ' word'.repeat(30); // well over 60 chars
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: longTitle, confidence_score: 0.8, reasoning: 'test' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success, `Expected success, got: ${!result.success && result.error}`);
    if (!result.success) return;
    assert.ok(
      result.generated_text.length <= 60,
      `Expected ≤60 chars, got ${result.generated_text.length}: "${result.generated_text}"`,
    );
  });

  it('meta description: trims output to 155 chars', async () => {
    const longDesc = 'Description word '.repeat(20); // ~340 chars
    const result = await generateContent(BASE_DESC_INPUT, {
      apiFetch: mockFetch({ generated_text: longDesc, confidence_score: 0.75, reasoning: 'test' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.ok(
      result.generated_text.length <= 155,
      `Expected ≤155 chars, got ${result.generated_text.length}`,
    );
  });

  it('img alt: trims output to 125 chars', async () => {
    const longAlt = 'Alt text word '.repeat(15); // ~210 chars
    const result = await generateContent(BASE_ALT_INPUT, {
      apiFetch: mockFetch({ generated_text: longAlt, confidence_score: 0.6, reasoning: 'test' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.ok(
      result.generated_text.length <= 125,
      `Expected ≤125 chars, got ${result.generated_text.length}`,
    );
  });

  it('does not truncate output that is already within limit', async () => {
    const shortTitle = 'Returns & Refunds | Cococabana Life';
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: shortTitle, confidence_score: 0.85, reasoning: 'concise' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.generated_text, shortTitle);
  });
});

// ── generateContent — confidence score guardrail ──────────────────────────────

describe('generateContent — confidence score is between 0 and 1', () => {
  it('returns confidence_score between 0 and 1 for normal input', async () => {
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: 'Blue Cotton Shirt | ExampleBrand', confidence_score: 0.85, reasoning: 'good context' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.ok(result.confidence_score >= 0, 'confidence_score must be >= 0');
    assert.ok(result.confidence_score <= 1, 'confidence_score must be <= 1');
  });

  it('clamps model confidence above 1.0 to exactly 1.0', async () => {
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: 'Good title', confidence_score: 1.5, reasoning: 'test' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.confidence_score, 1.0);
  });

  it('clamps model confidence below 0.0 to exactly 0.0', async () => {
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: 'Some title', confidence_score: -0.2, reasoning: 'test' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.confidence_score, 0.0);
  });
});

// ── generateContent — low context signals low confidence ──────────────────────

describe('generateContent — low context returns low_confidence=true', () => {
  it('sets low_confidence=true when confidence_score < 0.7', async () => {
    const result = await generateContent(
      { ...BASE_TITLE_INPUT, body_preview: '', top_keywords: [] },
      {
        apiFetch: mockFetch({ generated_text: 'Generic title', confidence_score: 0.45, reasoning: 'sparse context' }),
        apiKey:   'test-key',
      },
    );
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.low_confidence, true, 'Expected low_confidence=true for score 0.45');
  });

  it('sets low_confidence=false when confidence_score >= 0.7', async () => {
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: 'Confident title', confidence_score: 0.82, reasoning: 'rich context' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.low_confidence, false, 'Expected low_confidence=false for score 0.82');
  });

  it('sets low_confidence=true exactly at boundary (0.69)', async () => {
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: 'Borderline title', confidence_score: 0.69, reasoning: 'borderline' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.low_confidence, true);
  });

  it('sets low_confidence=false exactly at threshold (0.7)', async () => {
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: 'OK title', confidence_score: 0.7, reasoning: 'ok' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.low_confidence, false);
  });
});

// ── generateContent — API failure handling ────────────────────────────────────

describe('generateContent — API failure returns success=false', () => {
  it('returns success=false on HTTP 500', async () => {
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: '', confidence_score: 0, reasoning: '' }, 500),
      apiKey:   'test-key',
    });
    assert.equal(result.success, false);
    assert.ok(!result.success && result.error.includes('500'));
  });

  it('returns success=false on HTTP 401 (bad API key)', async () => {
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: '', confidence_score: 0, reasoning: '' }, 401),
      apiKey:   'bad-key',
    });
    assert.equal(result.success, false);
    assert.ok(!result.success && result.error.includes('401'));
  });

  it('returns success=false when fetch throws (network error)', async () => {
    const failFetch: ApiFetch = async () => { throw new Error('ECONNREFUSED'); };
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: failFetch,
      apiKey:   'test-key',
    });
    assert.equal(result.success, false);
    assert.ok(!result.success && result.error.includes('ECONNREFUSED'));
  });

  it('returns success=false when model returns invalid JSON', async () => {
    const badFetch: ApiFetch = async () =>
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'not valid json at all' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: badFetch,
      apiKey:   'test-key',
    });
    assert.equal(result.success, false);
  });

  it('does not throw — always returns GenerateResult', async () => {
    const failFetch: ApiFetch = async () => { throw new Error('network down'); };
    await assert.doesNotReject(() =>
      generateContent(BASE_TITLE_INPUT, { apiFetch: failFetch, apiKey: 'test-key' }),
    );
  });
});

// ── generateContent — result shape ────────────────────────────────────────────

describe('generateContent — result shape', () => {
  it('includes fix_type and template_version on success', async () => {
    const result = await generateContent(BASE_TITLE_INPUT, {
      apiFetch: mockFetch({ generated_text: 'Good title', confidence_score: 0.8, reasoning: 'test' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.fix_type, 'META_TITLE_MISSING');
    assert.equal(typeof result.template_version, 'string');
    assert.ok(result.template_version.length > 0);
  });

  it('works for META_TITLE_DUPLICATE fix type', async () => {
    const input: GenerateInput = { ...BASE_TITLE_INPUT, fix_type: 'META_TITLE_DUPLICATE' };
    const result = await generateContent(input, {
      apiFetch: mockFetch({ generated_text: 'Unique title', confidence_score: 0.75, reasoning: 'dedup' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.fix_type, 'META_TITLE_DUPLICATE');
  });

  it('works for IMG_ALT_MISSING fix type', async () => {
    const result = await generateContent(BASE_ALT_INPUT, {
      apiFetch: mockFetch({ generated_text: 'Blue cotton shirt on display', confidence_score: 0.7, reasoning: 'filename' }),
      apiKey:   'test-key',
    });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.fix_type, 'IMG_ALT_MISSING');
  });
});
