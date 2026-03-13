import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgencyReport,
  getTopFixTypes,
  getAverageHealthScore,
  formatAgencyReport,
  loadAgencyDriftSummary,
  type AgencyClientHealth,
} from './agency_report.js';

// ── getTopFixTypes ────────────────────────────────────────────────────────────

describe('getTopFixTypes', () => {
  it('returns top 5 by count', () => {
    const fixes = [
      { fix_type: 'title' }, { fix_type: 'title' }, { fix_type: 'title' },
      { fix_type: 'meta' }, { fix_type: 'meta' },
      { fix_type: 'schema' },
      { fix_type: 'image' }, { fix_type: 'image' }, { fix_type: 'image' }, { fix_type: 'image' },
      { fix_type: 'canonical' },
      { fix_type: 'redirect' },
    ];
    const result = getTopFixTypes(fixes);
    assert.equal(result.length, 5);
    assert.equal(result[0].fix_type, 'image');
    assert.equal(result[0].count, 4);
  });

  it('handles fewer than 5 types', () => {
    const fixes = [{ fix_type: 'title' }, { fix_type: 'meta' }];
    const result = getTopFixTypes(fixes);
    assert.equal(result.length, 2);
  });

  it('returns empty for empty array', () => {
    assert.deepEqual(getTopFixTypes([]), []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getTopFixTypes(null as any));
  });
});

// ── getAverageHealthScore ─────────────────────────────────────────────────────

describe('getAverageHealthScore', () => {
  it('returns null for empty array', () => {
    assert.equal(getAverageHealthScore([]), null);
  });

  it('returns null for all null scores', () => {
    assert.equal(getAverageHealthScore([{ health_score: null }, { health_score: null }]), null);
  });

  it('calculates average correctly', () => {
    const result = getAverageHealthScore([
      { health_score: 80 },
      { health_score: 60 },
    ]);
    assert.equal(result, 70);
  });

  it('rounds to 1 decimal', () => {
    const result = getAverageHealthScore([
      { health_score: 80 },
      { health_score: 75 },
      { health_score: 72 },
    ]);
    assert.equal(result, 75.7);
  });

  it('ignores null scores', () => {
    const result = getAverageHealthScore([
      { health_score: 80 },
      { health_score: null },
      { health_score: 60 },
    ]);
    assert.equal(result, 70);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getAverageHealthScore(null as any));
  });
});

// ── buildAgencyReport ─────────────────────────────────────────────────────────

describe('buildAgencyReport', () => {
  const sites: AgencyClientHealth[] = [
    { site_id: 's1', domain: 'a.com', health_score: 80, fixes_applied: 5, improved: true, gsc_connected: true },
    { site_id: 's2', domain: 'b.com', health_score: 60, fixes_applied: 3, improved: false, gsc_connected: false },
  ];
  const fixes = [
    { fix_type: 'title', site_id: 's1', applied_at: '2026-03-01' },
    { fix_type: 'meta', site_id: 's1', applied_at: '2026-03-02' },
    { fix_type: 'title', site_id: 's2', applied_at: '2026-03-03' },
  ];

  it('calculates total_sites', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', sites, fixes);
    assert.equal(r.total_sites, 2);
  });

  it('calculates total_fixes_applied', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', sites, fixes);
    assert.equal(r.total_fixes_applied, 3);
  });

  it('calculates average_health_score', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', sites, fixes);
    assert.equal(r.average_health_score, 70);
  });

  it('calculates top_fix_types', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', sites, fixes);
    assert.equal(r.top_fix_types[0].fix_type, 'title');
    assert.equal(r.top_fix_types[0].count, 2);
  });

  it('calculates sites_improved', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', sites, fixes);
    assert.equal(r.sites_improved, 1);
  });

  it('calculates gsc_connected_count', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', sites, fixes);
    assert.equal(r.gsc_connected_count, 1);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildAgencyReport(null as any, null as any, null as any, null as any));
  });
});

// ── formatAgencyReport ────────────────────────────────────────────────────────

describe('formatAgencyReport', () => {
  it('returns non-empty string', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', [], []);
    const formatted = formatAgencyReport(r);
    assert.ok(formatted.length > 0);
  });

  it('includes agency_id', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', [], []);
    assert.ok(formatAgencyReport(r).includes('ag1'));
  });

  it('includes period', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', [], []);
    assert.ok(formatAgencyReport(r).includes('last_30_days'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatAgencyReport(null as any));
  });

  it('includes drift section when drift_summary present', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', [], []);
    r.drift_summary = {
      total_drift_events_7d: 5,
      sites_with_drift: 2,
      most_affected_site: 'site-3',
      most_common_cause: 'theme_update',
      fixes_requeued: 4,
    };
    const formatted = formatAgencyReport(r);
    assert.ok(formatted.includes('Drift Events This Period'));
    assert.ok(formatted.includes('5'));
    assert.ok(formatted.includes('theme_update'));
  });

  it('omits drift section when no drift events', () => {
    const r = buildAgencyReport('ag1', 'last_30_days', [], []);
    r.drift_summary = {
      total_drift_events_7d: 0,
      sites_with_drift: 0,
      most_affected_site: null,
      most_common_cause: null,
      fixes_requeued: 0,
    };
    const formatted = formatAgencyReport(r);
    assert.ok(!formatted.includes('Drift Events'));
  });
});

// ── loadAgencyDriftSummary ──────────────────────────────────────────────────

describe('loadAgencyDriftSummary', () => {
  it('returns empty summary with default deps', async () => {
    const s = await loadAgencyDriftSummary('ag1');
    assert.equal(s.total_drift_events_7d, 0);
  });

  it('calculates summary from events', async () => {
    const s = await loadAgencyDriftSummary('ag1', 7, {
      loadFn: async () => [
        { site_id: 's1', probable_cause: 'theme_update', requeued: true },
        { site_id: 's1', probable_cause: 'theme_update', requeued: true },
        { site_id: 's2', probable_cause: 'plugin_update', requeued: false },
      ],
    });
    assert.equal(s.total_drift_events_7d, 3);
    assert.equal(s.sites_with_drift, 2);
    assert.equal(s.most_affected_site, 's1');
    assert.equal(s.most_common_cause, 'theme_update');
    assert.equal(s.fixes_requeued, 2);
  });

  it('returns empty for missing agency_id', async () => {
    const s = await loadAgencyDriftSummary('');
    assert.equal(s.total_drift_events_7d, 0);
  });

  it('never throws on loadFn error', async () => {
    const s = await loadAgencyDriftSummary('ag1', 7, {
      loadFn: async () => { throw new Error('db down'); },
    });
    assert.equal(s.total_drift_events_7d, 0);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => loadAgencyDriftSummary(null as any));
  });
});
