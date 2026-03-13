/**
 * tools/gsc/gsc_tag_cleanup.test.ts
 *
 * Tests for GSC verification tag cleanup job.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findOrphanedVerificationTags,
  removeOrphanedTag,
  runTagCleanupJob,
  type OrphanedTagRecord,
} from './gsc_tag_cleanup.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function hoursAgo(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function makeSite(site_id: string, domain: string, injected: boolean, status: string, injectedHoursAgo: number) {
  return {
    site_id,
    domain,
    gsc_verification_tag_injected: injected,
    verification_status: status,
    tag_injected_at: hoursAgo(injectedHoursAgo),
  };
}

// ── findOrphanedVerificationTags ─────────────────────────────────────────────

describe('findOrphanedVerificationTags', () => {
  it('finds tags older than max_age_hours', async () => {
    const sites = [makeSite('s1', 'a.com', true, 'pending', 48)];
    const result = await findOrphanedVerificationTags(24, { loadSitesFn: async () => sites });
    assert.equal(result.length, 1);
    assert.equal(result[0].site_id, 's1');
  });

  it('excludes tags newer than max_age_hours', async () => {
    const sites = [makeSite('s1', 'a.com', true, 'pending', 6)];
    const result = await findOrphanedVerificationTags(24, { loadSitesFn: async () => sites });
    assert.equal(result.length, 0);
  });

  it('excludes verified sites', async () => {
    const sites = [makeSite('s1', 'a.com', true, 'verified', 48)];
    const result = await findOrphanedVerificationTags(24, { loadSitesFn: async () => sites });
    assert.equal(result.length, 0);
  });

  it('excludes sites without tag injected', async () => {
    const sites = [makeSite('s1', 'a.com', false, 'pending', 48)];
    const result = await findOrphanedVerificationTags(24, { loadSitesFn: async () => sites });
    assert.equal(result.length, 0);
  });

  it('respects max_age_hours parameter', async () => {
    const sites = [makeSite('s1', 'a.com', true, 'pending', 10)];
    const result8 = await findOrphanedVerificationTags(8, { loadSitesFn: async () => sites });
    const result12 = await findOrphanedVerificationTags(12, { loadSitesFn: async () => sites });
    assert.equal(result8.length, 1);
    assert.equal(result12.length, 0);
  });

  it('calculates hours_since_injection', async () => {
    const sites = [makeSite('s1', 'a.com', true, 'pending', 48)];
    const result = await findOrphanedVerificationTags(24, { loadSitesFn: async () => sites });
    assert.ok(result[0].hours_since_injection >= 47);
  });

  it('returns [] on error', async () => {
    const result = await findOrphanedVerificationTags(24, {
      loadSitesFn: async () => { throw new Error('db error'); },
    });
    assert.deepEqual(result, []);
  });

  it('returns [] with no deps', async () => {
    const result = await findOrphanedVerificationTags(24);
    assert.deepEqual(result, []);
  });
});

// ── removeOrphanedTag ────────────────────────────────────────────────────────

describe('removeOrphanedTag', () => {
  it('returns true when removal succeeds', async () => {
    const result = await removeOrphanedTag('s1', 'a.com', {
      removeFn: async () => true,
    });
    assert.equal(result, true);
  });

  it('returns false on error', async () => {
    const result = await removeOrphanedTag('s1', 'a.com', {
      removeFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result, false);
  });

  it('returns false with no deps', async () => {
    const result = await removeOrphanedTag('s1', 'a.com');
    assert.equal(result, false);
  });
});

// ── runTagCleanupJob ─────────────────────────────────────────────────────────

describe('runTagCleanupJob', () => {
  const orphans: OrphanedTagRecord[] = [
    { site_id: 's1', domain: 'a.com', tag_injected_at: hoursAgo(48), verification_status: 'pending', hours_since_injection: 48 },
    { site_id: 's2', domain: 'b.com', tag_injected_at: hoursAgo(72), verification_status: 'failed', hours_since_injection: 72 },
  ];

  it('calls removal for each orphan', async () => {
    const removed: string[] = [];
    await runTagCleanupJob(24, {
      findFn: async () => orphans,
      removeFn: async (_sid, domain) => { removed.push(domain); return true; },
    });
    assert.deepEqual(removed, ['a.com', 'b.com']);
  });

  it('counts cleaned correctly', async () => {
    const result = await runTagCleanupJob(24, {
      findFn: async () => orphans,
      removeFn: async () => true,
    });
    assert.equal(result.cleaned, 2);
    assert.equal(result.failed, 0);
  });

  it('counts failed correctly', async () => {
    const result = await runTagCleanupJob(24, {
      findFn: async () => orphans,
      removeFn: async () => false,
    });
    assert.equal(result.cleaned, 0);
    assert.equal(result.failed, 2);
  });

  it('returns records list', async () => {
    const result = await runTagCleanupJob(24, {
      findFn: async () => orphans,
      removeFn: async () => true,
    });
    assert.equal(result.records.length, 2);
  });

  it('handles zero orphans', async () => {
    const result = await runTagCleanupJob(24, {
      findFn: async () => [],
      removeFn: async () => true,
    });
    assert.equal(result.cleaned, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.records.length, 0);
  });

  it('never throws when removeFn throws', async () => {
    await assert.doesNotReject(() =>
      runTagCleanupJob(24, {
        findFn: async () => orphans,
        removeFn: async () => { throw new Error('fail'); },
      }),
    );
  });

  it('calls logFn with success messages', async () => {
    const logs: string[] = [];
    await runTagCleanupJob(24, {
      findFn: async () => [orphans[0]],
      removeFn: async () => true,
      logFn: (msg) => logs.push(msg),
    });
    assert.ok(logs[0].includes('✓'));
    assert.ok(logs[0].includes('a.com'));
  });

  it('calls logFn with failure messages', async () => {
    const logs: string[] = [];
    await runTagCleanupJob(24, {
      findFn: async () => [orphans[0]],
      removeFn: async () => false,
      logFn: (msg) => logs.push(msg),
    });
    assert.ok(logs[0].includes('✗'));
  });

  it('all deps are injectable', async () => {
    const result = await runTagCleanupJob(24, {
      findFn: async () => [],
      removeFn: async () => true,
      logFn: () => {},
    });
    assert.equal(result.cleaned, 0);
  });

  it('defaults max_age_hours to 24', async () => {
    let receivedAge = 0;
    await runTagCleanupJob(undefined, {
      findFn: async (h) => { receivedAge = h; return []; },
    });
    assert.equal(receivedAge, 24);
  });
});
