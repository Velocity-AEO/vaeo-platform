/**
 * tools/pipeline/suspension_store.test.ts
 *
 * Tests for suspension store.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  suspendSite,
  resumeSite,
  getActiveSuspensions,
  checkAndAutoResume,
} from './suspension_store.js';
import { buildSuspensionRecord } from './suspension_policy.js';

function makeRecord(overrides?: Record<string, unknown>) {
  return {
    ...buildSuspensionRecord('s1', 3, 'consecutive_failures', 'timeout'),
    ...overrides,
  };
}

// ── suspendSite ──────────────────────────────────────────────────────────────

describe('suspendSite', () => {
  it('writes correct fields', async () => {
    let written: Record<string, unknown> = {};
    const ok = await suspendSite(makeRecord(), {
      writeFn: async (_sid, fields) => { written = fields; return { ok: true }; },
    });
    assert.equal(ok, true);
    assert.equal(written.pipeline_suspended, true);
    assert.ok(written.pipeline_suspended_at);
    assert.ok(written.pipeline_resume_at);
    assert.equal(written.pipeline_suspension_reason, 'consecutive_failures');
    assert.equal(written.consecutive_failures, 3);
  });

  it('returns true on success', async () => {
    const ok = await suspendSite(makeRecord(), {
      writeFn: async () => ({ ok: true }),
    });
    assert.equal(ok, true);
  });

  it('returns false on write error', async () => {
    const ok = await suspendSite(makeRecord(), {
      writeFn: async () => { throw new Error('db down'); },
    });
    assert.equal(ok, false);
  });

  it('returns false when no writeFn', async () => {
    const ok = await suspendSite(makeRecord());
    assert.equal(ok, false);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => suspendSite(null as any, null as any));
  });
});

// ── resumeSite ───────────────────────────────────────────────────────────────

describe('resumeSite', () => {
  it('clears suspension fields', async () => {
    let written: Record<string, unknown> = {};
    await resumeSite('s1', {
      writeFn: async (_sid, fields) => { written = fields; return { ok: true }; },
    });
    assert.equal(written.pipeline_suspended, false);
    assert.equal(written.pipeline_suspended_at, null);
    assert.equal(written.pipeline_resume_at, null);
    assert.equal(written.pipeline_suspension_reason, null);
    assert.equal(written.consecutive_failures, 0);
  });

  it('returns true on success', async () => {
    const ok = await resumeSite('s1', {
      writeFn: async () => ({ ok: true }),
    });
    assert.equal(ok, true);
  });

  it('returns false when no writeFn', async () => {
    const ok = await resumeSite('s1');
    assert.equal(ok, false);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => resumeSite(null as any, null as any));
  });
});

// ── getActiveSuspensions ─────────────────────────────────────────────────────

describe('getActiveSuspensions', () => {
  it('returns empty on error', async () => {
    const result = await getActiveSuspensions('t1', {
      queryFn: async () => { throw new Error('db down'); },
    });
    assert.deepEqual(result, []);
  });

  it('returns records from query', async () => {
    const records = [makeRecord()];
    const result = await getActiveSuspensions('t1', {
      queryFn: async () => records,
    });
    assert.equal(result.length, 1);
  });

  it('returns empty when no queryFn', async () => {
    const result = await getActiveSuspensions('t1');
    assert.deepEqual(result, []);
  });

  it('all deps injectable', async () => {
    let called = false;
    await getActiveSuspensions('t1', {
      queryFn: async () => { called = true; return []; },
    });
    assert.equal(called, true);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => getActiveSuspensions(null as any, null as any));
  });
});

// ── checkAndAutoResume ───────────────────────────────────────────────────────

describe('checkAndAutoResume', () => {
  it('resumes expired suspensions', async () => {
    const resumed: string[] = [];
    const result = await checkAndAutoResume({
      queryFn: async () => [{
        site_id: 's1',
        resume_at: new Date(Date.now() - 1000).toISOString(),
      }],
      resumeFn: async (sid) => { resumed.push(sid); return true; },
    });
    assert.ok(result.resumed.includes('s1'));
    assert.ok(resumed.includes('s1'));
  });

  it('skips active suspensions', async () => {
    const result = await checkAndAutoResume({
      queryFn: async () => [{
        site_id: 's1',
        resume_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }],
      resumeFn: async () => true,
    });
    assert.deepEqual(result.resumed, []);
  });

  it('skips when no queryFn', async () => {
    const result = await checkAndAutoResume({});
    assert.deepEqual(result.resumed, []);
  });

  it('returns empty on error', async () => {
    const result = await checkAndAutoResume({
      queryFn: async () => { throw new Error('db down'); },
    });
    assert.deepEqual(result.resumed, []);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => checkAndAutoResume(null as any));
  });
});
