/**
 * app/api/approvals/handler.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getApprovals,
  approveItem,
  rejectItem,
  type ApprovalsDeps,
  type ApprovalRow,
} from './handler.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ITEM: ApprovalRow = {
  id:            'aq-1',
  status:        'pending',
  issue_type:    'SCHEMA_MISSING',
  url:           'https://example.com/p1',
  learning_id:   'learn-1',
};

function makeDeps(overrides: Partial<{
  rows:          ApprovalRow[];
  setStatusOk:   boolean;
  setStatusErr:  string;
  setLearningOk: boolean;
  capturedStatus: { id: string; status: string; note: string }[];
  capturedLearning: { id: string; updates: object }[];
}> = {}): ApprovalsDeps {
  const capturedStatus   = overrides.capturedStatus   ?? [];
  const capturedLearning = overrides.capturedLearning ?? [];
  return {
    getPending:  async () => overrides.rows ?? [ITEM],
    setStatus:   async (id, status, note) => {
      capturedStatus.push({ id, status, note });
      if (overrides.setStatusErr)  return { ok: false, error: overrides.setStatusErr };
      return { ok: overrides.setStatusOk ?? true };
    },
    setLearning: async (learningId, updates) => {
      capturedLearning.push({ id: learningId, updates });
      return { ok: overrides.setLearningOk ?? true };
    },
  };
}

// ── getApprovals ──────────────────────────────────────────────────────────────

describe('getApprovals', () => {
  it('returns pending items', async () => {
    const result = await getApprovals(makeDeps());
    assert.equal(result.ok, true);
    assert.equal(result.data?.length, 1);
    assert.equal(result.data?.[0]?.id, 'aq-1');
  });

  it('returns empty array when no items', async () => {
    const result = await getApprovals(makeDeps({ rows: [] }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, []);
  });

  it('returns error when getPending throws', async () => {
    const deps: ApprovalsDeps = {
      getPending:  async () => { throw new Error('DB down'); },
      setStatus:   async () => ({ ok: true }),
      setLearning: async () => ({ ok: true }),
    };
    const result = await getApprovals(deps);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('DB down'));
  });

  it('passes siteId filter to getPending', async () => {
    let capturedSiteId: string | undefined;
    const deps: ApprovalsDeps = {
      getPending:  async (s) => { capturedSiteId = s; return []; },
      setStatus:   async () => ({ ok: true }),
      setLearning: async () => ({ ok: true }),
    };
    await getApprovals(deps, 'site-42');
    assert.equal(capturedSiteId, 'site-42');
  });

  it('multiple items returned', async () => {
    const rows: ApprovalRow[] = [
      { id: 'a1', status: 'pending' },
      { id: 'a2', status: 'pending' },
      { id: 'a3', status: 'pending' },
    ];
    const result = await getApprovals(makeDeps({ rows }));
    assert.equal(result.data?.length, 3);
  });
});

// ── approveItem ───────────────────────────────────────────────────────────────

describe('approveItem', () => {
  it('happy path — calls setStatus + setLearning', async () => {
    const capturedStatus:   { id: string; status: string; note: string }[] = [];
    const capturedLearning: { id: string; updates: object }[] = [];
    const deps = makeDeps({ capturedStatus, capturedLearning });

    const result = await approveItem('aq-1', 'LGTM', 'user-1', 'learn-1', deps);

    assert.equal(result.ok, true);
    assert.equal(capturedStatus[0]?.status, 'approved');
    assert.equal(capturedStatus[0]?.note, 'LGTM');
    assert.equal(capturedLearning[0]?.id, 'learn-1');
  });

  it('returns 400 when id is empty', async () => {
    const result = await approveItem('', 'note', 'user', 'learn', makeDeps());
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it('skips setLearning when learningId is undefined', async () => {
    const capturedLearning: { id: string; updates: object }[] = [];
    const deps = makeDeps({ capturedLearning });
    await approveItem('aq-1', '', 'user', undefined, deps);
    assert.equal(capturedLearning.length, 0);
  });

  it('returns error when setStatus fails', async () => {
    const deps = makeDeps({ setStatusErr: 'constraint violation' });
    const result = await approveItem('aq-1', '', undefined, undefined, deps);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('constraint violation'));
  });

  it('never throws', async () => {
    const deps: ApprovalsDeps = {
      getPending:  async () => [],
      setStatus:   async () => { throw new Error('crash'); },
      setLearning: async () => ({ ok: true }),
    };
    const result = await approveItem('aq-1', '', undefined, undefined, deps);
    assert.equal(result.ok, false);
  });
});

// ── rejectItem ────────────────────────────────────────────────────────────────

describe('rejectItem', () => {
  it('happy path — calls setStatus with rejected', async () => {
    const capturedStatus: { id: string; status: string; note: string }[] = [];
    const deps = makeDeps({ capturedStatus });
    const result = await rejectItem('aq-1', 'bad fix', 'user-2', 'learn-1', deps);
    assert.equal(result.ok, true);
    assert.equal(capturedStatus[0]?.status, 'rejected');
    assert.equal(capturedStatus[0]?.note, 'bad fix');
  });

  it('returns 400 when id is empty', async () => {
    const result = await rejectItem('', 'note', 'user', 'learn', makeDeps());
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it('updates learning with rejected status', async () => {
    const capturedLearning: { id: string; updates: object }[] = [];
    const deps = makeDeps({ capturedLearning });
    await rejectItem('aq-1', 'wrong schema', 'user', 'learn-2', deps);
    assert.equal(capturedLearning[0]?.id, 'learn-2');
    assert.deepEqual((capturedLearning[0]?.updates as { approval_status: string }).approval_status, 'rejected');
  });

  it('skips setLearning when learningId is undefined', async () => {
    const capturedLearning: { id: string; updates: object }[] = [];
    const deps = makeDeps({ capturedLearning });
    await rejectItem('aq-1', '', 'user', undefined, deps);
    assert.equal(capturedLearning.length, 0);
  });

  it('never throws', async () => {
    const deps: ApprovalsDeps = {
      getPending:  async () => [],
      setStatus:   async () => { throw new Error('crash'); },
      setLearning: async () => ({ ok: true }),
    };
    const result = await rejectItem('aq-1', '', undefined, undefined, deps);
    assert.equal(result.ok, false);
  });
});
