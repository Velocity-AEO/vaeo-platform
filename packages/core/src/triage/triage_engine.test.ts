/**
 * packages/core/src/triage/triage_engine.test.ts
 *
 * Tests for the SEO triage engine — scoring, recommendations, AI escalation.
 * All AI calls mocked via injectable TriageDeps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreItem,
  pageTypeScore,
  recommend,
  triageItem,
  triageBatch,
  triageWithPriority,
  isSystemUrl,
  type TriageItem,
  type TriageDeps,
  type TriageRecommendation,
  type TriageImpact,
  type TracerObservation,
  type GscData,
} from './triage_engine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<TriageItem> = {}): TriageItem {
  return {
    id:               'action-001',
    issue_type:       'META_TITLE_MISSING',
    url:              'https://example.com/products/widget',
    risk_score:       5,
    priority:         2,
    execution_status: 'approved',
    proposed_fix:     { new_title: 'Widget | Example Store' },
    ...overrides,
  };
}

function noopDeps(overrides: Partial<TriageDeps> = {}): TriageDeps {
  return {
    aiReview: async () => ({
      recommendation: 'review' as TriageRecommendation,
      impact:         'medium' as TriageImpact,
      reason:         'AI says review',
    }),
    ...overrides,
  };
}

// ── isSystemUrl ───────────────────────────────────────────────────────────────

describe('isSystemUrl', () => {
  it('detects /cart as system', () => {
    assert.equal(isSystemUrl('https://example.com/cart'), true);
  });
  it('detects /account as system', () => {
    assert.equal(isSystemUrl('https://example.com/account'), true);
  });
  it('detects /checkout as system', () => {
    assert.equal(isSystemUrl('https://example.com/checkout'), true);
  });
  it('detects /search as system', () => {
    assert.equal(isSystemUrl('/search'), true);
  });
  it('detects /customer_authentication as system', () => {
    assert.equal(isSystemUrl('https://example.com/customer_authentication'), true);
  });
  it('detects /account/login subpath', () => {
    assert.equal(isSystemUrl('https://example.com/account/login'), true);
  });
  it('does not flag /products/ as system', () => {
    assert.equal(isSystemUrl('https://example.com/products/widget'), false);
  });
  it('does not flag /pages/ as system', () => {
    assert.equal(isSystemUrl('https://example.com/pages/about'), false);
  });
  it('does not flag homepage as system', () => {
    assert.equal(isSystemUrl('https://example.com/'), false);
  });
});

// ── pageTypeScore ─────────────────────────────────────────────────────────────

describe('pageTypeScore', () => {
  it('/products/ → 90', () => {
    assert.equal(pageTypeScore('https://example.com/products/widget'), 90);
  });
  it('/collections/ → 80', () => {
    assert.equal(pageTypeScore('https://example.com/collections/summer'), 80);
  });
  it('/blogs/ → 70', () => {
    assert.equal(pageTypeScore('https://example.com/blogs/news/post'), 70);
  });
  it('/articles/ → 70', () => {
    assert.equal(pageTypeScore('https://example.com/articles/my-post'), 70);
  });
  it('/pages/ → 40', () => {
    assert.equal(pageTypeScore('https://example.com/pages/about'), 40);
  });
  it('system URL → 0', () => {
    assert.equal(pageTypeScore('https://example.com/cart'), 0);
  });
  it('other → 20', () => {
    assert.equal(pageTypeScore('https://example.com/some-page'), 20);
  });
  it('homepage / → 85', () => {
    assert.equal(pageTypeScore('https://example.com/'), 85);
  });
});

// ── scoreItem ─────────────────────────────────────────────────────────────────

describe('scoreItem — system URLs', () => {
  it('system URL always returns triage_score 0', () => {
    const result = scoreItem(makeItem({ url: 'https://example.com/cart' }));
    assert.equal(result.triage_score, 0);
  });

  it('system URL reason mentions system URL', () => {
    const result = scoreItem(makeItem({ url: 'https://example.com/account' }));
    assert.ok(result.reason.includes('System URL'));
  });

  it('/checkout returns triage_score 0', () => {
    const result = scoreItem(makeItem({ url: 'https://example.com/checkout' }));
    assert.equal(result.triage_score, 0);
  });
});

describe('scoreItem — product pages', () => {
  it('META_TITLE_MISSING on /products/ returns triage_score 90', () => {
    const result = scoreItem(makeItem({
      issue_type: 'META_TITLE_MISSING',
      url:        'https://example.com/products/blue-widget',
    }));
    assert.equal(result.triage_score, 90);
    assert.equal(recommend(result.triage_score), 'deploy');
  });

  it('/collections/ returns triage_score 80', () => {
    const result = scoreItem(makeItem({
      issue_type: 'META_TITLE_MISSING',
      url:        'https://example.com/collections/summer',
    }));
    assert.equal(result.triage_score, 80);
    assert.equal(recommend(result.triage_score), 'deploy');
  });
});

describe('scoreItem — /pages/ in review band', () => {
  it('/pages/ returns triage_score 40 (review zone)', () => {
    const result = scoreItem(makeItem({
      issue_type: 'canonical_missing',
      url:        'https://example.com/pages/about',
    }));
    assert.equal(result.triage_score, 40);
    assert.equal(recommend(result.triage_score), 'review');
  });
});

// ── recommend() ───────────────────────────────────────────────────────────────

describe('recommend', () => {
  it('score >= 65 → deploy', () => assert.equal(recommend(65), 'deploy'));
  it('score 100 → deploy', () => assert.equal(recommend(100), 'deploy'));
  it('score <= 35 → skip',  () => assert.equal(recommend(35), 'skip'));
  it('score 0 → skip',      () => assert.equal(recommend(0), 'skip'));
  it('score 50 → review',   () => assert.equal(recommend(50), 'review'));
  it('score 36 → review',   () => assert.equal(recommend(36), 'review'));
  it('score 64 → review',   () => assert.equal(recommend(64), 'review'));
});

// ── triageItem — system URL ───────────────────────────────────────────────────

describe('triageItem — system URL', () => {
  it('returns triage_score=0, skip, no AI call for /cart', async () => {
    let aiCalled = false;
    const deps = noopDeps({
      aiReview: async () => { aiCalled = true; return { recommendation: 'deploy', impact: 'high', reason: '' }; },
    });

    const result = await triageItem(makeItem({ url: 'https://example.com/cart' }), deps);

    assert.equal(result.triage_score, 0);
    assert.equal(result.recommendation, 'skip');
    assert.equal(result.impact, 'none');
    assert.equal(aiCalled, false);
    assert.equal(result.ai_reviewed, false);
  });

  it('/account → triage_score=0, skip, no AI', async () => {
    let aiCalled = false;
    const deps = noopDeps({ aiReview: async () => { aiCalled = true; return { recommendation: 'deploy', impact: 'high', reason: '' }; } });

    const result = await triageItem(makeItem({ url: 'https://example.com/account' }), deps);

    assert.equal(result.triage_score, 0);
    assert.equal(result.recommendation, 'skip');
    assert.equal(aiCalled, false);
  });
});

// ── triageItem — matrix: META_TITLE_MISSING on /products/ ────────────────────

describe('triageItem — META_TITLE_MISSING on /products/', () => {
  it('returns deploy without calling AI', async () => {
    let aiCalled = false;
    const deps = noopDeps({
      aiReview: async () => { aiCalled = true; return { recommendation: 'skip', impact: 'low', reason: '' }; },
    });
    const item = makeItem({
      issue_type: 'META_TITLE_MISSING',
      url:        'https://example.com/products/blue-widget',
    });

    const result = await triageItem(item, deps);

    assert.equal(result.recommendation, 'deploy');
    assert.equal(result.triage_score, 90);
    assert.equal(aiCalled, false);
    assert.equal(result.ai_reviewed, false);
  });

  it('META_DESC_MISSING on /collections/ → deploy, no AI', async () => {
    let aiCalled = false;
    const deps = noopDeps({ aiReview: async () => { aiCalled = true; return { recommendation: 'skip', impact: 'low', reason: '' }; } });

    const result = await triageItem(
      makeItem({ issue_type: 'META_DESC_MISSING', url: 'https://example.com/collections/summer' }),
      deps,
    );

    assert.equal(result.recommendation, 'deploy');
    assert.equal(aiCalled, false);
  });
});

// ── triageItem — policy page hard skip ───────────────────────────────────────

describe('triageItem — policy page hard skip', () => {
  it('SCHEMA_MISSING on /pages/privacy-policy → skip without AI call', async () => {
    let aiCalled = false;
    const deps = noopDeps({
      aiReview: async () => { aiCalled = true; return { recommendation: 'deploy', impact: 'high', reason: '' }; },
    });

    const result = await triageItem(
      makeItem({ issue_type: 'SCHEMA_MISSING', url: 'https://example.com/pages/privacy-policy' }),
      deps,
    );

    assert.equal(result.recommendation, 'skip');
    assert.equal(aiCalled, false, 'AI must NOT be called for policy pages');
  });

  it('/pages/terms-of-service → skip without AI call', async () => {
    let aiCalled = false;
    const deps = noopDeps({ aiReview: async () => { aiCalled = true; return { recommendation: 'deploy', impact: 'high', reason: '' }; } });

    const result = await triageItem(
      makeItem({ issue_type: 'META_TITLE_MISSING', url: 'https://example.com/pages/terms-of-service' }),
      deps,
    );

    assert.equal(result.recommendation, 'skip');
    assert.equal(aiCalled, false);
  });
});

// ── triageItem — AI escalation: /pages/ + SCHEMA_MISSING ─────────────────────

describe('triageItem — AI escalation: /pages/ + SCHEMA_MISSING', () => {
  it('calls AI for SCHEMA_MISSING on /pages/about (non-policy)', async () => {
    let aiCalled = false;
    const deps = noopDeps({
      aiReview: async () => {
        aiCalled = true;
        return { recommendation: 'deploy' as TriageRecommendation, impact: 'medium' as TriageImpact, reason: 'Content page worth fixing' };
      },
    });

    const result = await triageItem(
      makeItem({ issue_type: 'SCHEMA_MISSING', url: 'https://example.com/pages/about' }),
      deps,
    );

    assert.equal(aiCalled, true);
    assert.equal(result.ai_reviewed, true);
    assert.equal(result.recommendation, 'deploy');
    assert.equal(result.reason, 'Content page worth fixing');
  });
});

// ── triageItem — AI escalation: META_TITLE_MISSING + title in snapshots ──────

describe('triageItem — AI escalation: META_TITLE_MISSING + tracer snapshots', () => {
  it('calls AI when title exists in tracer_field_snapshots', async () => {
    let aiCalled = false;
    const deps = noopDeps({
      aiReview: async () => {
        aiCalled = true;
        return { recommendation: 'skip' as TriageRecommendation, impact: 'low' as TriageImpact, reason: 'Title already exists in live page' };
      },
    });
    const item = makeItem({
      issue_type:              'META_TITLE_MISSING',
      url:                     'https://example.com/products/widget',
      tracer_field_snapshots:  { title: 'Widget | Example Store' },
    });

    const result = await triageItem(item, deps);

    assert.equal(aiCalled, true);
    assert.equal(result.ai_reviewed, true);
    assert.equal(result.recommendation, 'skip');
  });

  it('does NOT call AI for META_TITLE_MISSING without title in snapshots', async () => {
    let aiCalled = false;
    const deps = noopDeps({ aiReview: async () => { aiCalled = true; return { recommendation: 'skip', impact: 'low', reason: '' }; } });

    const result = await triageItem(
      makeItem({ issue_type: 'META_TITLE_MISSING', url: 'https://example.com/products/widget' }),
      deps,
    );

    assert.equal(aiCalled, false);
    assert.equal(result.recommendation, 'deploy'); // matrix: META_TITLE_MISSING → deploy
  });
});

// ── triageItem — AI escalation: score 35–65 ───────────────────────────────────

describe('triageItem — AI escalation: score in review band (35–65)', () => {
  it('calls AI for canonical_missing on /pages/about (score=40)', async () => {
    let aiCalled = false;
    const deps = noopDeps({
      aiReview: async () => {
        aiCalled = true;
        return { recommendation: 'deploy' as TriageRecommendation, impact: 'medium' as TriageImpact, reason: 'Worth fixing for content page' };
      },
    });

    const result = await triageItem(
      makeItem({ issue_type: 'canonical_missing', url: 'https://example.com/pages/about' }),
      deps,
    );

    assert.equal(aiCalled, true);
    assert.equal(result.triage_score, 40);
    assert.equal(result.ai_reviewed, true);
  });

  it('does NOT call AI for score >= 65 (clear deploy)', async () => {
    let aiCalled = false;
    const deps = noopDeps({ aiReview: async () => { aiCalled = true; return { recommendation: 'deploy', impact: 'high', reason: '' }; } });

    const result = await triageItem(
      makeItem({ issue_type: 'canonical_missing', url: 'https://example.com/products/widget' }),
      deps,
    );

    // No matrix match + score=90 → deploy, no AI
    assert.equal(aiCalled, false);
    assert.equal(result.recommendation, 'deploy');
  });

  it('does NOT call AI for score <= 35 (clear skip)', async () => {
    let aiCalled = false;
    const deps = noopDeps({ aiReview: async () => { aiCalled = true; return { recommendation: 'skip', impact: 'low', reason: '' }; } });

    const result = await triageItem(
      makeItem({ issue_type: 'canonical_missing', url: 'https://example.com/some-other-page' }),
      deps,
    );

    // score=20 → skip, no AI
    assert.equal(aiCalled, false);
    assert.equal(result.recommendation, 'skip');
  });
});

// ── triageItem — hard skip: IMG_DIMENSIONS_MISSING elsewhere ─────────────────

describe('triageItem — hard skip: IMG_DIMENSIONS_MISSING elsewhere', () => {
  it('IMG_DIMENSIONS_MISSING on /blogs/ → hard skip, no AI', async () => {
    let aiCalled = false;
    const deps = noopDeps({ aiReview: async () => { aiCalled = true; return { recommendation: 'deploy', impact: 'high', reason: '' }; } });

    const result = await triageItem(
      makeItem({ issue_type: 'IMG_DIMENSIONS_MISSING', url: 'https://example.com/blogs/news/my-post' }),
      deps,
    );

    assert.equal(result.recommendation, 'skip');
    assert.equal(aiCalled, false, 'AI must NOT be called for hard-skip IMG issues');
  });

  it('IMG_DIMENSIONS_MISSING on /pages/ → hard skip, no AI', async () => {
    let aiCalled = false;
    const deps = noopDeps({ aiReview: async () => { aiCalled = true; return { recommendation: 'deploy', impact: 'high', reason: '' }; } });

    const result = await triageItem(
      makeItem({ issue_type: 'IMG_DIMENSIONS_MISSING', url: 'https://example.com/pages/about' }),
      deps,
    );

    assert.equal(result.recommendation, 'skip');
    assert.equal(aiCalled, false);
  });

  it('IMG_DIMENSIONS_MISSING on /products/ → deploy (high-value page)', async () => {
    const result = await triageItem(
      makeItem({ issue_type: 'IMG_DIMENSIONS_MISSING', url: 'https://example.com/products/widget' }),
      noopDeps(),
    );

    assert.equal(result.recommendation, 'deploy');
  });
});

// ── triageItem — SCHEMA_MISSING matrix ───────────────────────────────────────

describe('triageItem — SCHEMA_MISSING matrix', () => {
  it('SCHEMA_MISSING on /collections/ → deploy (no AI)', async () => {
    let aiCalled = false;
    const deps = noopDeps({ aiReview: async () => { aiCalled = true; return { recommendation: 'skip', impact: 'low', reason: '' }; } });

    const result = await triageItem(
      makeItem({ issue_type: 'SCHEMA_MISSING', url: 'https://example.com/collections/summer' }),
      deps,
    );

    assert.equal(result.recommendation, 'deploy');
    assert.equal(aiCalled, false);
  });
});

// ── triageItem — AI fallback on error ────────────────────────────────────────

describe('triageItem — AI fallback on error', () => {
  it('falls back to review when AI throws for ambiguous score', async () => {
    const deps = noopDeps({
      aiReview: async () => { throw new Error('API unavailable'); },
    });

    const result = await triageItem(
      makeItem({ issue_type: 'canonical_missing', url: 'https://example.com/pages/about' }),
      deps,
    );

    assert.equal(result.recommendation, 'review');
    assert.equal(result.ai_reviewed, false);
    assert.ok(result.reason.includes('AI review failed'));
  });
});

// ── triageBatch ───────────────────────────────────────────────────────────────

describe('triageBatch', () => {
  it('returns correct summary counts', async () => {
    const items = [
      makeItem({ id: 'a1', issue_type: 'META_TITLE_MISSING', url: 'https://example.com/products/x' }),
      makeItem({ id: 'a2', issue_type: 'SCHEMA_MISSING',     url: 'https://example.com/cart' }),
      makeItem({ id: 'a3', issue_type: 'SCHEMA_MISSING',     url: 'https://example.com/pages/privacy-policy' }),
    ];

    const result = await triageBatch(items, noopDeps());
    assert.equal(result.ok, true);
    assert.equal(result.summary.total, 3);
    assert.equal(result.summary.deploy, 1); // a1: META_TITLE_MISSING on /products/ → deploy
    assert.equal(result.summary.skip, 2);   // a2: system URL, a3: policy page
  });

  it('handles empty batch', async () => {
    const result = await triageBatch([], noopDeps());
    assert.equal(result.ok, true);
    assert.equal(result.summary.total, 0);
  });

  it('counts AI escalations', async () => {
    const items = [
      makeItem({ id: 'a1', issue_type: 'SCHEMA_MISSING', url: 'https://example.com/pages/about' }),
      makeItem({ id: 'a2', issue_type: 'SCHEMA_MISSING', url: 'https://example.com/pages/contact' }),
    ];

    const deps = noopDeps({
      aiReview: async () => ({
        recommendation: 'deploy' as TriageRecommendation,
        impact:         'medium' as TriageImpact,
        reason:         'content page worth fixing',
      }),
    });

    const result = await triageBatch(items, deps);
    assert.equal(result.summary.ai_escalations, 2);
  });

  it('item_id is set correctly on results', async () => {
    const items = [
      makeItem({ id: 'abc-123', url: 'https://example.com/products/x' }),
    ];

    const result = await triageBatch(items, noopDeps());
    assert.equal(result.results[0]!.item_id, 'abc-123');
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => triageBatch([makeItem()], noopDeps()));
  });
});

// ── triageItem — result shape ─────────────────────────────────────────────────

describe('triageItem — result fields', () => {
  it('result has item_id, triage_score, recommendation, impact, reason, ai_reviewed', async () => {
    const result = await triageItem(makeItem(), noopDeps());
    assert.ok('item_id'        in result);
    assert.ok('triage_score'   in result);
    assert.ok('recommendation' in result);
    assert.ok('impact'         in result);
    assert.ok('reason'         in result);
    assert.ok('ai_reviewed'    in result);
  });

  it('item_id matches input id', async () => {
    const result = await triageItem(makeItem({ id: 'xyz-789' }), noopDeps());
    assert.equal(result.item_id, 'xyz-789');
  });
});

// ── writeLearning — tracer observation wiring ─────────────────────────────────

describe('triageItem — writeLearning tracer observations', () => {
  function makeTracerDeps(captured: TracerObservation[], throwOnWrite = false): TriageDeps {
    return {
      ...noopDeps(),
      writeLearning: async (obs) => {
        if (throwOnWrite) throw new Error('DB down');
        captured.push(obs);
      },
    };
  }

  it('calls writeLearning with tracer_observation status', async () => {
    const captured: TracerObservation[] = [];
    const deps = makeTracerDeps(captured);
    await triageItem(makeItem({ url: 'https://example.com/products/x' }), deps);
    assert.equal(captured.length, 1);
    assert.equal(captured[0]!.sandbox_status, 'tracer_observation');
    assert.equal(captured[0]!.approval_status, 'observation');
  });

  it('writes the correct url and issue_type', async () => {
    const captured: TracerObservation[] = [];
    const deps = makeTracerDeps(captured);
    await triageItem(makeItem({ id: 'x1', url: 'https://shop.com/products/hat', issue_type: 'SCHEMA_MISSING' }), deps);
    assert.equal(captured[0]!.url, 'https://shop.com/products/hat');
    assert.equal(captured[0]!.issue_type, 'SCHEMA_MISSING');
  });

  it('tracer_data contains the full TriageResult', async () => {
    const captured: TracerObservation[] = [];
    const deps = makeTracerDeps(captured);
    const result = await triageItem(makeItem({ id: 'r1', url: 'https://example.com/products/y' }), deps);
    assert.deepEqual(captured[0]!.tracer_data, result);
  });

  it('does NOT call writeLearning when dep is omitted', async () => {
    // noopDeps has no writeLearning — should not throw
    await assert.doesNotReject(() => triageItem(makeItem(), noopDeps()));
  });

  it('writeLearning error is swallowed — result still returned', async () => {
    const captured: TracerObservation[] = [];
    const deps = makeTracerDeps(captured, /* throwOnWrite */ true);
    // Should not throw even if writeLearning throws
    const result = await triageItem(makeItem({ url: 'https://example.com/products/z' }), deps);
    assert.ok(result.item_id);
    assert.equal(captured.length, 0); // nothing was captured (threw before push)
  });

  it('triageBatch calls writeLearning for each item', async () => {
    const captured: TracerObservation[] = [];
    const deps = makeTracerDeps(captured);
    await triageBatch([
      makeItem({ id: 'b1', url: 'https://example.com/products/a' }),
      makeItem({ id: 'b2', url: 'https://example.com/products/b' }),
      makeItem({ id: 'b3', url: 'https://example.com/products/c' }),
    ], deps);
    assert.equal(captured.length, 3);
  });
});

