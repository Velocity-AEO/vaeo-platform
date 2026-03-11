/**
 * app/api/learnings/handler.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLearnings,
  type LearningsDeps,
  type LearningRow,
  type LearningsQuery,
} from './handler.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ROWS: LearningRow[] = [
  { id: 'l1', issue_type: 'SCHEMA_MISSING', approval_status: 'pending' },
  { id: 'l2', issue_type: 'TITLE_MISSING',  approval_status: 'approved' },
];

function makeDeps(overrides: {
  rows?:     LearningRow[];
  throws?:   boolean;
  captured?: LearningsQuery[];
} = {}): LearningsDeps {
  const captured = overrides.captured ?? [];
  return {
    fetchLearnings: async (q) => {
      captured.push(q);
      if (overrides.throws) throw new Error('DB timeout');
      return overrides.rows ?? ROWS;
    },
  };
}

// ── getLearnings ──────────────────────────────────────────────────────────────

describe('getLearnings', () => {
  it('returns rows with default limit 100', async () => {
    const captured: LearningsQuery[] = [];
    const result = await getLearnings({}, makeDeps({ captured }));
    assert.equal(result.ok, true);
    assert.equal(result.data?.length, 2);
    assert.equal(captured[0]?.limit, 100);
  });

  it('passes site_id filter to fetchLearnings', async () => {
    const captured: LearningsQuery[] = [];
    await getLearnings({ site_id: 'site-1' }, makeDeps({ captured }));
    assert.equal(captured[0]?.site_id, 'site-1');
  });

  it('passes issue_type filter', async () => {
    const captured: LearningsQuery[] = [];
    await getLearnings({ issue_type: 'SCHEMA_MISSING' }, makeDeps({ captured }));
    assert.equal(captured[0]?.issue_type, 'SCHEMA_MISSING');
  });

  it('passes status filter', async () => {
    const captured: LearningsQuery[] = [];
    await getLearnings({ status: 'approved' }, makeDeps({ captured }));
    assert.equal(captured[0]?.status, 'approved');
  });

  it('passes custom limit', async () => {
    const captured: LearningsQuery[] = [];
    await getLearnings({ limit: 25 }, makeDeps({ captured }));
    assert.equal(captured[0]?.limit, 25);
  });

  it('returns 400 when limit is 0', async () => {
    const result = await getLearnings({ limit: 0 }, makeDeps());
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it('returns 400 when limit exceeds 1000', async () => {
    const result = await getLearnings({ limit: 1001 }, makeDeps());
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it('returns error when fetchLearnings throws', async () => {
    const result = await getLearnings({}, makeDeps({ throws: true }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('DB timeout'));
  });

  it('returns empty array when no rows', async () => {
    const result = await getLearnings({}, makeDeps({ rows: [] }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, []);
  });
});
