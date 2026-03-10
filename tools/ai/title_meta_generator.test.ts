/**
 * tools/ai/title_meta_generator.test.ts
 *
 * Tests for generateTitle, generateMetaDescription, generateTitleMetaBatch.
 * All Claude API calls mocked via injectable deps.callAI.
 * All database writes mocked via injectable deps.updateSnapshot.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateTitle,
  generateMetaDescription,
  generateTitleMetaBatch,
  truncateAtWordBoundary,
  type GenerateParams,
  type TitleMetaDeps,
  type AIResponse,
} from './title_meta_generator.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeParams(overrides: Partial<GenerateParams> = {}): GenerateParams {
  return {
    url:           'https://cococabanalife.com/products/sunset-hat',
    current_title: 'Sunset Hat',
    product_name:  'Sunset Hat',
    keywords:      ['beach hat', 'sun protection', 'summer accessories'],
    page_type:     'product',
    brand_name:    'Cococabana Life',
    ...overrides,
  };
}

function mockAI(text: string, confidence = 0.85): TitleMetaDeps['callAI'] {
  return async () => ({
    generated_text:   text,
    confidence_score: confidence,
    reasoning:        'Test reasoning for generated text',
  });
}

function mockDeps(overrides: Partial<TitleMetaDeps> = {}): Partial<TitleMetaDeps> {
  return {
    callAI:         mockAI('Beach Hat for Sun Protection - Sunset Hat | Cococabana Life'),
    updateSnapshot: async () => {},
    ...overrides,
  };
}

// ── generateTitle — happy path ──────────────────────────────────────────────

describe('generateTitle — happy path', () => {
  it('returns a proposed title with char_count and confidence', async () => {
    const title = 'Beach Hat for Sun Protection | Cococabana Life';
    const result = await generateTitle(makeParams(), mockDeps({
      callAI: mockAI(title, 0.9),
    }));
    assert.equal(result.proposed_title, title);
    assert.equal(result.char_count, title.length);
    assert.equal(result.confidence, 0.9);
    assert.equal(result.reasoning, 'Test reasoning for generated text');
    assert.equal(result.error, undefined);
  });

  it('includes the url in the result', async () => {
    const result = await generateTitle(makeParams(), mockDeps({
      callAI: mockAI('Test Title'),
    }));
    assert.equal(result.url, 'https://cococabanalife.com/products/sunset-hat');
  });
});

// ── generateTitle — length validation ───────────────────────────────────────

describe('generateTitle — title length validation', () => {
  it('truncates titles longer than 60 characters at word boundary', async () => {
    const longTitle = 'Premium Handcrafted Artisan Beach Sun Protection Hat for Summer Vacations and Outdoor Adventures';
    const result = await generateTitle(makeParams(), mockDeps({
      callAI: mockAI(longTitle),
    }));
    assert.ok(result.char_count <= 60, `Title should be <=60 chars, got ${result.char_count}`);
    assert.ok(result.proposed_title.length <= 60);
    // Should end at a word boundary (no partial words)
    assert.ok(!result.proposed_title.endsWith(' '));
  });

  it('does not truncate titles at or under 60 characters', async () => {
    const okTitle = 'Beach Sun Hat for Summer | Cococabana Life'; // 43 chars
    const result = await generateTitle(makeParams(), mockDeps({
      callAI: mockAI(okTitle),
    }));
    assert.equal(result.proposed_title, okTitle);
    assert.equal(result.char_count, okTitle.length);
  });

  it('handles exactly 60 character title without truncation', async () => {
    const exact = 'A'.repeat(55) + ' Test'; // exactly 60
    const result = await generateTitle(makeParams(), mockDeps({
      callAI: mockAI(exact),
    }));
    assert.equal(result.proposed_title, exact);
    assert.equal(result.char_count, 60);
  });
});

// ── generateMetaDescription — happy path ────────────────────────────────────

describe('generateMetaDescription — happy path', () => {
  it('returns a proposed meta with char_count and confidence', async () => {
    const meta = 'Shop the Sunset Hat at Cococabana Life. Premium beach sun protection designed for style and comfort. Free shipping on orders over $50.';
    const result = await generateMetaDescription(makeParams(), mockDeps({
      callAI: mockAI(meta, 0.88),
    }));
    assert.equal(result.proposed_meta, meta);
    assert.equal(result.char_count, meta.length);
    assert.equal(result.confidence, 0.88);
    assert.equal(result.error, undefined);
  });
});

// ── generateMetaDescription — length validation ─────────────────────────────

describe('generateMetaDescription — meta length validation', () => {
  it('truncates meta descriptions longer than 155 characters at word boundary', async () => {
    const longMeta = 'Discover the ultimate beach sun protection hat at Cococabana Life. Our premium handcrafted sunset hat provides maximum UV coverage while keeping you stylish and comfortable during all your summer beach adventures and outdoor activities by the shore.';
    const result = await generateMetaDescription(makeParams(), mockDeps({
      callAI: mockAI(longMeta),
    }));
    assert.ok(result.char_count <= 155, `Meta should be <=155 chars, got ${result.char_count}`);
    assert.ok(result.proposed_meta.length <= 155);
  });

  it('does not truncate meta descriptions at or under 155 characters', async () => {
    const okMeta = 'Shop the Sunset Hat at Cococabana Life. Premium beach sun protection designed for style and comfort. Free shipping on orders over $50.';
    const result = await generateMetaDescription(makeParams(), mockDeps({
      callAI: mockAI(okMeta),
    }));
    assert.equal(result.proposed_meta, okMeta);
  });

  it('handles exactly 155 character meta description', async () => {
    const exact = 'A'.repeat(150) + ' Test'; // 155 chars
    const result = await generateMetaDescription(makeParams(), mockDeps({
      callAI: mockAI(exact),
    }));
    assert.equal(result.proposed_meta, exact);
    assert.equal(result.char_count, 155);
  });
});

// ── generateTitle — snapshot update called ──────────────────────────────────

describe('generateTitle — snapshot update', () => {
  it('calls updateSnapshot with url, field_type=title, and proposed value', async () => {
    let capturedUrl = '';
    let capturedField = '';
    let capturedValue = '';

    const result = await generateTitle(makeParams(), mockDeps({
      callAI: mockAI('Great Beach Hat | Cococabana'),
      updateSnapshot: async (url, fieldType, value) => {
        capturedUrl = url;
        capturedField = fieldType;
        capturedValue = value;
      },
    }));

    assert.equal(capturedUrl, 'https://cococabanalife.com/products/sunset-hat');
    assert.equal(capturedField, 'title');
    assert.equal(capturedValue, result.proposed_title);
  });
});

// ── generateMetaDescription — snapshot update called ────────────────────────

describe('generateMetaDescription — snapshot update', () => {
  it('calls updateSnapshot with url, field_type=meta_description, and proposed value', async () => {
    let capturedUrl = '';
    let capturedField = '';
    let capturedValue = '';

    const meta = 'Shop premium beach hats at Cococabana Life. Our Sunset Hat combines style with UV protection for your perfect beach day.';
    const result = await generateMetaDescription(makeParams(), mockDeps({
      callAI: mockAI(meta),
      updateSnapshot: async (url, fieldType, value) => {
        capturedUrl = url;
        capturedField = fieldType;
        capturedValue = value;
      },
    }));

    assert.equal(capturedUrl, 'https://cococabanalife.com/products/sunset-hat');
    assert.equal(capturedField, 'meta_description');
    assert.equal(capturedValue, result.proposed_meta);
  });
});

// ── Error handling ──────────────────────────────────────────────────────────

describe('generateTitle — error handling', () => {
  it('returns error result when callAI throws', async () => {
    const result = await generateTitle(makeParams(), mockDeps({
      callAI: async () => { throw new Error('API rate limit'); },
    }));
    assert.equal(result.proposed_title, '');
    assert.equal(result.char_count, 0);
    assert.equal(result.confidence, 0);
    assert.ok(result.error?.includes('API rate limit'));
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      generateTitle(makeParams(), mockDeps({
        callAI: async () => { throw new Error('crash'); },
      })),
    );
  });
});

describe('generateMetaDescription — error handling', () => {
  it('returns error result when callAI throws', async () => {
    const result = await generateMetaDescription(makeParams(), mockDeps({
      callAI: async () => { throw new Error('API timeout'); },
    }));
    assert.equal(result.proposed_meta, '');
    assert.equal(result.char_count, 0);
    assert.ok(result.error?.includes('API timeout'));
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      generateMetaDescription(makeParams(), mockDeps({
        callAI: async () => { throw new Error('crash'); },
      })),
    );
  });
});

// ── Confidence clamping ─────────────────────────────────────────────────────

describe('generateTitle — confidence clamping', () => {
  it('clamps confidence above 1.0 to 1.0', async () => {
    const result = await generateTitle(makeParams(), mockDeps({
      callAI: mockAI('Good Title Here', 1.5),
    }));
    assert.equal(result.confidence, 1.0);
  });

  it('clamps confidence below 0.0 to 0.0', async () => {
    const result = await generateTitle(makeParams(), mockDeps({
      callAI: mockAI('Good Title Here', -0.3),
    }));
    assert.equal(result.confidence, 0.0);
  });
});

// ── generateTitleMetaBatch — batch processing ───────────────────────────────

describe('generateTitleMetaBatch — batch processing', () => {
  it('processes multiple URLs and returns title + meta for each', async () => {
    const urls = [
      makeParams({ url: 'https://example.com/products/a', product_name: 'Product A' }),
      makeParams({ url: 'https://example.com/products/b', product_name: 'Product B' }),
      makeParams({ url: 'https://example.com/products/c', product_name: 'Product C' }),
    ];

    let callCount = 0;
    const results = await generateTitleMetaBatch(urls, {
      callAI: async () => {
        callCount++;
        return { generated_text: `Generated text ${callCount}`, confidence_score: 0.85, reasoning: 'batch test' };
      },
      updateSnapshot: async () => {},
    });

    assert.equal(results.length, 3);
    assert.equal(results[0].url, 'https://example.com/products/a');
    assert.equal(results[1].url, 'https://example.com/products/b');
    assert.equal(results[2].url, 'https://example.com/products/c');
    // Each URL gets 2 API calls (title + meta)
    assert.equal(callCount, 6);
  });

  it('each result has both title and meta', async () => {
    const urls = [makeParams()];
    const results = await generateTitleMetaBatch(urls, {
      callAI: async () => ({
        generated_text: 'Test output',
        confidence_score: 0.9,
        reasoning: 'test',
      }),
      updateSnapshot: async () => {},
    });

    assert.equal(results.length, 1);
    assert.ok('proposed_title' in results[0].title);
    assert.ok('proposed_meta' in results[0].meta);
    assert.equal(results[0].title.char_count, 'Test output'.length);
    assert.equal(results[0].meta.char_count, 'Test output'.length);
  });

  it('calls updateSnapshot for both title and meta_description', async () => {
    const updates: Array<{ url: string; fieldType: string }> = [];
    const urls = [makeParams()];

    await generateTitleMetaBatch(urls, {
      callAI: async () => ({
        generated_text: 'Test output',
        confidence_score: 0.85,
        reasoning: 'test',
      }),
      updateSnapshot: async (url, fieldType) => {
        updates.push({ url, fieldType });
      },
    });

    assert.equal(updates.length, 2);
    const fieldTypes = updates.map((u) => u.fieldType).sort();
    assert.deepEqual(fieldTypes, ['meta_description', 'title']);
  });

  it('handles batch of more than 10 items', async () => {
    const urls = Array.from({ length: 25 }, (_, i) =>
      makeParams({ url: `https://example.com/products/item-${i}`, product_name: `Item ${i}` }),
    );

    let callCount = 0;
    const results = await generateTitleMetaBatch(urls, {
      callAI: async () => {
        callCount++;
        return { generated_text: 'Batch item output', confidence_score: 0.8, reasoning: 'batch' };
      },
      updateSnapshot: async () => {},
    });

    assert.equal(results.length, 25);
    // 25 URLs * 2 calls each = 50
    assert.equal(callCount, 50);
  });

  it('partial failures do not block other items', async () => {
    let callIdx = 0;
    const urls = [
      makeParams({ url: 'https://example.com/products/ok' }),
      makeParams({ url: 'https://example.com/products/fail' }),
    ];

    const results = await generateTitleMetaBatch(urls, {
      callAI: async () => {
        callIdx++;
        // Fail on 3rd and 4th calls (second URL's title + meta)
        if (callIdx === 3 || callIdx === 4) throw new Error('API error');
        return { generated_text: 'Good output text', confidence_score: 0.85, reasoning: 'ok' };
      },
      updateSnapshot: async () => {},
    });

    assert.equal(results.length, 2);
    // First URL should succeed
    assert.equal(results[0].title.error, undefined);
    assert.equal(results[0].meta.error, undefined);
    // Second URL should have errors
    assert.ok(results[1].title.error?.includes('API error'));
    assert.ok(results[1].meta.error?.includes('API error'));
  });
});

// ── truncateAtWordBoundary ──────────────────────────────────────────────────

describe('truncateAtWordBoundary', () => {
  it('does not truncate text within limit', () => {
    assert.equal(truncateAtWordBoundary('Hello world', 60), 'Hello world');
  });

  it('truncates at word boundary', () => {
    const long = 'This is a somewhat longer title that exceeds the sixty character maximum limit';
    const result = truncateAtWordBoundary(long, 60);
    assert.ok(result.length <= 60);
    assert.ok(!result.endsWith(' '));
    // Should end at a complete word
    assert.equal(result, 'This is a somewhat longer title that exceeds the sixty');
  });

  it('handles text with no spaces', () => {
    const noSpaces = 'A'.repeat(80);
    const result = truncateAtWordBoundary(noSpaces, 60);
    assert.equal(result.length, 60);
  });

  it('returns exact text when equal to limit', () => {
    const exact = 'A'.repeat(60);
    assert.equal(truncateAtWordBoundary(exact, 60), exact);
  });
});

// ── Prompt content verification ─────────────────────────────────────────────

describe('generateTitle — prompt includes params', () => {
  it('passes system prompt and user prompt with keywords to callAI', async () => {
    let capturedSystem = '';
    let capturedUser = '';

    await generateTitle(makeParams(), {
      callAI: async (sys, user) => {
        capturedSystem = sys;
        capturedUser = user;
        return { generated_text: 'Test', confidence_score: 0.8, reasoning: 'test' };
      },
      updateSnapshot: async () => {},
    });

    assert.ok(capturedSystem.includes('Shopify SEO expert'));
    assert.ok(capturedSystem.includes('ONLY valid JSON'));
    assert.ok(capturedUser.includes('beach hat'));
    assert.ok(capturedUser.includes('cococabanalife.com'));
    assert.ok(capturedUser.includes('product'));
    assert.ok(capturedUser.includes('Sunset Hat'));
  });
});

describe('generateMetaDescription — prompt includes params', () => {
  it('passes system prompt and user prompt with keywords to callAI', async () => {
    let capturedUser = '';

    await generateMetaDescription(makeParams(), {
      callAI: async (_sys, user) => {
        capturedUser = user;
        return { generated_text: 'Test meta', confidence_score: 0.8, reasoning: 'test' };
      },
      updateSnapshot: async () => {},
    });

    assert.ok(capturedUser.includes('beach hat'));
    assert.ok(capturedUser.includes('action-oriented'));
    assert.ok(capturedUser.includes('120'));
    assert.ok(capturedUser.includes('155'));
  });
});
