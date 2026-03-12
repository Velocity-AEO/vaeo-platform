/**
 * tools/viewport/viewport_qa_record.test.ts
 *
 * Tests for viewport QA record persistence model.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQARecord,
  isQARecordStale,
  summarizeQARecords,
} from './viewport_qa_record.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeResult(overrides: Record<string, any> = {}) {
  return {
    fix_id: 'fix-1',
    site_id: 'site-1',
    pair: {
      fix_id: 'fix-1',
      site_id: 'site-1',
      url: 'https://example.com/page',
      before: [
        { viewport: { name: 'mobile', width: 375, height: 812 }, stage: 'before', url: '', key: 'k1', captured_at: '', success: true },
        { viewport: { name: 'tablet', width: 768, height: 1024 }, stage: 'before', url: '', key: 'k2', captured_at: '', success: true },
      ],
      after: [
        { viewport: { name: 'mobile', width: 375, height: 812 }, stage: 'after', url: '', key: 'k3', captured_at: '', success: true },
        { viewport: { name: 'tablet', width: 768, height: 1024 }, stage: 'after', url: '', key: 'k4', captured_at: '', success: true },
      ],
      all_viewports_clean: true,
      captured_at: new Date().toISOString(),
    },
    passed: true,
    failed_viewports: [],
    stored_keys: ['k1', 'k2', 'k3', 'k4'],
    qa_at: new Date().toISOString(),
    ...overrides,
  };
}

function fakeRecord(overrides: Record<string, any> = {}) {
  return {
    fix_id: 'fix-1',
    site_id: 'site-1',
    url: 'https://example.com',
    passed: true,
    failed_viewports: [] as string[],
    checked_at: new Date().toISOString(),
    viewport_count: 4,
    ...overrides,
  };
}

// ── buildQARecord ────────────────────────────────────────────────────────────

describe('buildQARecord', () => {
  it('maps all fields from ViewportQAResult', () => {
    const result = fakeResult();
    const record = buildQARecord(result as any);
    assert.equal(record.fix_id, 'fix-1');
    assert.equal(record.site_id, 'site-1');
    assert.equal(record.url, 'https://example.com/page');
    assert.equal(record.passed, true);
    assert.deepEqual(record.failed_viewports, []);
    assert.equal(record.viewport_count, 4);
    assert.ok(record.checked_at.length > 0);
  });

  it('maps failed_viewports', () => {
    const result = fakeResult({ passed: false, failed_viewports: ['mobile'] });
    const record = buildQARecord(result as any);
    assert.equal(record.passed, false);
    assert.deepEqual(record.failed_viewports, ['mobile']);
  });

  it('handles missing pair gracefully', () => {
    const result = fakeResult({ pair: null });
    const record = buildQARecord(result as any);
    assert.equal(record.url, '');
    assert.equal(record.viewport_count, 0);
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => buildQARecord(null as any));
  });

  it('never throws on undefined input', () => {
    assert.doesNotThrow(() => buildQARecord(undefined as any));
  });
});

// ── isQARecordStale ──────────────────────────────────────────────────────────

describe('isQARecordStale', () => {
  it('returns false for fresh record', () => {
    const record = fakeRecord({ checked_at: new Date().toISOString() });
    assert.equal(isQARecordStale(record, 24), false);
  });

  it('returns true for old record', () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const record = fakeRecord({ checked_at: old });
    assert.equal(isQARecordStale(record, 24), true);
  });

  it('returns true for record exactly at boundary', () => {
    const boundary = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1).toISOString();
    const record = fakeRecord({ checked_at: boundary });
    assert.equal(isQARecordStale(record, 24), true);
  });

  it('returns true for invalid date', () => {
    const record = fakeRecord({ checked_at: 'not-a-date' });
    assert.equal(isQARecordStale(record, 24), true);
  });

  it('never throws on null record', () => {
    assert.doesNotThrow(() => isQARecordStale(null as any, 24));
  });
});

// ── summarizeQARecords ───────────────────────────────────────────────────────

describe('summarizeQARecords', () => {
  it('calculates pass_rate correctly', () => {
    const records = [
      fakeRecord({ passed: true }),
      fakeRecord({ passed: true }),
      fakeRecord({ passed: false }),
      fakeRecord({ passed: true }),
    ];
    const summary = summarizeQARecords(records);
    assert.equal(summary.total, 4);
    assert.equal(summary.passed, 3);
    assert.equal(summary.failed, 1);
    assert.equal(summary.pass_rate, 75);
  });

  it('handles empty array', () => {
    const summary = summarizeQARecords([]);
    assert.equal(summary.total, 0);
    assert.equal(summary.passed, 0);
    assert.equal(summary.failed, 0);
    assert.equal(summary.pass_rate, 0);
  });

  it('handles all passing', () => {
    const records = [fakeRecord({ passed: true }), fakeRecord({ passed: true })];
    const summary = summarizeQARecords(records);
    assert.equal(summary.pass_rate, 100);
  });

  it('handles all failing', () => {
    const records = [fakeRecord({ passed: false }), fakeRecord({ passed: false })];
    const summary = summarizeQARecords(records);
    assert.equal(summary.pass_rate, 0);
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => summarizeQARecords(null as any));
  });

  it('never throws on undefined input', () => {
    assert.doesNotThrow(() => summarizeQARecords(undefined as any));
  });
});
