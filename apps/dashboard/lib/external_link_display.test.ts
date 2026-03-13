/**
 * apps/dashboard/lib/external_link_display.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getReputationBadge,
  getBrokenLinkSeverity,
  formatResponseTime,
} from './external_link_display.js';

// ── getReputationBadge ────────────────────────────────────────────────────────

describe('getReputationBadge', () => {
  it('returns trusted badge for trusted reputation', () => {
    const badge = getReputationBadge('trusted');
    assert.equal(badge.label, 'Trusted');
    assert.equal(badge.color, 'green');
  });

  it('returns low_value badge for low_value reputation', () => {
    const badge = getReputationBadge('low_value');
    assert.equal(badge.label, 'Low Value');
    assert.equal(badge.color, 'orange');
  });

  it('returns spammy badge for spammy reputation', () => {
    const badge = getReputationBadge('spammy');
    assert.equal(badge.label, 'Spammy');
    assert.equal(badge.color, 'red');
  });

  it('returns unknown badge for unknown reputation', () => {
    const badge = getReputationBadge('unknown');
    assert.equal(badge.label, 'Unknown');
    assert.equal(badge.color, 'grey');
  });

  it('returns unchecked badge for unchecked reputation', () => {
    const badge = getReputationBadge('unchecked');
    assert.equal(badge.label, 'Unchecked');
    assert.equal(badge.color, 'grey');
  });

  it('returns fallback for unknown value', () => {
    const badge = getReputationBadge('bogus' as any);
    assert.equal(badge.label, 'Unknown');
    assert.equal(badge.color, 'grey');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getReputationBadge(null as any));
  });
});

// ── getBrokenLinkSeverity ─────────────────────────────────────────────────────

describe('getBrokenLinkSeverity', () => {
  it('returns critical for null status_code', () => {
    assert.equal(getBrokenLinkSeverity(null), 'critical');
  });

  it('returns high for 404', () => {
    assert.equal(getBrokenLinkSeverity(404), 'high');
  });

  it('returns medium for 500', () => {
    assert.equal(getBrokenLinkSeverity(500), 'medium');
  });

  it('returns medium for 503', () => {
    assert.equal(getBrokenLinkSeverity(503), 'medium');
  });

  it('returns medium for 400', () => {
    assert.equal(getBrokenLinkSeverity(400), 'medium');
  });

  it('returns medium for 403', () => {
    assert.equal(getBrokenLinkSeverity(403), 'medium');
  });

  it('returns medium for 410', () => {
    assert.equal(getBrokenLinkSeverity(410), 'medium');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getBrokenLinkSeverity(null));
  });
});

// ── formatResponseTime ────────────────────────────────────────────────────────

describe('formatResponseTime', () => {
  it('returns dash for null', () => {
    assert.equal(formatResponseTime(null), '—');
  });

  it('labels fast for sub-500ms', () => {
    const result = formatResponseTime(200);
    assert.ok(result.includes('fast'));
  });

  it('labels 0ms as fast', () => {
    const result = formatResponseTime(0);
    assert.ok(result.includes('fast'));
  });

  it('labels 499ms as fast', () => {
    const result = formatResponseTime(499);
    assert.ok(result.includes('fast'));
  });

  it('does not label fast for 500ms', () => {
    const result = formatResponseTime(500);
    assert.ok(!result.includes('fast'));
  });

  it('labels slow for 2000ms or more', () => {
    const result = formatResponseTime(2000);
    assert.ok(result.includes('slow'));
  });

  it('labels slow for 5000ms', () => {
    const result = formatResponseTime(5000);
    assert.ok(result.includes('slow'));
  });

  it('does not label slow for 1999ms', () => {
    const result = formatResponseTime(1999);
    assert.ok(!result.includes('slow'));
  });

  it('includes ms unit in output', () => {
    const result = formatResponseTime(1000);
    assert.ok(result.includes('ms'));
  });

  it('rounds to nearest ms', () => {
    const result = formatResponseTime(123.7);
    assert.ok(result.includes('124'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatResponseTime(null));
  });

  it('never throws on undefined', () => {
    assert.doesNotThrow(() => formatResponseTime(undefined as any));
  });
});
