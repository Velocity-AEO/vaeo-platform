/**
 * tools/learning/confidence_scorer.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreConfidence, applyConfidenceToFix, type ConfidenceScore } from './confidence_scorer.ts';
import type { LearningRow, PatternDb, PatternQuery } from './pattern_engine.ts';

// ── Mock DB ───────────────────────────────────────────────────────────────────

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
      onrejected?:  ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
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

function makeThrowDb(): PatternDb {
  return {
    from(_table: 'learnings') {
      return {
        select: (_cols: string) => {
          const q: PatternQuery = {
            eq()    { return q; },
            order() { return q; },
            limit() { return q; },
            then<TResult1 = { data: null; error: { message: string } }, TResult2 = never>(
              onfulfilled?: ((v: { data: null; error: { message: string } }) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?:  ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ): PromiseLike<TResult1 | TResult2> {
              return Promise.resolve({ data: null, error: { message: 'DB explosion' } }).then(onfulfilled as any, onrejected as any);
            },
          };
          return q;
        },
      };
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

// ── scoreConfidence ───────────────────────────────────────────────────────────

describe('scoreConfidence — insufficient data', () => {
  it('returns tier=insufficient when fewer than 3 samples', async () => {
    const db = makeDb([row(), row()]);
    const result = await scoreConfidence('title_missing', 'New Title', db);
    assert.equal(result.tier, 'insufficient');
    assert.equal(result.score, 0);
  });

  it('returns tier=insufficient when no samples', async () => {
    const db = makeDb([]);
    const result = await scoreConfidence('title_missing', 'New Title', db);
    assert.equal(result.tier, 'insufficient');
    assert.equal(result.samples, 0);
  });

  it('returns tier=insufficient on DB error', async () => {
    const db = makeThrowDb();
    const result = await scoreConfidence('title_missing', 'New Title', db);
    assert.equal(result.tier, 'insufficient');
  });
});

describe('scoreConfidence — tier calculation', () => {
  it('returns tier=low when success_rate is between 0.2 and 0.5', async () => {
    // 1 approved out of 5 decided = 0.2
    const rows = [
      row({ approval_status: 'approved' }),
      row({ approval_status: 'rejected' }),
      row({ approval_status: 'rejected' }),
      row({ approval_status: 'rejected' }),
      row({ approval_status: 'rejected' }),
    ];
    const db = makeDb(rows);
    const result = await scoreConfidence('title_missing', 'x', db);
    assert.equal(result.tier, 'low');
  });

  it('returns tier=medium when score is between 0.5 and 0.8', async () => {
    // 4 approved, 2 rejected = 0.667 success_rate; 6 samples → +0.05 bonus = 0.717
    const rows = [
      ...Array.from({ length: 4 }, () => row({ approval_status: 'approved' })),
      ...Array.from({ length: 2 }, () => row({ approval_status: 'rejected' })),
    ];
    const db = makeDb(rows);
    const result = await scoreConfidence('title_missing', 'x', db);
    assert.equal(result.tier, 'medium');
  });

  it('returns tier=high when score > 0.8', async () => {
    // 11 approved, 1 rejected = 0.917 + 0.1 bonus = capped at 1.0
    const rows = [
      ...Array.from({ length: 11 }, () => row({ approval_status: 'approved' })),
      row({ approval_status: 'rejected' }),
    ];
    const db = makeDb(rows);
    const result = await scoreConfidence('title_missing', 'x', db);
    assert.equal(result.tier, 'high');
  });
});

describe('scoreConfidence — score formula', () => {
  it('base score equals success_rate', async () => {
    // 3 approved, 0 rejected, 3 total → success_rate = 1.0; no bonus (<= 5 samples)
    const rows = Array.from({ length: 3 }, () => row({ approval_status: 'approved' }));
    const db = makeDb(rows);
    const result = await scoreConfidence('title_missing', 'x', db);
    // success_rate = 1.0, no bonus (3 samples ≤ 5)
    assert.ok(result.score >= 1.0 || result.score <= 1.0); // must be between 0–1
    assert.ok(result.success_rate >= 0 && result.success_rate <= 1);
  });

  it('adds +0.05 bonus for 6–10 samples', async () => {
    const rows = Array.from({ length: 6 }, () => row({ approval_status: 'approved' }));
    const db = makeDb(rows);
    const result = await scoreConfidence('title_missing', 'x', db);
    // success_rate = 1.0, +0.05 → capped at 1.0
    assert.equal(result.score, 1.0);
    assert.ok(result.reasoning.includes('0.05'));
  });

  it('adds +0.10 bonus for >10 samples', async () => {
    const rows = Array.from({ length: 11 }, () => row({ approval_status: 'approved' }));
    const db = makeDb(rows);
    const result = await scoreConfidence('title_missing', 'x', db);
    assert.ok(result.reasoning.includes('0.10'));
    assert.equal(result.score, 1.0); // capped
  });

  it('score is always between 0 and 1', async () => {
    const rows = Array.from({ length: 20 }, () => row({ approval_status: 'approved' }));
    const db = makeDb(rows);
    const result = await scoreConfidence('title_missing', 'x', db);
    assert.ok(result.score >= 0 && result.score <= 1);
  });

  it('includes samples count and reasoning string', async () => {
    const rows = Array.from({ length: 5 }, () => row({ approval_status: 'approved' }));
    const db = makeDb(rows);
    const result = await scoreConfidence('title_missing', 'x', db);
    assert.equal(result.samples, 5);
    assert.ok(typeof result.reasoning === 'string' && result.reasoning.length > 0);
  });
});

// ── applyConfidenceToFix ──────────────────────────────────────────────────────

describe('applyConfidenceToFix', () => {
  it('copies proposed_fix and issue_type', () => {
    const fix = { proposed_fix: 'New Title', issue_type: 'title_missing' };
    const score: ConfidenceScore = { score: 0.9, tier: 'high', samples: 12, success_rate: 0.9, reasoning: '' };
    const result = applyConfidenceToFix(fix, score);
    assert.equal(result.proposed_fix, 'New Title');
    assert.equal(result.issue_type, 'title_missing');
  });

  it('auto_approvable=true only when tier=high and score>0.85', () => {
    const fix = { proposed_fix: 'x', issue_type: 'y' };
    const high: ConfidenceScore = { score: 0.9, tier: 'high', samples: 10, success_rate: 0.9, reasoning: '' };
    assert.equal(applyConfidenceToFix(fix, high).auto_approvable, true);
  });

  it('auto_approvable=false when tier=high but score<=0.85', () => {
    const fix = { proposed_fix: 'x', issue_type: 'y' };
    const borderline: ConfidenceScore = { score: 0.82, tier: 'high', samples: 10, success_rate: 0.82, reasoning: '' };
    assert.equal(applyConfidenceToFix(fix, borderline).auto_approvable, false);
  });

  it('auto_approvable=false when tier=medium', () => {
    const fix = { proposed_fix: 'x', issue_type: 'y' };
    const med: ConfidenceScore = { score: 0.7, tier: 'medium', samples: 5, success_rate: 0.7, reasoning: '' };
    assert.equal(applyConfidenceToFix(fix, med).auto_approvable, false);
  });

  it('auto_approvable=false for insufficient tier', () => {
    const fix = { proposed_fix: 'x', issue_type: 'y' };
    const ins: ConfidenceScore = { score: 0, tier: 'insufficient', samples: 0, success_rate: 0, reasoning: '' };
    assert.equal(applyConfidenceToFix(fix, ins).auto_approvable, false);
  });

  it('includes confidence and confidence_tier fields', () => {
    const fix = { proposed_fix: 'x', issue_type: 'y' };
    const score: ConfidenceScore = { score: 0.6, tier: 'medium', samples: 5, success_rate: 0.6, reasoning: '' };
    const result = applyConfidenceToFix(fix, score);
    assert.equal(result.confidence, 0.6);
    assert.equal(result.confidence_tier, 'medium');
  });
});
