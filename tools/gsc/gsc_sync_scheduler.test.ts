/**
 * tools/gsc/gsc_sync_scheduler.test.ts
 *
 * Tests for GSC sync scheduler.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSyncJob,
  isDueSoon,
  getOverdueJobs,
  runSyncForSite,
  runOverdueSyncs,
  type GSCSyncJob,
} from './gsc_sync_scheduler.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function futureJob(hours = 24): GSCSyncJob {
  const next = new Date();
  next.setHours(next.getHours() + hours);
  return {
    job_id: 'gsc_sync_1',
    site_id: 'site_1',
    account_id: 'acct_1',
    last_synced_at: null,
    next_sync_at: next.toISOString(),
    sync_frequency_hours: 24,
    enabled: true,
  };
}

function overdueJob(site_id = 'site_1'): GSCSyncJob {
  const past = new Date();
  past.setHours(past.getHours() - 2);
  return {
    job_id: 'gsc_sync_2',
    site_id,
    account_id: 'acct_1',
    last_synced_at: null,
    next_sync_at: past.toISOString(),
    sync_frequency_hours: 24,
    enabled: true,
  };
}

function disabledOverdueJob(): GSCSyncJob {
  return { ...overdueJob(), enabled: false };
}

// ── buildSyncJob ─────────────────────────────────────────────────────────────

describe('buildSyncJob', () => {
  it('sets site_id and account_id', () => {
    const job = buildSyncJob('site_1', 'acct_1');
    assert.equal(job.site_id, 'site_1');
    assert.equal(job.account_id, 'acct_1');
  });

  it('defaults frequency to 24 hours', () => {
    const job = buildSyncJob('site_1', 'acct_1');
    assert.equal(job.sync_frequency_hours, 24);
  });

  it('respects custom frequency', () => {
    const job = buildSyncJob('site_1', 'acct_1', 12);
    assert.equal(job.sync_frequency_hours, 12);
  });

  it('sets next_sync_at in the future', () => {
    const job = buildSyncJob('site_1', 'acct_1');
    const nextAt = new Date(job.next_sync_at).getTime();
    assert.ok(nextAt > Date.now());
  });

  it('sets last_synced_at to null', () => {
    const job = buildSyncJob('site_1', 'acct_1');
    assert.equal(job.last_synced_at, null);
  });

  it('sets enabled to true', () => {
    const job = buildSyncJob('site_1', 'acct_1');
    assert.equal(job.enabled, true);
  });

  it('generates a job_id with prefix', () => {
    const job = buildSyncJob('site_1', 'acct_1');
    assert.ok(job.job_id.startsWith('gsc_sync_'));
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => buildSyncJob(null as any, null as any));
  });
});

// ── isDueSoon ────────────────────────────────────────────────────────────────

describe('isDueSoon', () => {
  it('returns true for overdue job with any window', () => {
    assert.equal(isDueSoon(overdueJob(), 0), true);
  });

  it('returns false for far future job', () => {
    assert.equal(isDueSoon(futureJob(48), 30), false);
  });

  it('returns true when within window', () => {
    const job = futureJob(0); // next_sync_at is now + 0 hours
    const soon = new Date();
    soon.setMinutes(soon.getMinutes() + 10);
    job.next_sync_at = soon.toISOString();
    assert.equal(isDueSoon(job, 15), true);
  });

  it('returns false when outside window', () => {
    const job = futureJob(0);
    const later = new Date();
    later.setMinutes(later.getMinutes() + 30);
    job.next_sync_at = later.toISOString();
    assert.equal(isDueSoon(job, 10), false);
  });

  it('never throws on null job', () => {
    assert.doesNotThrow(() => isDueSoon(null as any, 10));
  });
});

// ── getOverdueJobs ───────────────────────────────────────────────────────────

describe('getOverdueJobs', () => {
  it('returns only overdue enabled jobs', () => {
    const jobs = [futureJob(), overdueJob()];
    const overdue = getOverdueJobs(jobs);
    assert.equal(overdue.length, 1);
    assert.equal(overdue[0].site_id, 'site_1');
  });

  it('skips disabled jobs', () => {
    const jobs = [disabledOverdueJob()];
    const overdue = getOverdueJobs(jobs);
    assert.equal(overdue.length, 0);
  });

  it('returns empty for all future jobs', () => {
    const jobs = [futureJob(), futureJob(48)];
    assert.equal(getOverdueJobs(jobs).length, 0);
  });

  it('returns empty for empty array', () => {
    assert.deepEqual(getOverdueJobs([]), []);
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => getOverdueJobs(null as any));
  });
});

// ── runSyncForSite ───────────────────────────────────────────────────────────

describe('runSyncForSite', () => {
  it('calls fetchRankingsFn', async () => {
    let called = false;
    await runSyncForSite('site_1', {
      fetchRankingsFn: async () => { called = true; return []; },
    });
    assert.equal(called, true);
  });

  it('calls saveRankingsFn with results', async () => {
    let savedCount = 0;
    await runSyncForSite('site_1', {
      fetchRankingsFn: async () => [
        { keyword: 'seo', position: 3 },
        { keyword: 'tools', position: 5 },
      ],
      saveRankingsFn: async (_sid, rankings) => { savedCount = rankings.length; },
    });
    assert.equal(savedCount, 2);
  });

  it('calls updateJobFn with timestamps', async () => {
    let lastSynced = '';
    await runSyncForSite('site_1', {
      fetchRankingsFn: async () => [],
      updateJobFn: async (_sid, last) => { lastSynced = last; },
    });
    assert.ok(lastSynced.includes('T'));
  });

  it('returns success with ranking_count', async () => {
    const result = await runSyncForSite('site_1', {
      fetchRankingsFn: async () => [{ keyword: 'seo', position: 3 }],
    });
    assert.equal(result.success, true);
    assert.equal(result.ranking_count, 1);
  });

  it('returns failure when fetchRankingsFn throws', async () => {
    const result = await runSyncForSite('site_1', {
      fetchRankingsFn: async () => { throw new Error('fetch fail'); },
    });
    assert.equal(result.success, false);
    assert.equal(result.ranking_count, 0);
  });

  it('returns error message on failure', async () => {
    const result = await runSyncForSite('site_1', {
      fetchRankingsFn: async () => { throw new Error('custom error'); },
    });
    assert.equal(result.error, 'custom error');
  });

  it('never throws on null site_id', async () => {
    await assert.doesNotReject(() => runSyncForSite(null as any));
  });
});

// ── runOverdueSyncs ──────────────────────────────────────────────────────────

describe('runOverdueSyncs', () => {
  it('processes all overdue jobs', async () => {
    const synced: string[] = [];
    const result = await runOverdueSyncs({
      loadJobsFn: async () => [overdueJob('site_1'), overdueJob('site_2')],
      runSyncFn: async (sid) => {
        synced.push(sid);
        return { success: true, ranking_count: 5 };
      },
    });
    assert.equal(result.length, 2);
    assert.ok(synced.includes('site_1'));
    assert.ok(synced.includes('site_2'));
  });

  it('skips non-overdue jobs', async () => {
    const result = await runOverdueSyncs({
      loadJobsFn: async () => [futureJob()],
      runSyncFn: async () => ({ success: true, ranking_count: 0 }),
    });
    assert.equal(result.length, 0);
  });

  it('handles individual sync failure gracefully', async () => {
    const result = await runOverdueSyncs({
      loadJobsFn: async () => [overdueJob('site_1')],
      runSyncFn: async () => { throw new Error('sync boom'); },
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].success, false);
  });

  it('returns empty when loadJobsFn throws', async () => {
    const result = await runOverdueSyncs({
      loadJobsFn: async () => { throw new Error('db fail'); },
    });
    assert.deepEqual(result, []);
  });

  it('returns empty with default deps', async () => {
    const result = await runOverdueSyncs();
    assert.deepEqual(result, []);
  });

  it('never throws on null deps', async () => {
    await assert.doesNotReject(() => runOverdueSyncs(null as any));
  });
});
