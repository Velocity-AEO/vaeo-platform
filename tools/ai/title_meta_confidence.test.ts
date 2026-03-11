/**
 * tools/ai/title_meta_confidence.test.ts
 *
 * Wiring tests: learning confidence context injected into title/meta prompts
 * and reasoning blocks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateTitle, generateMetaDescription, type GenerateParams, type TitleMetaDeps } from './title_meta_generator.ts';
import { generateReasoningBlock, type ActionRow, type ReasoningDeps } from '../reasoning/generate_block.ts';
import type { LearningRow, PatternDb, PatternQuery } from '../learning/pattern_engine.ts';

// ── Mock DB helpers ───────────────────────────────────────────────────────────

function makeQuery(rows: LearningRow[]): PatternQuery {
  let filtered = [...rows];
  const q: PatternQuery = {
    eq(col: string, val: string) {
      filtered = filtered.filter((r) => (r as Record<string, unknown>)[col] === val);
      return q;
    },
    order() { return q; },
    limit(n: number) { filtered = filtered.slice(0, n); return q; },
    then<TResult1 = { data: LearningRow[] | null; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: LearningRow[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve({ data: filtered, error: null }).then(onfulfilled as any, onrejected as any);
    },
  };
  return q;
}

function makeDb(rows: LearningRow[]): PatternDb {
  return {
    from(_table: 'learnings') {
      return { select: (_cols: string) => makeQuery(rows) };
    },
  };
}

function row(overrides: Partial<LearningRow> = {}): LearningRow {
  return {
    id:              crypto.randomUUID(),
    issue_type:      'title_missing',
    url:             'https://shop.com/products/hat',
    after_value:     'Fixed title',
    approval_status: 'approved',
    created_at:      new Date().toISOString(),
    ...overrides,
  };
}

// ── Base params ───────────────────────────────────────────────────────────────

const BASE_PARAMS: GenerateParams = {
  url:           'https://shop.com/products/hat',
  current_title: 'Hat',
  product_name:  'Summer Hat',
  keywords:      ['summer hat', 'beach hat'],
  page_type:     'product',
};

function makeDeps(capturedPrompts: string[], learningDb?: PatternDb): TitleMetaDeps {
  return {
    callAI: async (_sys: string, user: string) => {
      capturedPrompts.push(user);
      return { generated_text: 'Summer Hat | Shop', confidence_score: 0.9, reasoning: 'Good' };
    },
    updateSnapshot: async () => {},
    learningDb,
  };
}

// ── generateTitle wiring ──────────────────────────────────────────────────────

describe('generateTitle — learning confidence wiring', () => {
  it('does not include historical context when no learningDb', async () => {
    const prompts: string[] = [];
    const deps = makeDeps(prompts);
    await generateTitle(BASE_PARAMS, deps);
    assert.ok(!prompts[0].includes('Historical success rate'), 'should not include history without learningDb');
  });

  it('includes historical context in prompt when learningDb is provided', async () => {
    const prompts: string[] = [];
    const rows = Array.from({ length: 5 }, () => row({ approval_status: 'approved' }));
    const deps = makeDeps(prompts, makeDb(rows));
    await generateTitle(BASE_PARAMS, deps);
    assert.ok(prompts[0].includes('Historical success rate'), 'prompt should include success rate');
    assert.ok(prompts[0].includes('past fixes'), 'prompt should mention past fixes');
  });

  it('returns historical_confidence when learningDb is provided', async () => {
    const rows = Array.from({ length: 5 }, () => row({ approval_status: 'approved' }));
    const deps = makeDeps([], makeDb(rows));
    const result = await generateTitle(BASE_PARAMS, deps);
    assert.ok(result.historical_confidence !== undefined, 'should return historical_confidence');
    assert.ok('tier' in result.historical_confidence!);
  });

  it('historical_confidence is undefined when no learningDb', async () => {
    const deps = makeDeps([]);
    const result = await generateTitle(BASE_PARAMS, deps);
    assert.equal(result.historical_confidence, undefined);
  });
});

// ── generateMetaDescription wiring ───────────────────────────────────────────

describe('generateMetaDescription — learning confidence wiring', () => {
  it('includes historical context when learningDb has data', async () => {
    const prompts: string[] = [];
    const rows = Array.from({ length: 4 }, () => row({ issue_type: 'meta_missing', approval_status: 'approved' }));
    const deps: TitleMetaDeps = {
      callAI: async (_s, u) => { prompts.push(u); return { generated_text: 'A' .repeat(130), confidence_score: 0.8, reasoning: 'ok' }; },
      updateSnapshot: async () => {},
      learningDb: makeDb(rows),
    };
    await generateMetaDescription(BASE_PARAMS, deps);
    assert.ok(prompts[0].includes('Historical success rate'));
  });

  it('returns historical_confidence when learningDb is provided', async () => {
    const rows = Array.from({ length: 4 }, () => row({ issue_type: 'meta_missing', approval_status: 'approved' }));
    const deps: TitleMetaDeps = {
      callAI: async () => ({ generated_text: 'A'.repeat(130), confidence_score: 0.8, reasoning: 'ok' }),
      updateSnapshot: async () => {},
      learningDb: makeDb(rows),
    };
    const result = await generateMetaDescription(BASE_PARAMS, deps);
    assert.ok(result.historical_confidence !== undefined);
  });
});

// ── generateReasoningBlock wiring ─────────────────────────────────────────────

const BASE_ROW: ActionRow = {
  id: 'r1', run_id: 'run1', tenant_id: 't1', site_id: 's1',
  issue_type: 'META_TITLE_MISSING', url: 'https://shop.com/products/hat',
  risk_score: 3, priority: 1, proposed_fix: {}, approval_required: false, execution_status: 'pending',
};

function makeReasoningDeps(overrides: Partial<ReasoningDeps> = {}): ReasoningDeps {
  return {
    countUrlsAffected: async () => 1,
    findSiblingIssues: async () => [],
    storeBlock:        async () => {},
    ...overrides,
  };
}

describe('generateReasoningBlock — learning pattern wiring', () => {
  it('why field is unchanged when no learningDb', async () => {
    const deps = makeReasoningDeps();
    const block = await generateReasoningBlock(BASE_ROW, deps);
    assert.ok(!block.why.includes('Past fixes'), 'should not include history without learningDb');
  });

  it('includes pattern summary in why field when learningDb has data', async () => {
    const rows = Array.from({ length: 4 }, () => row({ issue_type: 'META_TITLE_MISSING', approval_status: 'approved' }));
    const deps = makeReasoningDeps({ learningDb: makeDb(rows) });
    const block = await generateReasoningBlock(BASE_ROW, deps);
    assert.ok(block.why.includes('Past fixes'), `why = "${block.why}"`);
    assert.ok(block.why.includes('% of the time'));
  });

  it('does not throw when learningDb has no data', async () => {
    const deps = makeReasoningDeps({ learningDb: makeDb([]) });
    const block = await generateReasoningBlock(BASE_ROW, deps);
    assert.ok(typeof block.why === 'string');
    assert.ok(!block.why.includes('Past fixes'));
  });
});
