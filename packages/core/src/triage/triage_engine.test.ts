/**
 * packages/core/triage/triage_engine.test.ts
 *
 * Tests for the triage engine — scoring, recommendations, AI escalation.
 * All AI calls mocked via injectable TriageDeps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreItem,
  recommend,
  triageItem,
  triageBatch,
  isSystemUrl,
  type TriageItem,
  type TriageDeps,
  type TriageRecommendation,
} from './triage_engine.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    aiReview: async () => ({ recommendation: 'review' as TriageRecommendation, reason: 'AI says review' }),
    ...overrides,
  };
}

// ── System URL detection ─────────────────────────────────────────────────────

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
  it('detects /account/login subpath', () => {
    assert.equal(isSystemUrl('https://example.com/account/login'), true);
  });
  it('does not flag /products/ as system', () => {
    assert.equal(isSystemUrl('https://example.com/products/widget'), false);
  });
  it('does not flag /pages/ as system', () => {
    assert.equal(isSystemUrl('https://example.com/pages/about'), false);
  });
  it('does not flag / as system', () => {
    assert.equal(isSystemUrl('https://example.com/'), false);
  });
});

// ── Score: system URLs ───────────────────────────────────────────────────────

describe('scoreItem — system URLs', () => {
  it('system URL always returns score 0', () => {
    const result = scoreItem(makeItem({ url: 'https://example.com/cart' }));
    assert.equal(result.score, 0);
  });

  it('system URL reason mentions system URL', () => {
    const result = scoreItem(makeItem({ url: 'https://example.com/account' }));
    assert.ok(result.reason.includes('System URL'));
  });

  it('/checkout returns score 0', () => {
    const result = scoreItem(makeItem({ url: 'https://example.com/checkout' }));
    assert.equal(result.score, 0);
  });
});

// ── Score: product pages ─────────────────────────────────────────────────────

describe('scoreItem — product pages', () => {
  it('META_TITLE_MISSING on /products/ returns deploy-range score', () => {
    const result = scoreItem(makeItem({
      issue_type: 'META_TITLE_MISSING',
      url:        'https://example.com/products/blue-widget',
      risk_score: 5,
    }));
    // pageType(30) + issueWeight(25) + riskBonus(10) = 65
    assert.ok(result.score >= 65, `Expected >= 65, got ${result.score}`);
    assert.equal(recommend(result.score), 'deploy');
  });

  it('title_missing on /products/ also returns deploy', () => {
    const result = scoreItem(makeItem({
      issue_type: 'title_missing',
      url:        'https://example.com/products/red-hat',
      risk_score: 5,
    }));
    assert.ok(result.score >= 65);
  });
});

// ── Score: low-value pages ───────────────────────────────────────────────────

describe('scoreItem — low-value pages', () => {
  it('SCHEMA_MISSING on /pages/privacy-policy returns skip', () => {
    const result = scoreItem(makeItem({
      issue_type: 'SCHEMA_MISSING',
      url:        'https://example.com/pages/privacy-policy',
    }));
    assert.ok(result.score <= 35, `Expected <= 35, got ${result.score}`);
    assert.equal(recommend(result.score), 'skip');
  });

  it('/pages/terms-of-service also capped', () => {
    const result = scoreItem(makeItem({
      issue_type: 'META_TITLE_MISSING',
      url:        'https://example.com/pages/terms-of-service',
    }));
    assert.ok(result.score <= 30);
  });

  it('reason mentions low-value page', () => {
    const result = scoreItem(makeItem({
      issue_type: 'SCHEMA_MISSING',
      url:        'https://example.com/pages/privacy-policy',
    }));
    assert.ok(result.reason.toLowerCase().includes('low-value'));
  });
});

// ── Score: ambiguous range ───────────────────────────────────────────────────

describe('scoreItem — ambiguous range', () => {
  it('minor issue on content page falls in review range', () => {
    // pageType(/pages/) = 15, issueWeight(title_too_long) = 5, risk=5 → bonus=10 → total=30
    // Actually let's pick something that lands in 36-64
    const result = scoreItem(makeItem({
      issue_type: 'meta_too_short',
      url:        'https://example.com/collections/summer',
      risk_score: 3,
    }));
    // pageType(25) + issueWeight(8) + riskBonus(6) = 39
    assert.ok(result.score > 35 && result.score < 65,
      `Expected 36-64, got ${result.score}`);
    assert.equal(recommend(result.score), 'review');
  });
});

// ── recommend() ──────────────────────────────────────────────────────────────

describe('recommend', () => {
  it('score >= 65 → deploy', () => assert.equal(recommend(65), 'deploy'));
  it('score 100 → deploy', () => assert.equal(recommend(100), 'deploy'));
  it('score <= 35 → skip', () => assert.equal(recommend(35), 'skip'));
  it('score 0 → skip', () => assert.equal(recommend(0), 'skip'));
  it('score 50 → review', () => assert.equal(recommend(50), 'review'));
  it('score 36 → review', () => assert.equal(recommend(36), 'review'));
  it('score 64 → review', () => assert.equal(recommend(64), 'review'));
});

// ── triageItem — AI escalation ───────────────────────────────────────────────

describe('triageItem — AI escalation', () => {
  it('triggers AI review for ambiguous scores (35–65)', async () => {
    const item = makeItem({
      issue_type: 'meta_too_short',
      url:        'https://example.com/collections/summer',
      risk_score: 3,
    });

    let aiCalled = false;
    const deps = noopDeps({
      aiReview: async () => {
        aiCalled = true;
        return { recommendation: 'deploy' as TriageRecommendation, reason: 'Content page with user value' };
      },
    });

    const result = await triageItem(item, deps);
    assert.equal(aiCalled, true);
    assert.equal(result.ai_reviewed, true);
    assert.equal(result.recommendation, 'deploy');
    assert.ok(result.reason.includes('AI'));
  });

  it('does NOT call AI for clear deploy (score >= 65)', async () => {
    const item = makeItem({
      issue_type: 'META_TITLE_MISSING',
      url:        'https://example.com/products/widget',
      risk_score: 5,
    });

    let aiCalled = false;
    const deps = noopDeps({
      aiReview: async () => { aiCalled = true; return { recommendation: 'deploy', reason: '' }; },
    });

    const result = await triageItem(item, deps);
    assert.equal(aiCalled, false);
    assert.equal(result.ai_reviewed, false);
    assert.equal(result.recommendation, 'deploy');
  });

  it('does NOT call AI for clear skip (score <= 35)', async () => {
    const item = makeItem({
      issue_type: 'SCHEMA_MISSING',
      url:        'https://example.com/pages/privacy-policy',
    });

    let aiCalled = false;
    const deps = noopDeps({
      aiReview: async () => { aiCalled = true; return { recommendation: 'skip', reason: '' }; },
    });

    const result = await triageItem(item, deps);
    assert.equal(aiCalled, false);
    assert.equal(result.recommendation, 'skip');
  });

  it('falls back to review when AI throws', async () => {
    const item = makeItem({
      issue_type: 'meta_too_short',
      url:        'https://example.com/collections/summer',
      risk_score: 3,
    });

    const deps = noopDeps({
      aiReview: async () => { throw new Error('API unavailable'); },
    });

    const result = await triageItem(item, deps);
    assert.equal(result.recommendation, 'review');
    assert.equal(result.ai_reviewed, false);
    assert.ok(result.reason.includes('AI review failed'));
  });
});

// ── triageItem — system URL with SCHEMA_MISSING ──────────────────────────────

describe('triageItem — system URL without AI call', () => {
  it('SCHEMA_MISSING on /pages/privacy-policy returns skip without AI call', async () => {
    let aiCalled = false;
    const deps = noopDeps({
      aiReview: async () => { aiCalled = true; return { recommendation: 'deploy', reason: '' }; },
    });

    const result = await triageItem(
      makeItem({ issue_type: 'SCHEMA_MISSING', url: 'https://example.com/pages/privacy-policy' }),
      deps,
    );

    assert.equal(result.recommendation, 'skip');
    assert.equal(aiCalled, false, 'AI should not be called for clear skip');
  });
});

// ── triageBatch ──────────────────────────────────────────────────────────────

describe('triageBatch', () => {
  it('returns summary with correct counts', async () => {
    const items = [
      makeItem({ id: 'a1', issue_type: 'META_TITLE_MISSING', url: 'https://example.com/products/x', risk_score: 5 }),
      makeItem({ id: 'a2', issue_type: 'SCHEMA_MISSING', url: 'https://example.com/cart' }),
      makeItem({ id: 'a3', issue_type: 'SCHEMA_MISSING', url: 'https://example.com/pages/privacy-policy' }),
    ];

    const result = await triageBatch(items, noopDeps());
    assert.equal(result.ok, true);
    assert.equal(result.summary.total, 3);
    assert.equal(result.summary.deploy, 1);   // a1: product page + critical issue
    assert.equal(result.summary.skip, 2);     // a2: system URL, a3: privacy policy
  });

  it('handles empty batch', async () => {
    const result = await triageBatch([], noopDeps());
    assert.equal(result.ok, true);
    assert.equal(result.summary.total, 0);
  });

  it('counts AI escalations', async () => {
    const items = [
      makeItem({ id: 'a1', issue_type: 'meta_too_short', url: 'https://example.com/collections/summer', risk_score: 3 }),
      makeItem({ id: 'a2', issue_type: 'meta_too_short', url: 'https://example.com/collections/winter', risk_score: 3 }),
    ];

    const deps = noopDeps({
      aiReview: async () => ({ recommendation: 'deploy' as TriageRecommendation, reason: 'valuable content' }),
    });

    const result = await triageBatch(items, deps);
    assert.equal(result.summary.ai_escalations, 2);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => triageBatch(
      [makeItem()],
      noopDeps(),
    ));
  });
});

// ── Score capping ────────────────────────────────────────────────────────────

describe('scoreItem — bounds', () => {
  it('score never exceeds 100', () => {
    const result = scoreItem(makeItem({
      issue_type: 'META_TITLE_MISSING',
      url:        'https://example.com/products/x',
      risk_score: 10,
    }));
    assert.ok(result.score <= 100);
  });

  it('score never goes below 0', () => {
    const result = scoreItem(makeItem({
      issue_type: 'unknown_minor_thing',
      url:        'https://example.com/other',
      risk_score: 0,
    }));
    assert.ok(result.score >= 0);
  });
});
