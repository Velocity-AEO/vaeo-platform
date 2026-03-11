/**
 * tools/learning/learning_logger.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  logLearning,
  updateLearning,
  type LearningDb,
  type LearningEntry,
} from './learning_logger.ts';

// ── Minimal mock DB ───────────────────────────────────────────────────────────

type InsertedRow = LearningEntry & { approval_status?: string };

function makeDb(overrides: {
  insertId?:    string;
  insertError?: string;
  updateError?: string;
  onInsert?:    (row: InsertedRow) => void;
  onUpdate?:    (updates: Partial<LearningEntry>) => void;
} = {}): LearningDb {
  return {
    from(_table) {
      return {
        insert(row) {
          overrides.onInsert?.(row as InsertedRow);
          return {
            select(_col) {
              return {
                async maybeSingle() {
                  if (overrides.insertError) {
                    return { data: null, error: { message: overrides.insertError } };
                  }
                  return { data: { id: overrides.insertId ?? 'new-uuid' }, error: null };
                },
              };
            },
          };
        },
        update(updates) {
          overrides.onUpdate?.(updates);
          return {
            eq(_col, _val) {
              return Promise.resolve({
                error: overrides.updateError ? { message: overrides.updateError } : null,
              });
            },
          };
        },
      };
    },
  } as unknown as LearningDb;
}

// ── logLearning ───────────────────────────────────────────────────────────────

describe('logLearning', () => {
  it('happy path — inserts row and returns id', async () => {
    const db = makeDb({ insertId: 'abc-123' });
    const result = await logLearning(
      { site_id: 'site-1', issue_type: 'SCHEMA_MISSING', url: 'https://example.com/p1', fix_type: 'schema' },
      db,
    );
    assert.equal(result.ok, true);
    assert.equal(result.id, 'abc-123');
  });

  it('sets default approval_status=pending when not provided', async () => {
    let captured: InsertedRow | undefined;
    const db = makeDb({ onInsert: (row) => { captured = row; } });
    await logLearning({ site_id: 'site-1' }, db);
    assert.equal(captured?.approval_status, 'pending');
  });

  it('caller-supplied approval_status overrides default', async () => {
    let captured: InsertedRow | undefined;
    const db = makeDb({ onInsert: (row) => { captured = row; } });
    await logLearning({ approval_status: 'approved' }, db);
    assert.equal(captured?.approval_status, 'approved');
  });

  it('returns error when DB insert fails', async () => {
    const db = makeDb({ insertError: 'connection refused' });
    const result = await logLearning({ site_id: 'site-1' }, db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('connection refused'));
  });

  it('returns error when no id returned', async () => {
    const db = {
      from: () => ({
        insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    } as unknown as LearningDb;
    const result = await logLearning({}, db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('No id'));
  });

  it('never throws — returns error object on exception', async () => {
    const db = {
      from: () => { throw new Error('boom'); },
    } as unknown as LearningDb;
    const result = await logLearning({}, db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('boom'));
  });

  it('all LearningEntry fields are forwarded to DB', async () => {
    let captured: InsertedRow | undefined;
    const db = makeDb({ onInsert: (row) => { captured = row; } });
    const entry: LearningEntry = {
      site_id:        'site-x',
      issue_type:     'TITLE_MISSING',
      url:            'https://x.com/',
      fix_type:       'meta',
      before_value:   'old',
      after_value:    'new',
      sandbox_status: 'PASS',
      reviewer_note:  'looks good',
      applied_at:     '2026-03-11T00:00:00Z',
    };
    await logLearning(entry, db);
    assert.equal(captured?.site_id, 'site-x');
    assert.equal(captured?.before_value, 'old');
    assert.equal(captured?.after_value, 'new');
    assert.equal(captured?.sandbox_status, 'PASS');
  });

  it('empty entry still inserts with just default approval_status', async () => {
    const db = makeDb({ insertId: 'empty-id' });
    const result = await logLearning({}, db);
    assert.equal(result.ok, true);
    assert.equal(result.id, 'empty-id');
  });
});

// ── updateLearning ────────────────────────────────────────────────────────────

describe('updateLearning', () => {
  it('happy path — updates and returns ok', async () => {
    const db = makeDb();
    const result = await updateLearning('id-1', { approval_status: 'approved' }, db);
    assert.equal(result.ok, true);
  });

  it('forwards updates to DB', async () => {
    let captured: Partial<LearningEntry> | undefined;
    const db = makeDb({ onUpdate: (u) => { captured = u; } });
    await updateLearning('id-2', { reviewer_note: 'checked', approval_status: 'rejected' }, db);
    assert.equal(captured?.reviewer_note, 'checked');
    assert.equal(captured?.approval_status, 'rejected');
  });

  it('returns error when id is empty', async () => {
    const db = makeDb();
    const result = await updateLearning('', { approval_status: 'approved' }, db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('id is required'));
  });

  it('returns error when DB update fails', async () => {
    const db = makeDb({ updateError: 'FK violation' });
    const result = await updateLearning('id-1', { approval_status: 'approved' }, db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('FK violation'));
  });

  it('never throws', async () => {
    const db = { from: () => { throw new Error('crash'); } } as unknown as LearningDb;
    const result = await updateLearning('id-1', {}, db);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('crash'));
  });
});
