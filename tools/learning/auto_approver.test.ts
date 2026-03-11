/**
 * tools/learning/auto_approver.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateForAutoApproval,
  runAutoApprovalBatch,
  DEFAULT_AUTO_CONFIG,
  type AutoApprovalConfig,
  type ApprovalItem,
} from './auto_approver.ts';
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
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve({ data: filtered, error: null }).then(onfulfilled as any, onrejected as any);
    },
  };
  return q;
}

function makeDb(rows: LearningRow[]): PatternDb {
  return {
    from(_t: 'learnings') { return { select: (_c: string) => makeQuery(rows) }; },
  };
}

function row(overrides: Partial<LearningRow> = {}): LearningRow {
  return {
    id:              crypto.randomUUID(),
    issue_type:      'SCHEMA_MISSING',
    url:             'https://shop.com/products/hat',
    after_value:     'Fixed',
    approval_status: 'approved',
    created_at:      new Date().toISOString(),
    ...overrides,
  };
}

function item(overrides: Partial<ApprovalItem> = {}): ApprovalItem {
  return {
    id:           crypto.randomUUID(),
    url:          'https://shop.com/products/hat',
    issue_type:   'SCHEMA_MISSING',
    proposed_fix: '{"@type":"Product"}',
    ...overrides,
  };
}

// ── DEFAULT_AUTO_CONFIG ───────────────────────────────────────────────────────

describe('DEFAULT_AUTO_CONFIG', () => {
  it('has min_confidence of 0.85', () => {
    assert.equal(DEFAULT_AUTO_CONFIG.min_confidence, 0.85);
  });

  it('has min_samples of 5', () => {
    assert.equal(DEFAULT_AUTO_CONFIG.min_samples, 5);
  });

  it('includes SCHEMA_MISSING in eligible types', () => {
    assert.ok(DEFAULT_AUTO_CONFIG.eligible_issue_types.includes('SCHEMA_MISSING'));
  });

  it('blocks CANONICAL_MISSING', () => {
    assert.ok(DEFAULT_AUTO_CONFIG.blocked_issue_types.includes('CANONICAL_MISSING'));
  });

  it('has max_auto_per_run of 50', () => {
    assert.equal(DEFAULT_AUTO_CONFIG.max_auto_per_run, 50);
  });
});

// ── evaluateForAutoApproval ───────────────────────────────────────────────────

describe('evaluateForAutoApproval — blocking rules', () => {
  it('rejects blocked issue_type', async () => {
    const it_ = item({ issue_type: 'CANONICAL_MISSING' });
    const db  = makeDb([]);
    const r   = await evaluateForAutoApproval(it_, DEFAULT_AUTO_CONFIG, db);
    assert.equal(r.approved, false);
    assert.ok(r.reason.includes('blocked_issue_types'));
  });

  it('rejects ineligible issue_type', async () => {
    const it_ = item({ issue_type: 'UNKNOWN_TYPE' });
    const db  = makeDb([]);
    const r   = await evaluateForAutoApproval(it_, DEFAULT_AUTO_CONFIG, db);
    assert.equal(r.approved, false);
    assert.ok(r.reason.includes('not in eligible_issue_types'));
  });

  it('rejects when samples < min_samples', async () => {
    // 3 approved rows — below min_samples=5
    const rows = Array.from({ length: 3 }, () => row({ approval_status: 'approved' }));
    const r    = await evaluateForAutoApproval(item(), DEFAULT_AUTO_CONFIG, makeDb(rows));
    assert.equal(r.approved, false);
    assert.ok(r.reason.includes('insufficient samples'));
  });

  it('rejects when confidence < min_confidence', async () => {
    // 5 samples: 2 approved, 3 rejected → success_rate ~0.4
    const rows = [
      ...Array.from({ length: 2 }, () => row({ approval_status: 'approved' })),
      ...Array.from({ length: 3 }, () => row({ approval_status: 'rejected' })),
    ];
    const r = await evaluateForAutoApproval(item(), DEFAULT_AUTO_CONFIG, makeDb(rows));
    assert.equal(r.approved, false);
    assert.ok(r.reason.includes('confidence too low'));
  });

  it('approves when all checks pass', async () => {
    // 6 approved → success_rate=1.0 + samples bonus → score>0.85
    const rows = Array.from({ length: 6 }, () => row({ approval_status: 'approved' }));
    const r    = await evaluateForAutoApproval(item(), DEFAULT_AUTO_CONFIG, makeDb(rows));
    assert.equal(r.approved, true);
    assert.ok(r.reason.includes('all checks passed'));
  });
});

describe('evaluateForAutoApproval — result shape', () => {
  it('returns item_id, url, issue_type in result', async () => {
    const it_ = item({ issue_type: 'CANONICAL_MISSING' });
    const r   = await evaluateForAutoApproval(it_, DEFAULT_AUTO_CONFIG, makeDb([]));
    assert.equal(r.item_id, it_.id);
    assert.equal(r.url, it_.url);
    assert.equal(r.issue_type, 'CANONICAL_MISSING');
  });

  it('returns a valid ISO auto_approved_at', async () => {
    const r = await evaluateForAutoApproval(item({ issue_type: 'CANONICAL_MISSING' }), DEFAULT_AUTO_CONFIG, makeDb([]));
    assert.ok(!isNaN(Date.parse(r.auto_approved_at)));
  });

  it('returns confidence and confidence_tier', async () => {
    const rows = Array.from({ length: 6 }, () => row({ approval_status: 'approved' }));
    const r    = await evaluateForAutoApproval(item(), DEFAULT_AUTO_CONFIG, makeDb(rows));
    assert.ok(typeof r.confidence === 'number');
    assert.ok(['high', 'medium', 'low', 'insufficient'].includes(r.confidence_tier));
  });

  it('never throws on DB error', async () => {
    const errorDb: PatternDb = {
      from(_t: 'learnings') {
        return {
          select(_c: string) {
            const q: PatternQuery = {
              eq() { return q; },
              order() { return q; },
              limit() { return q; },
              then(f: any) { return Promise.resolve({ data: null, error: { message: 'boom' } }).then(f); },
            };
            return q;
          },
        };
      },
    };
    await assert.doesNotReject(async () => {
      await evaluateForAutoApproval(item(), DEFAULT_AUTO_CONFIG, errorDb);
    });
  });

  it('custom config with lower thresholds can approve', async () => {
    const customConfig: AutoApprovalConfig = {
      ...DEFAULT_AUTO_CONFIG,
      min_confidence: 0.5,
      min_samples:    2,
    };
    const rows = Array.from({ length: 3 }, () => row({ approval_status: 'approved' }));
    const r    = await evaluateForAutoApproval(item(), customConfig, makeDb(rows));
    assert.equal(r.approved, true);
  });
});

// ── runAutoApprovalBatch ──────────────────────────────────────────────────────

describe('runAutoApprovalBatch', () => {
  it('returns total = items.length', async () => {
    const items = [item(), item({ issue_type: 'CANONICAL_MISSING' })];
    const db    = makeDb([]);
    const res   = await runAutoApprovalBatch(items, DEFAULT_AUTO_CONFIG, db);
    assert.equal(res.total, 2);
  });

  it('separates approved and skipped', async () => {
    const rows = Array.from({ length: 6 }, () => row({ approval_status: 'approved' }));
    const items_ = [
      item(),                                      // eligible, will approve
      item({ issue_type: 'CANONICAL_MISSING' }),   // blocked
    ];
    const res = await runAutoApprovalBatch(items_, DEFAULT_AUTO_CONFIG, makeDb(rows));
    assert.equal(res.approved.length, 1);
    assert.equal(res.skipped.length, 1);
  });

  it('respects max_auto_per_run', async () => {
    const config: AutoApprovalConfig = { ...DEFAULT_AUTO_CONFIG, max_auto_per_run: 1, min_confidence: 0.5, min_samples: 2 };
    const rows   = Array.from({ length: 5 }, () => row({ approval_status: 'approved' }));
    const items_ = [item(), item(), item()];
    const res    = await runAutoApprovalBatch(items_, config, makeDb(rows));
    assert.equal(res.approved.length, 1);
    assert.ok(res.skipped.some((s) => s.reason.includes('max_auto_per_run')));
  });

  it('returns empty approved list when all blocked', async () => {
    const items_ = [
      item({ issue_type: 'CANONICAL_MISSING' }),
      item({ issue_type: 'REDIRECT_CHAIN' }),
    ];
    const res = await runAutoApprovalBatch(items_, DEFAULT_AUTO_CONFIG, makeDb([]));
    assert.equal(res.approved.length, 0);
    assert.equal(res.skipped.length, 2);
  });

  it('handles empty items list', async () => {
    const res = await runAutoApprovalBatch([], DEFAULT_AUTO_CONFIG, makeDb([]));
    assert.equal(res.total, 0);
    assert.equal(res.approved.length, 0);
    assert.equal(res.skipped.length, 0);
  });
});
