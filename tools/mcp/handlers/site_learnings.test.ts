/**
 * tools/mcp/handlers/site_learnings.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSiteLearnings } from './site_learnings.ts';

type Row = Record<string, unknown>;

function makeDb(rows: Row[] = [], error?: string) {
  return {
    from() {
      let filtered = [...rows];
      const q: Record<string, unknown> = {
        select()  { return q; },
        eq(col: string, val: unknown) { filtered = filtered.filter((r) => r[col] === val); return q; },
        order()   { return q; },
        limit(n: number) { filtered = filtered.slice(0, n); return q; },
        then(resolve: (v: { data: Row[] | null; error: unknown }) => void) {
          resolve({ data: error ? null : filtered, error: error ? { message: error } : null });
        },
      };
      return q;
    },
  };
}

function makeRow(siteId: string, issueType = 'title_missing'): Row {
  return { site_id: siteId, issue_type: issueType, id: Math.random().toString(), approval_status: 'approved', created_at: '2026-03-10T00:00:00Z' };
}

describe('getSiteLearnings', () => {
  it('returns empty when no rows', async () => {
    const r = await getSiteLearnings({ site_id: 's1' }, makeDb([]));
    assert.deepStrictEqual(r, { learnings: [], total: 0 });
  });

  it('returns rows for site', async () => {
    const db = makeDb([makeRow('s1'), makeRow('s1'), makeRow('s2')]);
    const r = await getSiteLearnings({ site_id: 's1' }, db);
    assert.equal(r.total, 2);
    assert.equal(r.learnings.length, 2);
  });

  it('filters by issue_type when provided', async () => {
    const db = makeDb([makeRow('s1', 'title_missing'), makeRow('s1', 'meta_missing')]);
    const r = await getSiteLearnings({ site_id: 's1', issue_type: 'title_missing' }, db);
    assert.equal(r.total, 1);
  });

  it('respects limit option', async () => {
    const rows = Array.from({ length: 50 }, () => makeRow('s1'));
    const db = makeDb(rows);
    const r = await getSiteLearnings({ site_id: 's1', limit: 5 }, db);
    assert.ok(r.total <= 5);
  });

  it('caps limit at 100', async () => {
    const rows = Array.from({ length: 200 }, () => makeRow('s1'));
    const db = makeDb(rows);
    const r = await getSiteLearnings({ site_id: 's1', limit: 999 }, db);
    assert.ok(r.total <= 100);
  });

  it('never throws when DB errors', async () => {
    await assert.doesNotReject(() => getSiteLearnings({ site_id: 's1' }, makeDb([], 'error')));
  });

  it('never throws when db throws', async () => {
    const bad = { from() { throw new Error('boom'); } };
    await assert.doesNotReject(() => getSiteLearnings({ site_id: 's1' }, bad));
  });

  it('default limit is 20', async () => {
    const rows = Array.from({ length: 50 }, () => makeRow('s1'));
    const db = makeDb(rows);
    const r = await getSiteLearnings({ site_id: 's1' }, db);
    assert.ok(r.total <= 20);
  });
});