// ── GSC reasoning enrichment ──────────────────────────────────────────────────

describe('triageItem — GSC reasoning in results', () => {
  it('includes GSC data in reason when gscData provided', async () => {
    const item = makeItem({
      url:     'https://example.com/products/widget',
      gscData: { clicks: 500, impressions: 10000, position: 3.2 },
    });
    const result = await triageItem(item, noopDeps());
    assert.ok(result.reason.includes('500 clicks/month'));
    assert.ok(result.reason.includes('position 3'));
  });

  it('includes high impact label for clicks > 100', async () => {
    const item = makeItem({
      url:     'https://example.com/products/widget',
      gscData: { clicks: 200, impressions: 5000, position: 5 },
    });
    const result = await triageItem(item, noopDeps());
    assert.ok(result.reason.includes('Priority impact: high'));
  });

  it('includes medium impact label for clicks > 10', async () => {
    const item = makeItem({
      url:     'https://example.com/products/widget',
      gscData: { clicks: 50, impressions: 1000, position: 8 },
    });
    const result = await triageItem(item, noopDeps());
    assert.ok(result.reason.includes('Priority impact: medium'));
  });

  it('includes low impact label for clicks <= 10', async () => {
    const item = makeItem({
      url:     'https://example.com/products/widget',
      gscData: { clicks: 5, impressions: 200, position: 20 },
    });
    const result = await triageItem(item, noopDeps());
    assert.ok(result.reason.includes('Priority impact: low'));
  });

  it('reason has no GSC suffix when gscData is absent', async () => {
    const result = await triageItem(makeItem(), noopDeps());
    assert.ok(!result.reason.includes('clicks/month'));
  });

  it('GSC reasoning appended to AI-reviewed results', async () => {
    const deps = noopDeps({
      aiReview: async () => ({
        recommendation: 'deploy' as TriageRecommendation,
        impact:         'medium' as TriageImpact,
        reason:         'Worth fixing',
      }),
    });
    const item = makeItem({
      issue_type: 'SCHEMA_MISSING',
      url:        'https://example.com/pages/about',
      gscData:    { clicks: 300, impressions: 8000, position: 4 },
    });
    const result = await triageItem(item, deps);
    assert.ok(result.reason.includes('Worth fixing'));
    assert.ok(result.reason.includes('300 clicks/month'));
  });
});

