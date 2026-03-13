/**
 * tools/pipeline/suspension_store.test.ts
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecord(site_id = 'site_1', failures = 3) {
  return buildSuspensionRecord(site_id, failures, 'consecutive_failures', 'test error');
}

// ── suspendSite ───────────────────────────────────────────────────────────────

describe('suspendSite', () => {
  it('calls writeFn with correct fields', async () => {
    let written: Record<string, unknown> = {};
    const record = makeRecord();
    await suspendSite(record, {
      writeFn: async (_id, fields) => { written = fields; return { ok: true }; },
    });
    assert.equal(written['pipeline_suspended'], true);
    assert.equal(written['pipeline_suspension_reason'], 'consecutive_failures');
    assert.equal(written['consecutive_failures'], 3);
    assert.ok(written['pipeline_suspended_at']);
    assert.ok(written['pipeline_resume_at']);
  });

  it('calls writeFn with correct site_id', async () => {
    let writtenId = '';
    const record = makeRecord('site_abc', 3);
    await suspendSite(record, {
      writeFn: async (id, _f) => { writtenId = id; return { ok: true }; },
    });
    assert.equal(writtenId, 'site_abc');
  });

  it('returns true on success', async () => {
    const r = await suspendSite(makeRecord(), {
      writeFn: async () => ({ ok: true }),
    });
    assert.equal(r, true);
  });

  it('returns false when writeFn returns ok:false', async () => {
    const r = await suspendSite(makeRecord(), {
      writeFn: async () => ({ ok: false, error: 'db fail' }),
    });
    assert.equal(r, false);
  });

  it('returns false when writeFn throws', async () => {
    const r = await suspendSite(makeRecord(), {
      writeFn: async () => { throw new Error('boom'); },
    });
    assert.equal(r, false);
  });

  it('returns false when no deps provided', async () => {
    const r = await suspendSite(makeRecord());
    assert.equal(r, false);
  });

  it('never throws on null record', async () => {
    await assert.doesNotReject(() => suspendSite(null as any));
  });
});

// ── resumeSite ────────────────────────────────────────────────────────────────

describe('resumeSite', () => {
  it('calls writeFn with pipeline_suspended=false', async () => {
    let written: Record<string, unknown> = {};
    await resumeSite('site_1', {
      writeFn: async (_id, fields) => { written = fields; return { ok: true }; },
    });
    assert.equal(written['pipeline_suspended'], false);
    assert.equal(written['consecutive_failures'], 0);
    assert.equal(written['pipeline_resume_at'], null);
    assert.equal(written['pipeline_suspended_at'], null);
    assert.equal(written['pipeline_suspension_reason'], null);
  });

  it('returns true on success', async () => {
    const r = await resumeSite('s1', { writeFn: async () => ({ ok: true }) });
    assert.equal(r, true);
  });

  it('returns false when writeFn throws', async () => {
    const r = await resumeSite('s1', {
      writeFn: async () => { throw new Error('fail'); },
    });
    assert.equal(r, false);
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => resumeSite(null as any));
  });
});

// ── getActiveSuspensions ──────────────────────────────────────────────────────

describe('getActiveSuspensions', () => {
  it('returns records from queryFn', async () => {
    const records = [makeRecord('s1'), makeRecord('s2')];
    const result = await getActiveSuspensions('tenant_1', {
      queryFn: async () => records,
    });
    assert.equal(result.length, 2);
  });

  it('returns empty array on error', async () => {
    const result = await getActiveSuspensions('tenant_1', {
      queryFn: async () => { throw new Error('db'); },
    });
    assert.deepEqual(result, []);
  });

  it('returns empty array when no deps', async () => {
    const result = await getActiveSuspensions('tenant_1');
    assert.deepEqual(result, []);
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => getActiveSuspensions(null as any));
  });
});

// ── checkAndAutoResume ────────────────────────────────────────────────────────

describe('checkAndAutoResume', () => {
  it('resumes sites where resume_at is in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    let resumedId = '';
    const result = await checkAndAutoResume({
      queryFn:  async () => [{ site_id: 's1', resume_at: past }],
      resumeFn: async (id) => { resumedId = id; return true; },
    });
    assert.ok(result.resumed.includes('s1'));
    assert.equal(resumedId, 's1');
  });

  it('skips sites where resume_at is in the future', async () => {
    const future = new Date(Date.now() + 100_000).toISOString();
    const result = await checkAndAutoResume({
      queryFn:  async () => [{ site_id: 's1', resume_at: future }],
      resumeFn: async () => true,
    });
    assert.equal(result.resumed.length, 0);
  });

  it('returns empty when no queryFn', async () => {
    const result = await checkAndAutoResume({});
    assert.deepEqual(result.resumed, []);
  });

  it('returns empty when queryFn throws', async () => {
    const result = await checkAndAutoResume({
      queryFn: async () => { throw new Error('db'); },
    });
    assert.deepEqual(result.resumed, []);
  });

  it('resumes multiple expired sites', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const result = await checkAndAutoResume({
      queryFn:  async () => [
        { site_id: 's1', resume_at: past },
        { site_id: 's2', resume_at: past },
      ],
      resumeFn: async () => true,
    });
    assert.equal(result.resumed.length, 2);
  });

  it('all deps injectable', async () => {
    let qCalled = false;
    let rCalled = false;
    const past = new Date(Date.now() - 1000).toISOString();
    await checkAndAutoResume({
      queryFn:  async () => { qCalled = true; return [{ site_id: 's1', resume_at: past }]; },
      resumeFn: async () => { rCalled = true; return true; },
    });
    assert.equal(qCalled, true);
    assert.equal(rCalled, true);
  });

  it('never throws on null deps', async () => {
    await assert.doesNotReject(() => checkAndAutoResume(null as any));
  });
});
