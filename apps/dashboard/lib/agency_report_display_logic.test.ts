import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBarWidth,
  getPeriodLabel,
  getImprovementLabel,
  generateDownloadContent,
  getHealthScoreColor,
  getMaxFixCount,
} from './agency_report_display_logic.js';

// ── getBarWidth ──────────────────────────────────────────────────────────────

describe('getBarWidth', () => {
  it('returns percentage', () => {
    assert.equal(getBarWidth(50, 100), 50);
  });

  it('caps at 100', () => {
    assert.equal(getBarWidth(150, 100), 100);
  });

  it('returns 0 for zero max', () => {
    assert.equal(getBarWidth(50, 0), 0);
  });

  it('returns 0 for negative value', () => {
    assert.equal(getBarWidth(-10, 100), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getBarWidth(null as any, null as any));
  });
});

// ── getPeriodLabel ───────────────────────────────────────────────────────────

describe('getPeriodLabel', () => {
  it('returns Last 7 Days', () => {
    assert.equal(getPeriodLabel('last_7_days'), 'Last 7 Days');
  });

  it('returns Last 30 Days', () => {
    assert.equal(getPeriodLabel('last_30_days'), 'Last 30 Days');
  });

  it('returns Last 90 Days', () => {
    assert.equal(getPeriodLabel('last_90_days'), 'Last 90 Days');
  });

  it('returns raw string for unknown', () => {
    assert.equal(getPeriodLabel('custom'), 'custom');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getPeriodLabel(null as any));
  });
});

// ── getImprovementLabel ──────────────────────────────────────────────────────

describe('getImprovementLabel', () => {
  it('returns no sites for zero total', () => {
    assert.equal(getImprovementLabel(0, 0, 0), 'No sites');
  });

  it('returns all improved', () => {
    assert.equal(getImprovementLabel(5, 0, 5), 'All sites improved');
  });

  it('returns partial improvement with no decline', () => {
    assert.equal(getImprovementLabel(3, 0, 5), '3 of 5 sites improved');
  });

  it('returns improved and declined', () => {
    assert.equal(getImprovementLabel(3, 2, 5), '3 improved, 2 declined');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getImprovementLabel(null as any, null as any, null as any));
  });
});

// ── generateDownloadContent ──────────────────────────────────────────────────

describe('generateDownloadContent', () => {
  const report = {
    agency_id: 'ag1',
    period: 'last_30_days',
    generated_at: '2026-03-01T00:00:00Z',
    total_sites: 5,
    total_fixes_applied: 20,
    total_issues_resolved: 18,
    average_health_score: 75.5,
    top_fix_types: [{ fix_type: 'title', count: 8 }],
    sites_improved: 4,
    sites_declined: 1,
    gsc_connected_count: 3,
  };

  it('includes agency_id', () => {
    assert.ok(generateDownloadContent(report).includes('ag1'));
  });

  it('includes period label', () => {
    assert.ok(generateDownloadContent(report).includes('Last 30 Days'));
  });

  it('includes fix types', () => {
    assert.ok(generateDownloadContent(report).includes('title: 8'));
  });

  it('returns empty for null', () => {
    assert.equal(generateDownloadContent(null as any), '');
  });
});

// ── getHealthScoreColor ──────────────────────────────────────────────────────

describe('getHealthScoreColor', () => {
  it('returns green for >= 80', () => {
    assert.equal(getHealthScoreColor(85), 'text-green-600');
  });

  it('returns yellow for >= 60', () => {
    assert.equal(getHealthScoreColor(65), 'text-yellow-600');
  });

  it('returns red for < 60', () => {
    assert.equal(getHealthScoreColor(40), 'text-red-600');
  });

  it('returns gray for null', () => {
    assert.equal(getHealthScoreColor(null), 'text-gray-400');
  });
});

// ── getMaxFixCount ───────────────────────────────────────────────────────────

describe('getMaxFixCount', () => {
  it('returns max count', () => {
    assert.equal(getMaxFixCount([{ fix_type: 'a', count: 3 }, { fix_type: 'b', count: 7 }]), 7);
  });

  it('returns 0 for empty', () => {
    assert.equal(getMaxFixCount([]), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getMaxFixCount(null as any));
  });
});
