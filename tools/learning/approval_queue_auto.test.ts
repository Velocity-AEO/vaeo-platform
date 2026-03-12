/**
 * tools/learning/approval_queue_auto.test.ts
 *
 * Wiring tests: auto-approval path in queueForApproval + processAutoApprovals.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  queueForApproval,
  processAutoApprovals,
  type ApprovalDb,
  type ApprovalQueueItem,
} from './approval_queue.ts';
import { DEFAULT_AUTO_CONFIG, type AutoApprovalConfig } from './auto_approver.ts';
import type { LearningRow, PatternDb, PatternQuery } from './pattern_engine.ts';

// ── Mock helpers ──────────────────────────────────────────────────────────────

// PatternDb mock (for confidence scoring inside auto-approver)
function makePatternQuery(rows: LearningRow[]): PatternQuery {
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

interface InsertCall { row: Record<string, unknown> }
interface UpdateCall { id: string; updates: Record<string, unknown> }

// Combined mock that implements both ApprovalDb and PatternDb
function makeCombinedDb(
  learningRows: LearningRow[] = [],
  queueRows: ApprovalQueueItem[] = [],
  insertCalls: InsertCall[] = [],
  updateCalls: UpdateCall[] = [],
): ApprovalDb & PatternDb {
  const insertedId = crypto.randomUUID();
  return {
    from(table: string) {
      if (table === 'learnings') {
        return {
          select: (_cols: string) => makePatternQuery(learningRows),
        } as any;
      }
      // approval_queue
      return {
        insert(row: Record<string, unknown>) {
          insertCalls.push({ row });
          return {
            select(_col: string) {
              return {
                maybeSingle: async () => ({ data: { id: insertedId }, error: null }),
              };
            },
          };
        },
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                order(_c: string, _o: object) {
                  return Promise.resolve({ data: queueRows, error: null });
                },
              };
            },
            order(_c: string, _o: object) {
              return Promise.resolve({ data: queueRows, error: null });
            },
          };
        },
        update(updates: Record<string, unknown>) {
          return {
            eq(_col: string, val: string) {
              updateCalls.push({ id: val, updates });
              return Promise.resolve({ error: null });
            },
          };
        },
      } as any;
    },
  } as any;
}

function lRow(overrides: Partial<LearningRow> = {}): LearningRow {
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

function qItem(overrides: Partial<ApprovalQueueItem> = {}): ApprovalQueueItem {
  return {
    id:             crypto.randomUUID(),
    issue_type:     'SCHEMA_MISSING',
    url:            'https://shop.com/products/hat',
    proposed_value: '{"@type":"Product"}',
    status:         'pending',
    ...overrides,
  };
}

// High-confidence config: 3 samples, 0.5 threshold for easy testing
const EASY_CONFIG: AutoApprovalConfig = {
  ...DEFAULT_AUTO_CONFIG,
  min_confidence: 0.5,
  min_samples:    3,
};

// ── queueForApproval + autoApprove ────────────────────────────────────────────

describe('queueForApproval — auto-approval wiring', () => {
  it('inserts with status=pending when autoApprove=false', async () => {
    const inserts: InsertCall[] = [];
    const db = makeCombinedDb([], [], inserts);
    await queueForApproval({ sandbox_status: 'PASS', issue_type: 'SCHEMA_MISSING', url: 'https://shop.com/', autoApprove: false }, db);
    assert.equal(inserts[0].row['status'], 'pending');
  });

  it('inserts with status=approved when auto-approval passes', async () => {
    const rows = Array.from({ length: 6 }, () => lRow({ approval_status: 'approved' }));
    const inserts: InsertCall[] = [];
    const db = makeCombinedDb(rows, [], inserts);
    await queueForApproval({
      sandbox_status:      'PASS',
      issue_type:          'SCHEMA_MISSING',
      url:                 'https://shop.com/products/hat',
      proposed_value:      '{"@type":"Product"}',
      autoApprove:         true,
      autoApprovalConfig:  EASY_CONFIG,
    }, db);
    assert.equal(inserts[0].row['status'], 'approved');
  });

  it('inserts with status=pending when auto-approval does not pass (blocked type)', async () => {
    const inserts: InsertCall[] = [];
    const db = makeCombinedDb([], [], inserts);
    await queueForApproval({
      sandbox_status:     'PASS',
      issue_type:         'CANONICAL_MISSING',
      url:                'https://shop.com/',
      autoApprove:        true,
      autoApprovalConfig: EASY_CONFIG,
    }, db);
    assert.equal(inserts[0].row['status'], 'pending');
  });

  it('includes reviewer_note with auto_approved=true when approved', async () => {
    const rows = Array.from({ length: 6 }, () => lRow({ approval_status: 'approved' }));
    const inserts: InsertCall[] = [];
    const db = makeCombinedDb(rows, [], inserts);
    await queueForApproval({
      sandbox_status:     'PASS',
      issue_type:         'SCHEMA_MISSING',
      url:                'https://shop.com/products/hat',
      autoApprove:        true,
      autoApprovalConfig: EASY_CONFIG,
    }, db);
    assert.ok(String(inserts[0].row['reviewer_note']).includes('auto_approved=true'));
  });

  it('returns ok=true regardless of auto-approval path', async () => {
    const rows = Array.from({ length: 6 }, () => lRow({ approval_status: 'approved' }));
    const db = makeCombinedDb(rows);
    const r = await queueForApproval({
      sandbox_status:     'PASS',
      issue_type:         'SCHEMA_MISSING',
      url:                'https://shop.com/',
      autoApprove:        true,
      autoApprovalConfig: EASY_CONFIG,
    }, db);
    assert.equal(r.ok, true);
  });

  it('ignores autoApprove when no config provided', async () => {
    const inserts: InsertCall[] = [];
    const db = makeCombinedDb([], [], inserts);
    await queueForApproval({
      sandbox_status: 'PASS',
      issue_type:     'SCHEMA_MISSING',
      url:            'https://shop.com/',
      autoApprove:    true,
      // no autoApprovalConfig
    }, db);
    assert.equal(inserts[0].row['status'], 'pending');
  });
});

// ── processAutoApprovals ──────────────────────────────────────────────────────

describe('processAutoApprovals', () => {
  it('returns { processed:0, approved:0, skipped:0 } when no pending items', async () => {
    const db = makeCombinedDb([], []);
    const r  = await processAutoApprovals('site-1', EASY_CONFIG, db);
    assert.deepEqual(r, { processed: 0, approved: 0, skipped: 0 });
  });

  it('processes pending items and approves eligible ones', async () => {
    const lRows  = Array.from({ length: 6 }, () => lRow({ approval_status: 'approved' }));
    const qRows  = [qItem(), qItem({ issue_type: 'CANONICAL_MISSING' })];
    const updates: UpdateCall[] = [];
    const db = makeCombinedDb(lRows, qRows, [], updates);
    const r  = await processAutoApprovals('site-1', EASY_CONFIG, db);
    assert.equal(r.processed, 2);
    assert.equal(r.approved, 1);
    assert.equal(r.skipped, 1);
  });

  it('updates status=approved for approved items', async () => {
    const lRows  = Array.from({ length: 6 }, () => lRow({ approval_status: 'approved' }));
    const qRows  = [qItem()];
    const updates: UpdateCall[] = [];
    const db = makeCombinedDb(lRows, qRows, [], updates);
    await processAutoApprovals('site-1', EASY_CONFIG, db);
    const approved = updates.find((u) => u.updates['status'] === 'approved');
    assert.ok(approved, 'should have called update with status=approved');
  });

  it('never throws on DB error', async () => {
    const badDb = {
      from() {
        return {
          select() { return { eq() { return { order() { return Promise.reject(new Error('boom')); } } } }; },
          insert() { return { select() { return { maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) }; } }; },
          update() { return { eq() { return Promise.resolve({ error: null }); } }; },
        };
      },
    } as unknown as ApprovalDb;
    await assert.doesNotReject(async () => {
      await processAutoApprovals('site-1', EASY_CONFIG, badDb);
    });
  });

  it('returns zeros on DB error', async () => {
    const badDb = {
      from() {
        return {
          select() { return { eq() { return { order() { return Promise.resolve({ data: null, error: { message: 'fail' } }); } } } }; },
        };
      },
    } as unknown as ApprovalDb;
    const r = await processAutoApprovals('site-1', EASY_CONFIG, badDb);
    assert.deepEqual(r, { processed: 0, approved: 0, skipped: 0 });
  });
});