// ── triageWithPriority ────────────────────────────────────────────────────────

describe('triageWithPriority', () => {
  it('returns results sorted by priorityScore descending', async () => {
    const items = [
      makeItem({ id: 'low',  url: 'https://example.com/products/a', priorityScore: 5 }),
      makeItem({ id: 'high', url: 'https://example.com/products/b', priorityScore: 20 }),
      makeItem({ id: 'mid',  url: 'https://example.com/products/c', priorityScore: 12 }),
    ];
    const result = await triageWithPriority(items, noopDeps());
    assert.equal(result.ok, true);
    assert.equal(result.results[0]!.item_id, 'high');
    assert.equal(result.results[1]!.item_id, 'mid');
    assert.equal(result.results[2]!.item_id, 'low');
  });

  it('defaults priorityScore to 0 when not provided', async () => {
    const items = [makeItem({ id: 'x1' })];
    const result = await triageWithPriority(items, noopDeps());
    assert.equal(result.results[0]!.priorityScore, 0);
  });

  it('preserves triage fields alongside priorityScore', async () => {
    const items = [makeItem({ id: 'p1', url: 'https://example.com/products/x', priorityScore: 15 })];
    const result = await triageWithPriority(items, noopDeps());
    const r = result.results[0]!;
    assert.equal(r.item_id, 'p1');
    assert.equal(r.priorityScore, 15);
    assert.ok(r.recommendation);
    assert.ok(r.reason);
  });

  it('handles empty items list', async () => {
    const result = await triageWithPriority([], noopDeps());
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 0);
  });
});
