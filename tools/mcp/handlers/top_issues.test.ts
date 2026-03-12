/**
 * tools/mcp/handlers/top_issues.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTopIssues } from './top_issues.ts';

type Row = Record<string, unknown>;

function makeDb(rows: Row[] = [], error?: string) {
  return {
    from() {
      let filtered = [...rows];
      const q: Record<string, unknown> = {
        select()  { return q; },
        eq(col: string, val: unknown) { filtered = filtered.filter((r) => r[col] === val); return q; },
        neq(col: string, val: unknown) { filtered = filtered.filter((r) => r[col] !== val); return q; },
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

function makeRow(site: string, issueType: string, status = 'pending', updatedAt = '2026-03-10T00:00:00Z'): Row {
  return { site_id: site, issue_type: issueType, execution_status: status, updated_at: updatedAt };
}

describe('getTopIssues', () => {
  it('returns empty when no rows', async () => {
    const r = await getTopIssues({ site_id: 's1' }, makeDb([]));
    assert.deepStrictEqual(r, { issues: [] });
  });

  it('groups issues by type and counts correctly', async () => {
    const db = makeDb([
      makeRow('s1', 'title_missing'),
      makeRow('s1', 'title_missing'),
      makeRow('s1', 'meta_missing'),
    ]);
    const r = await getTopIssues({ site_id: 's1' }, db);
    const title = r.issues.find((i) => i.issue_type === 'title_missing');
    assert.equal(title?.count, 2);
  });

  it('sorts by count descending', async () => {
    const db = makeDb([
      makeRow('s1', 'meta_missing'),
      makeRow('s1', 'title_missing'),
      makeRow('s1', 'title_missing'),
      makeRow('s1', 'title_missing'),
    ]);
    const r = await getTopIssues({ site_id: 's1' }, db);
    assert.equal(r.issues[0]?.issue_type, 'title_missing');
  });

  it('respects limit', async () => {
    const db = makeDb([
      makeRow('s1', 'a'),
      makeRow('s1', 'b'),
      makeRow('s1', 'c'),
    ]);
    const r = await getTopIssues({ site_id: 's1', limit: 2 }, db);
    assert.ok(r.issues.length <= 2);
  });

  it('includes severity and last_seen in each issue', async () => {
    const db = makeDb([makeRow('s1', 'title_missing', 'pending', '2026-03-11T00:00:00Z')]);
    const r = await getTopIssues({ site_id: 's1' }, db);
    assert.ok(r.issues[0]?.severity !== undefined);
    assert.ok(r.issues[0]?.last_seen !== undefined);
  });

  it('title_missing gets critical severity', async () => {
    const db = makeDb([makeRow('s1', 'title_missing')]);
    const r = await getTopIssues({ site_id: 's1' }, db);
    assert.equal(r.issues[0]?.severity, 'critical');
  });

  it('never throws on DB error', async () => {
    await assert.doesNotReject(() => getTopIssues({ site_id: 's1' }, makeDb([], 'err')));
  });

  it('never throws when db throws', async () => {
    const bad = { from() { throw new Error('boom'); } };
    await assert.doesNotReject(() => getTopIssues({ site_id: 's1' }, bad));
  });
});
