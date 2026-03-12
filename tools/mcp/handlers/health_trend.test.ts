/**
 * tools/mcp/handlers/health_trend.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getHealthTrend } from './health_trend.ts';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function makeDb(tables: Tables = {}, error?: string) {
  return {
    from(table: string) {
      let filtered = [...(tables[table] ?? [])];
      const q: Record<string, unknown> = {
        select()  { return q; },
        eq(col: string, val: unknown) { filtered = filtered.filter((r) => r[col] === val); return q; },
        gte(col: string, val: unknown) { filtered = filtered.filter((r) => String(r[col]) >= String(val)); return q; },
        lte(col: string, val: unknown) { filtered = filtered.filter((r) => String(r[col]) <= String(val)); return q; },
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

function makeScore(score: number, date: string): Row {
  return { site_id: 's1', score, recorded_at: `${date}T12:00:00Z` };
}

function makeFix(date: string): Row {
  return { site_id: 's1', execution_status: 'deployed', updated_at: `${date}T12:00:00Z` };
}

describe('getHealthTrend', () => {
  it('returns empty trend and stable direction when no data', async () => {
    const r = await getHealthTrend({ site_id: 's1' }, makeDb({}));
    assert.deepStrictEqual(r.trend, []);
    assert.equal(r.direction, 'stable');
  });

  it('builds trend entries from health score rows', async () => {
    const db = makeDb({
      site_health_scores: [makeScore(70, '2026-03-01'), makeScore(80, '2026-03-05')],
      action_queue: [],
    });
    const r = await getHealthTrend({ site_id: 's1' }, db);
    assert.equal(r.trend.length, 2);
    assert.ok(r.trend[0]?.date !== undefined);
    assert.ok(typeof r.trend[0]?.score === 'number');
  });

  it('direction=improving when last score > first + 5', async () => {
    const db = makeDb({
      site_health_scores: [makeScore(60, '2026-02-10'), makeScore(80, '2026-03-10')],
      action_queue: [],
    });
    const r = await getHealthTrend({ site_id: 's1' }, db);
    assert.equal(r.direction, 'improving');
  });

  it('direction=declining when last score < first - 5', async () => {
    const db = makeDb({
      site_health_scores: [makeScore(80, '2026-02-10'), makeScore(60, '2026-03-10')],
      action_queue: [],
    });
    const r = await getHealthTrend({ site_id: 's1' }, db);
    assert.equal(r.direction, 'declining');
  });

  it('direction=stable when delta <= 5', async () => {
    const db = makeDb({
      site_health_scores: [makeScore(70, '2026-02-10'), makeScore(73, '2026-03-10')],
      action_queue: [],
    });
    const r = await getHealthTrend({ site_id: 's1' }, db);
    assert.equal(r.direction, 'stable');
  });

  it('fixes_applied counts deployed fixes on matching date', async () => {
    const db = makeDb({
      site_health_scores: [makeScore(70, '2026-03-10')],
      action_queue: [makeFix('2026-03-10'), makeFix('2026-03-10')],
    });
    const r = await getHealthTrend({ site_id: 's1' }, db);
    assert.equal(r.trend[0]?.fixes_applied, 2);
  });

  it('trend is ordered chronologically', async () => {
    const db = makeDb({
      site_health_scores: [makeScore(80, '2026-03-10'), makeScore(70, '2026-03-01')],
      action_queue: [],
    });
    const r = await getHealthTrend({ site_id: 's1' }, db);
    assert.ok(r.trend[0]!.date <= r.trend[r.trend.length - 1]!.date);
  });

  it('never throws on DB error', async () => {
    await assert.doesNotReject(() => getHealthTrend({ site_id: 's1' }, makeDb({}, 'err')));
  });

  it('never throws when db throws', async () => {
    const bad = { from() { throw new Error('boom'); } };
    await assert.doesNotReject(() => getHealthTrend({ site_id: 's1' }, bad));
  });
});
