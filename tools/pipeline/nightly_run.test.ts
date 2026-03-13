/**
 * tools/pipeline/nightly_run.test.ts
 *
 * Tests for nightly pipeline runner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runNightlyPipeline, type SiteRecord } from './nightly_run.js';

function makeSite(overrides?: Partial<SiteRecord>): SiteRecord {
  return {
    site_id: 's1',
    site_url: 'https://example.com',
    pipeline_suspended: false,
    pipeline_resume_at: null,
    consecutive_failures: 0,
    pipeline_suspension_reason: null,
    ...overrides,
  };
}

describe('runNightlyPipeline', () => {
  it('processes all non-suspended sites', async () => {
    let processed = 0;
    const result = await runNightlyPipeline({
      loadSitesFn: async () => [makeSite(), makeSite({ site_id: 's2' })],
      processSiteFn: async () => { processed++; return { ok: true }; },
      logFn: () => {},
    });
    assert.equal(result.processed, 2);
    assert.equal(result.succeeded, 2);
    assert.equal(processed, 2);
  });

  it('skips suspended sites', async () => {
    const result = await runNightlyPipeline({
      loadSitesFn: async () => [
        makeSite({ pipeline_suspended: true, pipeline_resume_at: new Date(Date.now() + 3600000).toISOString() }),
      ],
      processSiteFn: async () => ({ ok: true }),
      logFn: () => {},
    });
    assert.equal(result.suspended_skipped, 1);
    assert.equal(result.processed, 0);
  });

  it('records failures', async () => {
    let failureRecorded = false;
    const result = await runNightlyPipeline({
      loadSitesFn: async () => [makeSite()],
      processSiteFn: async () => ({ ok: false, error: 'timeout' }),
      failureDeps: {
        incrementFn: async () => { failureRecorded = true; return 1; },
      },
      logFn: () => {},
    });
    assert.equal(result.failed, 1);
    assert.equal(failureRecorded, true);
  });

  it('auto-resumes expired suspensions', async () => {
    const resumed: string[] = [];
    const result = await runNightlyPipeline({
      loadSitesFn: async () => [],
      autoResumeDeps: {
        queryFn: async () => [{
          site_id: 's1',
          resume_at: new Date(Date.now() - 1000).toISOString(),
        }],
        resumeFn: async (sid) => { resumed.push(sid); return true; },
      },
      logFn: () => {},
    });
    assert.ok(result.auto_resumed >= 1);
    assert.ok(resumed.includes('s1'));
  });

  it('returns empty result on error', async () => {
    const result = await runNightlyPipeline({
      loadSitesFn: async () => { throw new Error('db down'); },
      logFn: () => {},
    });
    assert.equal(result.total_sites, 0);
  });

  it('never throws on null deps', async () => {
    await assert.doesNotReject(() => runNightlyPipeline(null as any));
  });
});
