/**
 * tools/learning/pattern_engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  queryPatterns,
  getBestFix,
  derivePageType,
  type LearningRow,
  type PatternDb,
  type PatternQuery,
} from './pattern_engine.ts';

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

function makeErrorDb(): PatternDb {
  return {
    from(_table: 'learnings') {
      return {
        select: (_cols: string) => {
          const q: PatternQuery = {
            eq()    { return q; },
            order() { return q; },
            limit() { return q; },
            then<TResult1 = unknown>(onfulfilled?: ((v: unknown) => TResult1 | PromiseLike<TResult1>) | null): PromiseLike<TResult1> {
              return Promise.resolve({ data: null, error: { message: 'DB down' } }).then(onfulfilled as any);
            },
          };
          return q;
        },
      };
    },
  };
}

// ── Sample data ───────────────────────────────────────────────────────────────

function row(overrides: Partial<LearningRow> = {}): LearningRow {
  return {
    id:               crypto.randomUUID(),
    issue_type:       'title_missing',
    url:              'https://shop.com/products/hat',
    after_value:      'New title',
    approval_status:  'approved',
    created_at:       new Date().toISOString(),
    ...overrides,
  };
}

// ── derivePageType ─────────────────────────────────────────────────────────────

describe('derivePageType', () => {
  it('identifies product pages', () => {
    assert.equal(derivePageType('https://shop.com/products/hat'), 'product');
  });

  it('identifies collection pages', () => {
    assert.equal(derivePageType('https://shop.com/collections/all'), 'collection');
  });

  it('identifies article pages', () => {
    assert.equal(derivePageType('https://shop.com/blogs/news/post'), 'article');
  });

  it('identifies regular pages', () => {
    assert.equal(derivePageType('https://shop.com/pages/about'), 'page');
  });

  it('identifies home page', () => {
    assert.equal(derivePageType('https://shop.com/'), 'home');
    assert.equal(derivePageType('/'), 'home');
  });

  it('returns other for unrecognised paths', () => {
    assert.equal(derivePageType('https://shop.com/cart'), 'other');
  });

  it('returns unknown for empty url', () => {
    assert.equal(derivePageType(undefined), 'unknown');
    assert.equal(derivePageType(''), 'unknown');
  });
});

// ── queryPatterns ─────────────────────────────────────────────────────────────

describe('queryPatterns — basic grouping', () => {
  it('returns empty array when no rows', async () => {
    const db = makeDb([]);
    const result = await queryPatterns({ db });
    assert.deepEqual(result, []);
  });

  it('groups rows by issue_type and page_type', async () => {
    const rows = Array.from({ length: 4 }, () => row());
    const db = makeDb(rows);
    const result = await queryPatterns({ db });
    assert.equal(result.length, 1);
    assert.equal(result[0].issue_type, 'title_missing');
    assert.equal(result[0].page_type, 'product');
    assert.equal(result[0].total, 4);
  });

  it('excludes groups with fewer than min_samples', async () => {
    const rows = [row(), row()]; // only 2
    const db = makeDb(rows);
    const result = await queryPatterns({ db, min_samples: 3 });
    assert.equal(result.length, 0);
  });

  it('respects custom min_samples', async () => {
    const rows = [row(), row()];
    const db = makeDb(rows);
    const result = await queryPatterns({ db, min_samples: 2 });
    assert.equal(result.length, 1);
  });

  it('calculates success_rate correctly', async () => {
    const rows = [
      row({ approval_status: 'approved' }),
      row({ approval_status: 'approved' }),
      row({ approval_status: 'rejected' }),
      row({ approval_status: 'pending' }), // not counted in rate
    ];
    const db = makeDb(rows);
    const [p] = await queryPatterns({ db, min_samples: 1 });
    // 2 approved / (2+1) decided = ~0.667
    assert.ok(Math.abs(p.success_rate - 2 / 3) < 0.001);
    assert.equal(p.passed, 2);
    assert.equal(p.failed, 1);
  });

  it('filters by issue_type', async () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ issue_type: 'title_missing' })),
      ...Array.from({ length: 3 }, () => row({ issue_type: 'meta_missing', url: 'https://shop.com/products/x' })),
    ];
    const db = makeDb(rows);
    const result = await queryPatterns({ db, issue_type: 'title_missing' });
    assert.ok(result.every((p) => p.issue_type === 'title_missing'));
  });

  it('filters by page_type', async () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ url: 'https://shop.com/products/hat' })),
      ...Array.from({ length: 3 }, () => row({ url: 'https://shop.com/collections/all' })),
    ];
    const db = makeDb(rows);
    const result = await queryPatterns({ db, page_type: 'product' });
    assert.ok(result.every((p) => p.page_type === 'product'));
  });

  it('sample_fixes contains approved after_values only', async () => {
    const rows = [
      row({ after_value: 'Fix A', approval_status: 'approved' }),
      row({ after_value: 'Fix A', approval_status: 'approved' }),
      row({ after_value: 'Fix B', approval_status: 'rejected' }),
      row({ after_value: 'Fix C', approval_status: 'approved' }),
    ];
    const db = makeDb(rows);
    const [p] = await queryPatterns({ db, min_samples: 1 });
    assert.ok(p.sample_fixes.includes('Fix A'));
    assert.ok(p.sample_fixes.includes('Fix C'));
    assert.ok(!p.sample_fixes.includes('Fix B'));
  });

  it('sorts results by total descending', async () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ issue_type: 'title_missing' })),
      ...Array.from({ length: 5 }, () => row({ issue_type: 'meta_missing', url: 'https://shop.com/products/x' })),
    ];
    const db = makeDb(rows);
    const result = await queryPatterns({ db });
    assert.equal(result[0].total, 5);
    assert.equal(result[1].total, 3);
  });

  it('returns empty array on DB error', async () => {
    const db = makeErrorDb();
    const result = await queryPatterns({ db });
    assert.deepEqual(result, []);
  });

  it('skips rows with no issue_type', async () => {
    const rows = [
      row({ issue_type: undefined }),
      row({ issue_type: undefined }),
      row({ issue_type: undefined }),
    ];
    const db = makeDb(rows);
    const result = await queryPatterns({ db });
    assert.equal(result.length, 0);
  });
});

// ── getBestFix ────────────────────────────────────────────────────────────────

describe('getBestFix', () => {
  it('returns null when fewer than 3 approved samples', async () => {
    const rows = [
      row({ approval_status: 'approved', after_value: 'Fix' }),
      row({ approval_status: 'approved', after_value: 'Fix' }),
    ];
    const db = makeDb(rows);
    const result = await getBestFix('title_missing', 'https://shop.com/products/hat', db);
    assert.equal(result, null);
  });

  it('returns the most common approved after_value', async () => {
    const rows = [
      row({ after_value: 'Best Fix', approval_status: 'approved' }),
      row({ after_value: 'Best Fix', approval_status: 'approved' }),
      row({ after_value: 'Other Fix', approval_status: 'approved' }),
    ];
    const db = makeDb(rows);
    const result = await getBestFix('title_missing', 'https://shop.com/products/hat', db);
    assert.ok(result !== null);
    assert.equal(result.recommended_fix, 'Best Fix');
  });

  it('includes based_on_samples count', async () => {
    const rows = Array.from({ length: 4 }, () => row({ approval_status: 'approved', after_value: 'Fix' }));
    const db = makeDb(rows);
    const result = await getBestFix('title_missing', 'https://shop.com/products/hat', db);
    assert.ok(result !== null);
    assert.equal(result.based_on_samples, 4);
  });

  it('confidence is between 0 and 1', async () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ approval_status: 'approved', after_value: 'Fix' })),
      row({ approval_status: 'rejected', after_value: 'Bad' }),
    ];
    const db = makeDb(rows);
    const result = await getBestFix('title_missing', 'https://shop.com/products/hat', db);
    assert.ok(result !== null);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  });

  it('returns null on DB error', async () => {
    const db = makeErrorDb();
    const result = await getBestFix('title_missing', 'https://shop.com/products/hat', db);
    assert.equal(result, null);
  });
});
