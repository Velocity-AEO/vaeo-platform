/**
 * tools/multisite/multisite_aggregator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySiteStatus,
  calculateAverageHealthScore,
  sortSnapshotsByPriority,
  buildMultisiteSummary,
  type SiteSnapshot,
} from './multisite_aggregator.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

function snap(overrides?: Partial<SiteSnapshot>): SiteSnapshot {
  return {
    site_id:           'site_1',
    domain:            'example.com',
    platform:          'shopify',
    health_score:      85,
    fixes_applied_7d:  3,
    fixes_failed_7d:   0,
    open_issues:       2,
    last_run_at:       NOW,
    gsc_connected:     true,
    sandbox_pass_rate: 100,
    plan:              'pro',
    status:            'healthy',
    ...overrides,
  };
}

// ── classifySiteStatus ────────────────────────────────────────────────────────

describe('classifySiteStatus', () => {
  it('returns no_data when last_run_at is null', () => {
    assert.equal(classifySiteStatus(90, 0, null), 'no_data');
  });

  it('returns no_data when last_run_at is empty string', () => {
    assert.equal(classifySiteStatus(90, 0, ''), 'no_data');
  });

  it('returns healthy when score>=80 and open_issues<=5', () => {
    assert.equal(classifySiteStatus(80, 5, NOW), 'healthy');
  });

  it('returns healthy for score 100 and 0 issues', () => {
    assert.equal(classifySiteStatus(100, 0, NOW), 'healthy');
  });

  it('returns needs_attention when score>=60 and open_issues>5', () => {
    assert.equal(classifySiteStatus(65, 10, NOW), 'needs_attention');
  });

  it('returns needs_attention when score<80 but open_issues<=15', () => {
    assert.equal(classifySiteStatus(50, 10, NOW), 'needs_attention');
  });

  it('returns critical when score<60 and open_issues>15', () => {
    assert.equal(classifySiteStatus(40, 20, NOW), 'critical');
  });

  it('returns critical when score is null and open_issues>15', () => {
    assert.equal(classifySiteStatus(null, 20, NOW), 'critical');
  });

  it('returns needs_attention when score is null but open_issues<=15', () => {
    assert.equal(classifySiteStatus(null, 15, NOW), 'needs_attention');
  });

  it('never throws', () => {
    assert.doesNotThrow(() => classifySiteStatus(undefined as never, undefined as never, undefined as never));
  });
});

// ── calculateAverageHealthScore ───────────────────────────────────────────────

describe('calculateAverageHealthScore', () => {
  it('averages valid scores', () => {
    const avg = calculateAverageHealthScore([snap({ health_score: 80 }), snap({ health_score: 60 })]);
    assert.equal(avg, 70);
  });

  it('excludes null scores', () => {
    const avg = calculateAverageHealthScore([
      snap({ health_score: 100 }),
      snap({ health_score: null }),
      snap({ health_score: 60 }),
    ]);
    assert.equal(avg, 80);
  });

  it('returns null for all-null scores', () => {
    const avg = calculateAverageHealthScore([snap({ health_score: null }), snap({ health_score: null })]);
    assert.equal(avg, null);
  });

  it('returns null for empty array', () => {
    assert.equal(calculateAverageHealthScore([]), null);
  });

  it('returns score rounded to integer', () => {
    const avg = calculateAverageHealthScore([snap({ health_score: 67 }), snap({ health_score: 68 })]);
    assert.equal(typeof avg, 'number');
    assert.ok(Number.isInteger(avg));
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => calculateAverageHealthScore(null as never));
  });
});

// ── sortSnapshotsByPriority ───────────────────────────────────────────────────

describe('sortSnapshotsByPriority', () => {
  it('places critical before needs_attention', () => {
    const sorted = sortSnapshotsByPriority([
      snap({ status: 'needs_attention', site_id: 'a' }),
      snap({ status: 'critical',        site_id: 'b' }),
    ]);
    assert.equal(sorted[0]!.status, 'critical');
  });

  it('places no_data last', () => {
    const sorted = sortSnapshotsByPriority([
      snap({ status: 'no_data',    site_id: 'a' }),
      snap({ status: 'critical',   site_id: 'b' }),
      snap({ status: 'healthy',    site_id: 'c' }),
    ]);
    assert.equal(sorted[sorted.length - 1]!.status, 'no_data');
  });

  it('places healthy before no_data', () => {
    const sorted = sortSnapshotsByPriority([
      snap({ status: 'no_data', site_id: 'a' }),
      snap({ status: 'healthy', site_id: 'b' }),
    ]);
    assert.equal(sorted[0]!.status, 'healthy');
  });

  it('sorts by open_issues descending within same status', () => {
    const sorted = sortSnapshotsByPriority([
      snap({ status: 'critical', open_issues: 5,  site_id: 'low' }),
      snap({ status: 'critical', open_issues: 20, site_id: 'high' }),
    ]);
    assert.equal(sorted[0]!.site_id, 'high');
  });

  it('does not mutate original array', () => {
    const original = [
      snap({ status: 'no_data', site_id: 'a' }),
      snap({ status: 'critical', site_id: 'b' }),
    ];
    sortSnapshotsByPriority(original);
    assert.equal(original[0]!.status, 'no_data');
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => sortSnapshotsByPriority(null as never));
  });
});

// ── buildMultisiteSummary ─────────────────────────────────────────────────────

describe('buildMultisiteSummary', () => {
  it('total_sites equals number of site_ids', async () => {
    const s = await buildMultisiteSummary('acc_1', ['s1', 's2'], {
      loadSnapshotFn: async (id) => snap({ site_id: id, status: 'healthy' }),
    });
    assert.equal(s.total_sites, 2);
  });

  it('counts healthy_sites correctly', async () => {
    const s = await buildMultisiteSummary('acc_1', ['s1', 's2', 's3'], {
      loadSnapshotFn: async (id) => snap({
        site_id: id,
        status: id === 's1' ? 'healthy' : 'critical',
      }),
    });
    assert.equal(s.healthy_sites, 1);
    assert.equal(s.critical_sites, 2);
  });

  it('total_fixes_applied_7d sums fixes', async () => {
    const s = await buildMultisiteSummary('acc_1', ['s1', 's2'], {
      loadSnapshotFn: async (id) => snap({ site_id: id, fixes_applied_7d: 5 }),
    });
    assert.equal(s.total_fixes_applied_7d, 10);
  });

  it('total_open_issues sums open_issues', async () => {
    const s = await buildMultisiteSummary('acc_1', ['s1', 's2'], {
      loadSnapshotFn: async (id) => snap({ site_id: id, open_issues: 3 }),
    });
    assert.equal(s.total_open_issues, 6);
  });

  it('snapshots are sorted by priority', async () => {
    const s = await buildMultisiteSummary('acc_1', ['s1', 's2'], {
      loadSnapshotFn: async (id) => snap({
        site_id: id,
        status:  id === 's1' ? 'healthy' : 'critical',
      }),
    });
    assert.equal(s.snapshots[0]!.status, 'critical');
  });

  it('account_id is preserved', async () => {
    const s = await buildMultisiteSummary('my_account', [], {});
    assert.equal(s.account_id, 'my_account');
  });

  it('returns empty summary on error', async () => {
    const s = await buildMultisiteSummary('acc_1', ['s1'], {
      loadSnapshotFn: async () => { throw new Error('db fail'); },
    });
    // Falls back to no_data snapshot from errorSnapshot
    assert.equal(s.total_sites, 1);
  });

  it('never throws when loadSnapshotFn throws', async () => {
    await assert.doesNotReject(() =>
      buildMultisiteSummary('acc_1', ['s1'], {
        loadSnapshotFn: async () => { throw new Error('X'); },
      }),
    );
  });
});
