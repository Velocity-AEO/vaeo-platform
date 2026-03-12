/**
 * tools/apps/environment_diff_report.test.ts
 *
 * Tests for environment diff report builder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnvironmentDiffReport } from './environment_diff_report.js';
import { scanEnvironment } from './environment_scanner.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function htmlWith(...snippets: string[]): string {
  return `<html><head>${snippets.join('\n')}</head><body></body></html>`;
}

const KLAVIYO   = '<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>';
const INTERCOM  = '<script src="https://widget.intercom.io/widget/abc"></script><div id="intercom-container"></div>';
const HEXTOM    = '<script src="https://cdn.hextom.com/free-shipping-bar/v2.js"></script><div class="hextom-fsb"></div>';
const HOTJAR    = '<script src="https://static.hotjar.com/c/hotjar-123.js"></script>';
const INSTAFEED = '<script src="https://instafeed.net/js/instafeed.min.js"></script>';
const AFTERPAY  = '<script src="https://js.afterpay.com/afterpay-1.x.js"></script><div class="afterpay-placement"></div>';

function makeScan(snippets: string[]) {
  return scanEnvironment('s1', '/', htmlWith(...snippets));
}

// ── Basic report ─────────────────────────────────────────────────────────────

describe('buildEnvironmentDiffReport — basic', () => {
  it('sets site_id and generated_at', () => {
    const report = buildEnvironmentDiffReport(makeScan([KLAVIYO]));
    assert.equal(report.site_id, 's1');
    assert.ok(report.generated_at.match(/^\d{4}-\d{2}-\d{2}T/));
  });

  it('includes detected apps', () => {
    const report = buildEnvironmentDiffReport(makeScan([KLAVIYO, INTERCOM]));
    assert.ok(report.detected_apps.length >= 2);
  });

  it('calculates total monthly spend', () => {
    const report = buildEnvironmentDiffReport(makeScan([INTERCOM, HOTJAR]));
    assert.ok(report.total_monthly_spend > 0);
  });
});

// ── Performance cost ─────────────────────────────────────────────────────────

describe('buildEnvironmentDiffReport — performance', () => {
  it('calculates performance cost in ms', () => {
    const report = buildEnvironmentDiffReport(makeScan([INTERCOM, HOTJAR]));
    // Intercom=critical(500) + Hotjar=critical(500) = 1000+
    assert.ok(report.performance_cost_ms >= 1000);
  });

  it('includes low-impact apps in cost', () => {
    const report = buildEnvironmentDiffReport(makeScan([AFTERPAY]));
    assert.ok(report.performance_cost_ms >= 10);
  });
});

// ── Top offenders ────────────────────────────────────────────────────────────

describe('buildEnvironmentDiffReport — top offenders', () => {
  it('returns top 5 offenders sorted by impact', () => {
    const report = buildEnvironmentDiffReport(makeScan([INTERCOM, HOTJAR, HEXTOM, KLAVIYO, INSTAFEED]));
    assert.ok(report.top_offenders.length <= 5);
    // First should be critical
    assert.equal(report.top_offenders[0]!.impact, 'critical');
  });

  it('includes replaceability flag', () => {
    const report = buildEnvironmentDiffReport(makeScan([HEXTOM]));
    const hextom = report.top_offenders.find((o) => o.app_name.includes('Hextom'));
    assert.ok(hextom);
    assert.equal(hextom.replaceable, true);
  });
});

// ── Action items ─────────────────────────────────────────────────────────────

describe('buildEnvironmentDiffReport — action items', () => {
  it('generates high priority actions for replaceable apps', () => {
    const report = buildEnvironmentDiffReport(makeScan([HEXTOM, INSTAFEED]));
    const highPriority = report.action_items.filter((a) => a.priority === 'high');
    assert.ok(highPriority.length >= 2);
    assert.ok(highPriority.every((a) => a.action.includes('Replace')));
  });

  it('generates medium priority for high-impact non-replaceable apps', () => {
    const report = buildEnvironmentDiffReport(makeScan([INTERCOM]));
    const medium = report.action_items.filter((a) => a.priority === 'medium');
    assert.ok(medium.length >= 1);
    assert.ok(medium.some((a) => a.action.includes('Review')));
  });

  it('includes potential savings in action items', () => {
    const report = buildEnvironmentDiffReport(makeScan([HEXTOM]));
    const action = report.action_items.find((a) => a.action.includes('Hextom'));
    assert.ok(action);
    assert.ok((action.potential_saving_usd ?? 0) > 0);
    assert.ok((action.potential_saving_ms ?? 0) > 0);
  });
});

// ── Recommendation summary ──────────────────────────────────────────────────

describe('buildEnvironmentDiffReport — recommendation', () => {
  it('generates summary with app count and ms cost', () => {
    const report = buildEnvironmentDiffReport(makeScan([INTERCOM, HEXTOM]));
    assert.ok(report.recommendation_summary.includes('app'));
    assert.ok(report.recommendation_summary.includes('ms'));
  });

  it('includes VAEO savings when replaceable apps exist', () => {
    const report = buildEnvironmentDiffReport(makeScan([HEXTOM, INSTAFEED]));
    assert.ok(report.recommendation_summary.includes('VAEO'));
    assert.ok(report.recommendation_summary.includes('/month'));
  });

  it('does not mention VAEO when no replaceable apps', () => {
    const report = buildEnvironmentDiffReport(makeScan([INTERCOM]));
    assert.ok(!report.recommendation_summary.includes('VAEO'));
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('buildEnvironmentDiffReport — edge cases', () => {
  it('calculates vaeo_replacement_savings correctly', () => {
    const report = buildEnvironmentDiffReport(makeScan([HEXTOM, INSTAFEED]));
    assert.ok(report.vaeo_replacement_savings > 0);
    // Both are replaceable, savings should include both
    assert.ok(report.vaeo_replacement_savings >= 13); // 9.99 + 3.99
  });

  it('handles scan with no detected apps', () => {
    const scan = scanEnvironment('s1', '/', '<html><body></body></html>');
    const report = buildEnvironmentDiffReport(scan);
    assert.equal(report.performance_cost_ms, 0);
    assert.equal(report.top_offenders.length, 0);
    assert.equal(report.action_items.length, 0);
  });
});
