/**
 * tools/learning/auto_approval_log.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  logAutoApprovalDecision,
  getAutoApprovalHistory,
  type AuditDb,
  type AutoApprovalLogEntry,
} from './auto_approval_log.ts';
import { DEFAULT_AUTO_CONFIG } from './auto_approver.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

type StoredRow = Record<string, unknown>;

interface InsertCall { row: StoredRow }

function makeEntry(overrides: Partial<Omit<AutoApprovalLogEntry, 'id' | 'created_at'>> = {}): Omit<AutoApprovalLogEntry, 'id' | 'created_at'> {
  return {
    site_id:         'site-1',
    item_id:         crypto.randomUUID(),
    issue_type:      'SCHEMA_MISSING',
    url:             'https://shop.com/products/hat',
    decision:        'approved',
    confidence:      0.9,
    confidence_tier: 'high',
    reason:          'all checks passed',
    config_snapshot: DEFAULT_AUTO_CONFIG,
    ...overrides,
  };
}

function makeDb(
  insertCalls: InsertCall[] = [],
  storedRows:  StoredRow[]  = [],
  dbError:     string | null = null,
): AuditDb {
  return {
    from(_table: 'learnings') {
      return {
        insert(row: StoredRow) {
          insertCalls.push({ row });
          return {
            select(_col: string) {
              return {
                maybeSingle: async () => ({
                  data:  dbError ? null : { id: crypto.randomUUID() },
                  error: dbError ? { message: dbError } : null,
                }),
              };
            },
          };
        },
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                eq(_col2: string, _val2: string) {
                  return {
                    order(_c: string, _o: object) {
                      return {
                        limit(_n: number) {
                          return Promise.resolve({
                            data:  dbError ? null : storedRows,
                            error: dbError ? { message: dbError } : null,
                          });
                        },
                      };
                    },
                  };
                },
                order(_c: string, _o: object) {
                  return {
                    limit(_n: number) {
                      return Promise.resolve({
                        data:  dbError ? null : storedRows,
                        error: dbError ? { message: dbError } : null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      } as any;
    },
  };
}

// ── logAutoApprovalDecision ───────────────────────────────────────────────────

describe('logAutoApprovalDecision', () => {
  it('inserts a row with sandbox_status=auto_approval_log', async () => {
    const calls: InsertCall[] = [];
    const db = makeDb(calls);
    await logAutoApprovalDecision(makeEntry(), db);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].row['sandbox_status'], 'auto_approval_log');
  });

  it('stores the full entry as JSON in tracer_data', async () => {
    const calls: InsertCall[] = [];
    const db    = makeDb(calls);
    const entry = makeEntry({ decision: 'skipped', confidence: 0.3 });
    await logAutoApprovalDecision(entry, db);
    const parsed = JSON.parse(calls[0].row['tracer_data'] as string);
    assert.equal(parsed.decision, 'skipped');
    assert.equal(parsed.confidence, 0.3);
  });

  it('stores site_id, issue_type, url as top-level columns', async () => {
    const calls: InsertCall[] = [];
    const db = makeDb(calls);
    await logAutoApprovalDecision(makeEntry({ site_id: 's1', issue_type: 'TITLE_MISSING', url: 'https://x.com' }), db);
    assert.equal(calls[0].row['site_id'], 's1');
    assert.equal(calls[0].row['issue_type'], 'TITLE_MISSING');
    assert.equal(calls[0].row['url'], 'https://x.com');
  });

  it('never throws on DB error', async () => {
    const db = makeDb([], [], 'DB down');
    await assert.doesNotReject(async () => {
      await logAutoApprovalDecision(makeEntry(), db);
    });
  });

  it('never throws when DB throws', async () => {
    const throwDb = {
      from() {
        return {
          insert() { throw new Error('exploded'); },
          select() {
            const noop = { limit: () => Promise.resolve({ data: null, error: null }) };
            const ord  = { order: () => noop };
            const eq2  = { eq: () => ord, order: () => noop };
            const eq1  = { eq: () => eq2, order: () => noop };
            return { eq: () => eq1 };
          },
        };
      },
    } as unknown as AuditDb;
    await assert.doesNotReject(async () => {
      await logAutoApprovalDecision(makeEntry(), throwDb);
    });
  });
});

// ── getAutoApprovalHistory ────────────────────────────────────────────────────

describe('getAutoApprovalHistory', () => {
  function makeStoredRow(entry: Omit<AutoApprovalLogEntry, 'id' | 'created_at'>): StoredRow {
    return {
      tracer_data: JSON.stringify(entry),
      created_at:  new Date().toISOString(),
    };
  }

  it('returns empty array when no rows', async () => {
    const db = makeDb([], []);
    const r  = await getAutoApprovalHistory('site-1', {}, db);
    assert.deepEqual(r, []);
  });

  it('returns empty array on DB error', async () => {
    const db = makeDb([], [], 'fail');
    const r  = await getAutoApprovalHistory('site-1', {}, db);
    assert.deepEqual(r, []);
  });

  it('parses stored entries correctly', async () => {
    const entry  = makeEntry({ decision: 'approved' });
    const rows   = [makeStoredRow(entry)];
    const db     = makeDb([], rows);
    const result = await getAutoApprovalHistory('site-1', {}, db);
    assert.equal(result.length, 1);
    assert.equal(result[0].decision, 'approved');
    assert.equal(result[0].issue_type, 'SCHEMA_MISSING');
  });

  it('filters by decision=skipped', async () => {
    const rows = [
      makeStoredRow(makeEntry({ decision: 'approved' })),
      makeStoredRow(makeEntry({ decision: 'skipped' })),
    ];
    const db     = makeDb([], rows);
    const result = await getAutoApprovalHistory('site-1', { decision: 'skipped' }, db);
    assert.ok(result.every((r) => r.decision === 'skipped'));
  });

  it('skips malformed tracer_data rows without throwing', async () => {
    const rows = [{ tracer_data: 'not-json', created_at: new Date().toISOString() }];
    const db   = makeDb([], rows);
    const r    = await getAutoApprovalHistory('site-1', {}, db);
    assert.deepEqual(r, []);
  });

  it('attaches created_at from the row', async () => {
    const ts    = '2026-01-15T10:00:00.000Z';
    const rows  = [{ tracer_data: JSON.stringify(makeEntry()), created_at: ts }];
    const db    = makeDb([], rows);
    const [r]   = await getAutoApprovalHistory('site-1', {}, db);
    assert.equal(r.created_at, ts);
  });
});
