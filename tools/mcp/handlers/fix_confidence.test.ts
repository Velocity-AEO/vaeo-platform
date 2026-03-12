/**
 * tools/mcp/handlers/fix_confidence.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getFixConfidence } from './fix_confidence.ts';

// ── Mock DB ───────────────────────────────────────────────────────────────────

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

function makeRow(status: 'approved' | 'rejected' | 'pending', siteId = 's1', issueType = 'title_missing'): Row {
  return {
    site_id:          siteId,
    issue_type:       issueType,
    approval_status:  status,
    before_value:     '60',
    after_value:      '80',
    applied_at:       '2026-03-10T10:00:00Z',
    created_at:       '2026-03-10T10:00:00Z',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getFixConfidence — empty / error', () => {
  it('returns zeros when no rows found', async () => {
    const r = await getFixConfidence({ site_id: 's1', issue_type: 'title_missing' }, makeDb([]));
    assert.equal(r.confidence, 0);
    assert.equal(r.sample_size, 0);
    assert.equal(r.avg_delta, 0);
    assert.equal(r.last_seen, null);
  });

  it('returns zeros when DB errors', async () => {
    const r = await getFixConfidence({ site_id: 's1', issue_type: 'title_missing' }, makeDb([], 'DB error'));
    assert.equal(r.confidence, 0);
    assert.equal(r.sample_size, 0);
  });

  it('never throws when db throws', async () => {
    const bad = { from() { throw new Error('boom'); } };
    await assert.doesNotReject(() => getFixConfidence({ site_id: 's1', issue_type: 't' }, bad));
  });
});

describe('getFixConfidence — confidence calculation', () => {
  it('confidence = 100 when all rows approved', async () => {
    const db = makeDb([makeRow('approved'), makeRow('approved'), makeRow('approved')]);
    const r = await getFixConfidence({ site_id: 's1', issue_type: 'title_missing' }, db);
    assert.equal(r.confidence, 100);
  });

  it('confidence = 0 when all rows rejected', async () => {
    const db = makeDb([makeRow('rejected'), makeRow('rejected')]);
    const r = await getFixConfidence({ site_id: 's1', issue_type: 'title_missing' }, db);
    assert.equal(r.confidence, 0);
  });

  it('confidence = 50 for 1 approved + 1 rejected', async () => {
    const db = makeDb([makeRow('approved'), makeRow('rejected')]);
    const r = await getFixConfidence({ site_id: 's1', issue_type: 'title_missing' }, db);
    assert.equal(r.confidence, 50);
  });

  it('pending rows do not count toward confidence denominator', async () => {
    const db = makeDb([makeRow('approved'), makeRow('pending')]);
    const r = await getFixConfidence({ site_id: 's1', issue_type: 'title_missing' }, db);
    // 1 approved / 1 decided = 100%
    assert.equal(r.confidence, 100);
    assert.equal(r.sample_size, 2);
  });
});

describe('getFixConfidence — sample_size and delta', () => {
  it('sample_size reflects total rows returned', async () => {
    const db = makeDb([makeRow('approved'), makeRow('approved'), makeRow('rejected')]);
    const r = await getFixConfidence({ site_id: 's1', issue_type: 'title_missing' }, db);
    assert.equal(r.sample_size, 3);
  });

  it('avg_delta is computed from before/after numeric values', async () => {
    // before=60, after=80 → delta=20 for each row
    const db = makeDb([makeRow('approved'), makeRow('approved')]);
    const r = await getFixConfidence({ site_id: 's1', issue_type: 'title_missing' }, db);
    assert.equal(r.avg_delta, 20);
  });

  it('avg_delta is 0 when no parseable values', async () => {
    const db = makeDb([{
      site_id: 's1', issue_type: 'title_missing',
      approval_status: 'approved', before_value: 'text', after_value: 'text',
    }]);
    const r = await getFixConfidence({ site_id: 's1', issue_type: 'title_missing' }, db);
    assert.equal(r.avg_delta, 0);
  });

  it('last_seen is applied_at from most recent row', async () => {
    const db = makeDb([{ ...makeRow('approved'), applied_at: '2026-03-11T09:00:00Z', created_at: '2026-03-01T00:00:00Z' }]);
    const r = await getFixConfidence({ site_id: 's1', issue_type: 'title_missing' }, db);
    assert.equal(r.last_seen, '2026-03-11T09:00:00Z');
  });
});
