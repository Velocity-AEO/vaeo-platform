/**
 * tools/learning/approval_queue.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  queueForApproval,
  getApprovalQueue,
  updateApprovalStatus,
  type ApprovalDb,
  type ApprovalQueueItem,
  type ApprovalQueueParams,
} from './approval_queue.ts';

// ── Mock DB builder ───────────────────────────────────────────────────────────

type InsertedRow = Record<string, unknown>;
type UpdatedRow  = Record<string, unknown>;

function makeDb(overrides: {
  insertId?:     string;
  insertError?:  string;
  updateError?:  string;
  queueRows?:    ApprovalQueueItem[];
  selectError?:  string;
  onInsert?:     (row: InsertedRow) => void;
  onUpdate?:     (row: UpdatedRow) => void;
} = {}): ApprovalDb {
  return {
    from(_table) {
      return {
        insert(row: Record<string, unknown>) {
          overrides.onInsert?.(row);
          return {
            select(_col: string) {
              return {
                async maybeSingle() {
                  if (overrides.insertError) {
                    return { data: null, error: { message: overrides.insertError } };
                  }
                  return { data: { id: overrides.insertId ?? 'new-id' }, error: null };
                },
              };
            },
          };
        },
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                order(_c: string, _o: unknown) {
                  return Promise.resolve({
                    data:  overrides.selectError ? null : (overrides.queueRows ?? []),
                    error: overrides.selectError ? { message: overrides.selectError } : null,
                  });
                },
              };
            },
            order(_c: string, _o: unknown) {
              return Promise.resolve({
                data:  overrides.selectError ? null : (overrides.queueRows ?? []),
                error: overrides.selectError ? { message: overrides.selectError } : null,
              });
            },
          };
        },
        update(row: Record<string, unknown>) {
          overrides.onUpdate?.(row);
          return {
            eq(_col: string, _val: string) {
              return Promise.resolve({
                error: overrides.updateError ? { message: overrides.updateError } : null,
              });
            },
          };
        },
      };
    },
  } as unknown as ApprovalDb;
}

function makeParams(overrides: Partial<ApprovalQueueParams> = {}): ApprovalQueueParams {
  return {
    site_id:        'site-1',
    issue_type:     'SCHEMA_MISSING',
    url:            'https://example.com/p1',
    sandbox_status: 'PASS',
    ...overrides,
  };
}

// ── queueForApproval ──────────────────────────────────────────────────────────

describe('queueForApproval', () => {
  it('happy path — PASS sandbox_status inserts and returns id', async () => {
    const db = makeDb({ insertId: 'aq-001' });
    const result = await queueForApproval(makeParams(), db);
    assert.equal(result.ok, true);
    assert.equal(result.id, 'aq-001');
  });

  it('rejects when sandbox_status is not PASS', async () => {
    const db = makeDb();
    const result = await queueForApproval(makeParams({ sandbox_status: 'FAIL' }), db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('PASS'));
  });

  it('rejects when sandbox_status is WARN', async () => {
    const db = makeDb();
    const result = await queueForApproval(makeParams({ sandbox_status: 'WARN' }), db);
    assert.equal(result.ok, false);
  });

  it('inserts status=pending regardless of input', async () => {
    let captured: InsertedRow | undefined;
    const db = makeDb({ onInsert: (r) => { captured = r; } });
    await queueForApproval(makeParams(), db);
    assert.equal(captured?.status, 'pending');
  });

  it('forwards all params to insert row', async () => {
    let captured: InsertedRow | undefined;
    const db = makeDb({ onInsert: (r) => { captured = r; } });
    const params: ApprovalQueueParams = {
      site_id:         'site-2',
      action_queue_id: 'aq-ref',
      learning_id:     'learn-ref',
      issue_type:      'TITLE_MISSING',
      url:             'https://x.com/',
      before_value:    'old title',
      proposed_value:  'new title',
      sandbox_result:  { score: 90 },
      sandbox_status:  'PASS',
    };
    await queueForApproval(params, db);
    assert.equal(captured?.site_id, 'site-2');
    assert.equal(captured?.proposed_value, 'new title');
    assert.deepEqual(captured?.sandbox_result, { score: 90 });
  });

  it('returns error when DB insert fails', async () => {
    const db = makeDb({ insertError: 'FK violation' });
    const result = await queueForApproval(makeParams(), db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('FK violation'));
  });

  it('never throws', async () => {
    const db = { from: () => { throw new Error('crash'); } } as unknown as ApprovalDb;
    const result = await queueForApproval(makeParams(), db);
    assert.equal(result.ok, false);
  });

  it('returns error when no id returned', async () => {
    const db = {
      from: () => ({
        insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    } as unknown as ApprovalDb;
    const result = await queueForApproval(makeParams(), db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('No id'));
  });
});

// ── getApprovalQueue ──────────────────────────────────────────────────────────

describe('getApprovalQueue', () => {
  const ITEMS: ApprovalQueueItem[] = [
    { id: 'i1', status: 'pending', issue_type: 'SCHEMA_MISSING' },
    { id: 'i2', status: 'pending', issue_type: 'TITLE_MISSING' },
  ];

  it('returns pending items', async () => {
    const db = makeDb({ queueRows: ITEMS });
    const rows = await getApprovalQueue(db);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.id, 'i1');
  });

  it('returns empty array on DB error', async () => {
    const db = makeDb({ selectError: 'timeout' });
    const rows = await getApprovalQueue(db);
    assert.deepEqual(rows, []);
  });

  it('returns empty array when no rows', async () => {
    const db = makeDb({ queueRows: [] });
    const rows = await getApprovalQueue(db);
    assert.deepEqual(rows, []);
  });

  it('never throws', async () => {
    const db = { from: () => { throw new Error('crash'); } } as unknown as ApprovalDb;
    const rows = await getApprovalQueue(db);
    assert.deepEqual(rows, []);
  });
});

// ── updateApprovalStatus ──────────────────────────────────────────────────────

describe('updateApprovalStatus', () => {
  it('happy path — returns ok', async () => {
    const db = makeDb();
    const result = await updateApprovalStatus('id-1', 'approved', 'LGTM', db, 'user-1');
    assert.equal(result.ok, true);
  });

  it('forwards status and note to update', async () => {
    let captured: UpdatedRow | undefined;
    const db = makeDb({ onUpdate: (r) => { captured = r; } });
    await updateApprovalStatus('id-1', 'rejected', 'bad schema', db, 'rev-1');
    assert.equal(captured?.status, 'rejected');
    assert.equal(captured?.reviewer_note, 'bad schema');
    assert.equal(captured?.reviewer_id, 'rev-1');
    assert.ok(typeof captured?.reviewed_at === 'string');
  });

  it('returns error when id is empty', async () => {
    const db = makeDb();
    const result = await updateApprovalStatus('', 'approved', '', db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('id is required'));
  });

  it('returns error when status is empty', async () => {
    const db = makeDb();
    const result = await updateApprovalStatus('id-1', '', '', db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('status is required'));
  });

  it('returns error when DB update fails', async () => {
    const db = makeDb({ updateError: 'row not found' });
    const result = await updateApprovalStatus('id-1', 'approved', '', db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('row not found'));
  });

  it('never throws', async () => {
    const db = { from: () => { throw new Error('crash'); } } as unknown as ApprovalDb;
    const result = await updateApprovalStatus('id-1', 'approved', '', db);
    assert.equal(result.ok, false);
  });
});
