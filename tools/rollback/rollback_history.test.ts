/**
 * tools/rollback/rollback_history.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRollbackRecord,
  isRollbackAllowed,
  getRollbackBlockReason,
  summarizeRollbacks,
  type RollbackRecord,
} from './rollback_history.ts';
import type { RollbackResult, RollbackTarget } from './rollback_engine.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockResult(overrides?: Partial<RollbackResult>): RollbackResult {
  return {
    fix_id:          'fix_1',
    site_id:         'site_1',
    success:         true,
    restored_value:  'Original Title',
    rolled_back_at:  new Date().toISOString(),
    ...overrides,
  };
}

function mockTarget(overrides?: Partial<RollbackTarget>): RollbackTarget {
  return {
    fix_id:         'fix_1',
    site_id:        'site_1',
    url:            'https://x.com/',
    platform:       'shopify',
    signal_type:    'title_missing',
    original_value: 'Original Title',
    applied_value:  'Generated Title',
    applied_at:     new Date().toISOString(),
    ...overrides,
  };
}

function recentApplied(): string {
  return new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
}

function oldApplied(): string {
  return new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(); // 100 hours ago
}

// ── buildRollbackRecord ───────────────────────────────────────────────────────

describe('buildRollbackRecord', () => {
  it('maps fix_id from result', () => {
    const rec = buildRollbackRecord(mockResult(), mockTarget(), 'client');
    assert.equal(rec.fix_id, 'fix_1');
  });

  it('maps site_id from result', () => {
    const rec = buildRollbackRecord(mockResult(), mockTarget(), 'client');
    assert.equal(rec.site_id, 'site_1');
  });

  it('maps url from target', () => {
    const rec = buildRollbackRecord(mockResult(), mockTarget(), 'client');
    assert.equal(rec.url, 'https://x.com/');
  });

  it('maps signal_type from target', () => {
    const rec = buildRollbackRecord(mockResult(), mockTarget(), 'client');
    assert.equal(rec.signal_type, 'title_missing');
  });

  it('maps original_value from target', () => {
    const rec = buildRollbackRecord(mockResult(), mockTarget(), 'client');
    assert.equal(rec.original_value, 'Original Title');
  });

  it('maps applied_value from target', () => {
    const rec = buildRollbackRecord(mockResult(), mockTarget(), 'client');
    assert.equal(rec.applied_value, 'Generated Title');
  });

  it('maps rolled_back_at from result', () => {
    const result = mockResult({ rolled_back_at: '2026-01-01T00:00:00.000Z' });
    const rec = buildRollbackRecord(result, mockTarget(), 'client');
    assert.equal(rec.rolled_back_at, '2026-01-01T00:00:00.000Z');
  });

  it('sets initiated_by=client', () => {
    const rec = buildRollbackRecord(mockResult(), mockTarget(), 'client');
    assert.equal(rec.initiated_by, 'client');
  });

  it('sets initiated_by=system', () => {
    const rec = buildRollbackRecord(mockResult(), mockTarget(), 'system');
    assert.equal(rec.initiated_by, 'system');
  });

  it('maps success from result', () => {
    const rec = buildRollbackRecord(mockResult({ success: false }), mockTarget(), 'client');
    assert.equal(rec.success, false);
  });

  it('rollback_id starts with rb_', () => {
    const rec = buildRollbackRecord(mockResult(), mockTarget(), 'client');
    assert.ok(rec.rollback_id.startsWith('rb_'));
  });

  it('never throws on missing fields', () => {
    assert.doesNotThrow(() =>
      buildRollbackRecord({} as RollbackResult, {} as RollbackTarget, 'client'),
    );
  });
});

// ── isRollbackAllowed ─────────────────────────────────────────────────────────

describe('isRollbackAllowed', () => {
  it('returns true for recently applied fix', () => {
    assert.equal(isRollbackAllowed({ applied_at: recentApplied() }, 48), true);
  });

  it('returns false for old fix', () => {
    assert.equal(isRollbackAllowed({ applied_at: oldApplied() }, 48), false);
  });

  it('returns false for invalid date string', () => {
    assert.equal(isRollbackAllowed({ applied_at: 'not-a-date' }, 48), false);
  });

  it('returns true when fix applied exactly at boundary', () => {
    const now = new Date();
    const exactly48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    assert.equal(isRollbackAllowed({ applied_at: exactly48h }, 48, now), true);
  });

  it('never throws on undefined applied_at', () => {
    assert.doesNotThrow(() => isRollbackAllowed({ applied_at: undefined as never }, 48));
  });
});

// ── getRollbackBlockReason ────────────────────────────────────────────────────

describe('getRollbackBlockReason', () => {
  it('returns null when rollback is allowed', () => {
    const fix = { applied_at: recentApplied(), original_value: 'orig' };
    assert.equal(getRollbackBlockReason(fix, 48), null);
  });

  it('returns reason when fix is too old', () => {
    const fix = { applied_at: oldApplied(), original_value: 'orig' };
    const reason = getRollbackBlockReason(fix, 48);
    assert.ok(reason?.includes('too old'));
    assert.ok(reason?.includes('48'));
  });

  it('returns reason when original_value is null', () => {
    const fix = { applied_at: recentApplied(), original_value: null };
    const reason = getRollbackBlockReason(fix, 48);
    assert.ok(reason?.includes('No original value'));
  });

  it('original_value=null takes priority over age check', () => {
    const fix = { applied_at: recentApplied(), original_value: null };
    assert.ok(getRollbackBlockReason(fix, 48)?.includes('No original value'));
  });

  it('never throws', () => {
    assert.doesNotThrow(() =>
      getRollbackBlockReason({ applied_at: undefined as never, original_value: null }, 48),
    );
  });
});

// ── summarizeRollbacks ────────────────────────────────────────────────────────

describe('summarizeRollbacks', () => {
  function mockRecord(success: boolean, initiated_by: 'client' | 'system'): RollbackRecord {
    return {
      rollback_id:    'rb_1',
      fix_id:         'f',
      site_id:        's',
      url:            'https://x.com/',
      signal_type:    'title',
      original_value: 'orig',
      applied_value:  'gen',
      rolled_back_at: new Date().toISOString(),
      initiated_by,
      success,
    };
  }

  it('total equals array length', () => {
    const s = summarizeRollbacks([mockRecord(true, 'client'), mockRecord(false, 'system')]);
    assert.equal(s.total, 2);
  });

  it('counts successful', () => {
    const s = summarizeRollbacks([mockRecord(true, 'client'), mockRecord(true, 'system'), mockRecord(false, 'client')]);
    assert.equal(s.successful, 2);
  });

  it('counts failed', () => {
    const s = summarizeRollbacks([mockRecord(true, 'client'), mockRecord(false, 'system')]);
    assert.equal(s.failed, 1);
  });

  it('counts client_initiated', () => {
    const s = summarizeRollbacks([
      mockRecord(true, 'client'), mockRecord(true, 'client'), mockRecord(true, 'system'),
    ]);
    assert.equal(s.client_initiated, 2);
  });

  it('all zeros on empty array', () => {
    const s = summarizeRollbacks([]);
    assert.deepEqual(s, { total: 0, successful: 0, failed: 0, client_initiated: 0 });
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => summarizeRollbacks(null as never));
  });
});
