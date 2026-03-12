/**
 * tools/mcp/handlers/pattern_performance.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPatternPerformance } from './pattern_performance.ts';

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

function makeRow(site: string, status: string, before = '60', after = '80'): Row {
  return { site_id: site, issue_type: 'title_missing', approval_status: status, before_value: before, after_value: after };
}

describe('getPatternPerformance', () => {
  it('returns zero result when no rows', async () => {
    const r = await getPatternPerformance({ issue_type: 'title_missing' }, makeDb([]));
    assert.equal(r.total_fixes, 0);
    assert.equal(r.success_rate, 0);
    assert.equal(r.issue_type, 'title_missing');
  });

  it('calculates success_rate correctly', async () => {
    const db = makeDb([makeRow('s1', 'approved'), makeRow('s2', 'approved'), makeRow('s3', 'rejected')]);
    const r = await getPatternPerformance({ issue_type: 'title_missing' }, db);
    // 2/3 ≈ 66.7%
    assert.ok(r.success_rate > 60 && r.success_rate < 70);
  });

  it('counts unique sites_affected', async () => {
    const db = makeDb([makeRow('s1', 'approved'), makeRow('s1', 'approved'), makeRow('s2', 'approved')]);
    const r = await getPatternPerformance({ issue_type: 'title_missing' }, db);
    assert.equal(r.sites_affected, 2);
  });

  it('total_fixes is total row count', async () => {
    const db = makeDb([makeRow('s1', 'approved'), makeRow('s2', 'rejected'), makeRow('s3', 'pending')]);
    const r = await getPatternPerformance({ issue_type: 'title_missing' }, db);
    assert.equal(r.total_fixes, 3);
  });

  it('filters by min_confidence — returns empty when below threshold', async () => {
    const db = makeDb([makeRow('s1', 'rejected'), makeRow('s2', 'rejected')]);
    const r = await getPatternPerformance({ issue_type: 'title_missing', min_confidence: 50 }, db);
    assert.equal(r.total_fixes, 0);
  });

  it('avg_health_delta computed from parseable before/after', async () => {
    // delta = 20 each
    const db = makeDb([makeRow('s1', 'approved', '60', '80'), makeRow('s2', 'approved', '60', '80')]);
    const r = await getPatternPerformance({ issue_type: 'title_missing' }, db);
    assert.equal(r.avg_health_delta, 20);
  });

  it('never throws when DB errors', async () => {
    await assert.doesNotReject(() => getPatternPerformance({ issue_type: 't' }, makeDb([], 'err')));
  });

  it('never throws when db throws', async () => {
    const bad = { from() { throw new Error('boom'); } };
    await assert.doesNotReject(() => getPatternPerformance({ issue_type: 't' }, bad));
  });
});
