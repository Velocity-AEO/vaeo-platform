import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  triggerGraphRebuild,
  validateRebuildRequest,
} from './admin_graph_rebuild.js';

// ── triggerGraphRebuild ─────────────────────────────────────────────────────

describe('triggerGraphRebuild', () => {
  it('queues single site', async () => {
    const result = await triggerGraphRebuild(
      { scope: 'single', site_id: 's1', reason: 'test', requested_by: 'admin' },
      { queueBuildFn: async () => true },
    );
    assert.equal(result.success, true);
    assert.equal(result.queued_count, 1);
    assert.deepEqual(result.queued_sites, ['s1']);
  });

  it('queues stale sites', async () => {
    const result = await triggerGraphRebuild(
      { scope: 'stale', reason: 'test', requested_by: 'admin' },
      {
        getStaleSiteIdsFn: async () => ['s1', 's2'],
        queueBuildFn: async () => true,
      },
    );
    assert.equal(result.queued_count, 2);
  });

  it('queues all sites', async () => {
    const result = await triggerGraphRebuild(
      { scope: 'all', reason: 'test', requested_by: 'admin' },
      {
        getAllSiteIdsFn: async () => ['s1', 's2', 's3'],
        queueBuildFn: async () => true,
      },
    );
    assert.equal(result.queued_count, 3);
  });

  it('fails on missing scope', async () => {
    const result = await triggerGraphRebuild({ scope: '' as any, reason: 'test', requested_by: 'admin' });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('scope'));
  });

  it('fails on missing reason', async () => {
    const result = await triggerGraphRebuild({ scope: 'all', reason: '', requested_by: 'admin' });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('reason'));
  });

  it('fails on single scope without site_id', async () => {
    const result = await triggerGraphRebuild({ scope: 'single', reason: 'test', requested_by: 'admin' });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('site_id'));
  });

  it('returns success with 0 queued when no sites', async () => {
    const result = await triggerGraphRebuild(
      { scope: 'stale', reason: 'test', requested_by: 'admin' },
      { getStaleSiteIdsFn: async () => [] },
    );
    assert.equal(result.success, true);
    assert.equal(result.queued_count, 0);
  });

  it('skips failed queue calls', async () => {
    let callCount = 0;
    const result = await triggerGraphRebuild(
      { scope: 'all', reason: 'test', requested_by: 'admin' },
      {
        getAllSiteIdsFn: async () => ['s1', 's2'],
        queueBuildFn: async () => { callCount++; if (callCount === 1) throw new Error('fail'); return true; },
      },
    );
    assert.equal(result.queued_count, 1);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => triggerGraphRebuild(null as any, null as any));
  });
});

// ── validateRebuildRequest ──────────────────────────────────────────────────

describe('validateRebuildRequest', () => {
  it('validates valid all request', () => {
    const r = validateRebuildRequest({ scope: 'all', reason: 'test' });
    assert.equal(r.valid, true);
    assert.equal(r.request?.scope, 'all');
  });

  it('validates valid single request', () => {
    const r = validateRebuildRequest({ scope: 'single', site_id: 's1', reason: 'test' });
    assert.equal(r.valid, true);
  });

  it('rejects invalid scope', () => {
    const r = validateRebuildRequest({ scope: 'bogus' });
    assert.equal(r.valid, false);
  });

  it('rejects single without site_id', () => {
    const r = validateRebuildRequest({ scope: 'single', reason: 'test' });
    assert.equal(r.valid, false);
  });

  it('rejects null body', () => {
    const r = validateRebuildRequest(null);
    assert.equal(r.valid, false);
  });

  it('defaults reason to manual rebuild', () => {
    const r = validateRebuildRequest({ scope: 'all' });
    assert.equal(r.request?.reason, 'manual rebuild');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => validateRebuildRequest(null as any));
  });
});
