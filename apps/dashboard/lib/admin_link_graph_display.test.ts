import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getGradeColor,
  getGradeBg,
  formatBuildAge,
  getBuildAgeColor,
  getIntegritySeverityColor,
  getIntegritySeverityBg,
  getIntegrityIssueLabel,
  getRebuildScopeLabel,
  formatLargeNumber,
} from './admin_link_graph_display.js';

// ── getGradeColor ───────────────────────────────────────────────────────────

describe('getGradeColor', () => {
  it('returns green for A', () => assert.equal(getGradeColor('A'), 'text-green-600'));
  it('returns blue for B', () => assert.equal(getGradeColor('B'), 'text-blue-600'));
  it('returns red for F', () => assert.equal(getGradeColor('F'), 'text-red-600'));
  it('returns slate for unknown', () => assert.equal(getGradeColor('X'), 'text-slate-600'));
  it('never throws on null', () => assert.doesNotThrow(() => getGradeColor(null as any)));
});

// ── getGradeBg ──────────────────────────────────────────────────────────────

describe('getGradeBg', () => {
  it('returns green bg for A', () => assert.ok(getGradeBg('A').includes('green')));
  it('returns red bg for F', () => assert.ok(getGradeBg('F').includes('red')));
  it('returns slate for unknown', () => assert.ok(getGradeBg('X').includes('slate')));
  it('never throws on null', () => assert.doesNotThrow(() => getGradeBg(null as any)));
});

// ── formatBuildAge ──────────────────────────────────────────────────────────

describe('formatBuildAge', () => {
  it('returns Never built for null', () => assert.equal(formatBuildAge(null), 'Never built'));
  it('returns Just now for 0', () => assert.equal(formatBuildAge(0), 'Just now'));
  it('returns hours for < 24', () => assert.equal(formatBuildAge(5), '5h ago'));
  it('returns days for >= 24', () => assert.equal(formatBuildAge(48), '2d ago'));
  it('never throws on null', () => assert.doesNotThrow(() => formatBuildAge(null as any)));
});

// ── getBuildAgeColor ────────────────────────────────────────────────────────

describe('getBuildAgeColor', () => {
  it('returns green for fresh', () => assert.equal(getBuildAgeColor(12), 'text-green-600'));
  it('returns yellow for aging', () => assert.equal(getBuildAgeColor(36), 'text-yellow-600'));
  it('returns red for stale', () => assert.equal(getBuildAgeColor(72), 'text-red-600'));
  it('returns red for null', () => assert.equal(getBuildAgeColor(null), 'text-red-600'));
  it('never throws on null', () => assert.doesNotThrow(() => getBuildAgeColor(null as any)));
});

// ── getIntegritySeverityColor ───────────────────────────────────────────────

describe('getIntegritySeverityColor', () => {
  it('returns red for critical', () => assert.equal(getIntegritySeverityColor('critical'), 'text-red-600'));
  it('returns yellow for warning', () => assert.equal(getIntegritySeverityColor('warning'), 'text-yellow-600'));
  it('returns blue for info', () => assert.equal(getIntegritySeverityColor('info'), 'text-blue-600'));
  it('returns slate for unknown', () => assert.equal(getIntegritySeverityColor('x'), 'text-slate-600'));
  it('never throws on null', () => assert.doesNotThrow(() => getIntegritySeverityColor(null as any)));
});

// ── getIntegritySeverityBg ──────────────────────────────────────────────────

describe('getIntegritySeverityBg', () => {
  it('returns red bg for critical', () => assert.ok(getIntegritySeverityBg('critical').includes('red')));
  it('returns yellow bg for warning', () => assert.ok(getIntegritySeverityBg('warning').includes('yellow')));
  it('never throws on null', () => assert.doesNotThrow(() => getIntegritySeverityBg(null as any)));
});

// ── getIntegrityIssueLabel ──────────────────────────────────────────────────

describe('getIntegrityIssueLabel', () => {
  it('returns Dangling Link', () => assert.equal(getIntegrityIssueLabel('dangling_link'), 'Dangling Link'));
  it('returns Orphaned Node', () => assert.equal(getIntegrityIssueLabel('orphaned_node'), 'Orphaned Node'));
  it('returns Empty Graph', () => assert.equal(getIntegrityIssueLabel('empty_graph'), 'Empty Graph'));
  it('returns Unknown Issue for unknown', () => assert.equal(getIntegrityIssueLabel('x'), 'Unknown Issue'));
  it('never throws on null', () => assert.doesNotThrow(() => getIntegrityIssueLabel(null as any)));
});

// ── getRebuildScopeLabel ────────────────────────────────────────────────────

describe('getRebuildScopeLabel', () => {
  it('returns Single Site', () => assert.equal(getRebuildScopeLabel('single'), 'Single Site'));
  it('returns All Stale Sites', () => assert.equal(getRebuildScopeLabel('stale'), 'All Stale Sites'));
  it('returns All Sites', () => assert.equal(getRebuildScopeLabel('all'), 'All Sites'));
  it('returns Unknown for unknown', () => assert.equal(getRebuildScopeLabel('x'), 'Unknown'));
  it('never throws on null', () => assert.doesNotThrow(() => getRebuildScopeLabel(null as any)));
});

// ── formatLargeNumber ───────────────────────────────────────────────────────

describe('formatLargeNumber', () => {
  it('returns plain number < 1000', () => assert.equal(formatLargeNumber(500), '500'));
  it('returns K for thousands', () => assert.equal(formatLargeNumber(2500), '2.5K'));
  it('returns M for millions', () => assert.equal(formatLargeNumber(1500000), '1.5M'));
  it('returns 0 for NaN', () => assert.equal(formatLargeNumber(NaN), '0'));
  it('never throws on null', () => assert.doesNotThrow(() => formatLargeNumber(null as any)));
});
