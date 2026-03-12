import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgencyReport,
  getTopFixTypes,
  getAverageHealthScore,
  formatAgencyReport,
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
});
