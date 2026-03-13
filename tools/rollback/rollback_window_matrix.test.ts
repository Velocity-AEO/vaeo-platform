import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLLBACK_WINDOWS,
  DEFAULT_ROLLBACK_WINDOW_HOURS,
  getRollbackWindowHours,
  getRollbackWindowLabel,
  calculateRollbackDeadline,
  isWithinRollbackWindow,
  getTimeRemainingInWindow,
} from './rollback_window_matrix.js';

// ── getRollbackWindowHours ───────────────────────────────────────────────────

describe('getRollbackWindowHours', () => {
  it('returns 168 for SCHEMA_MISSING', () => {
    assert.equal(getRollbackWindowHours('SCHEMA_MISSING'), 168);
  });

  it('returns 168 for CANONICAL_MISSING', () => {
    assert.equal(getRollbackWindowHours('CANONICAL_MISSING'), 168);
  });

  it('returns 168 for ROBOTS_NOINDEX', () => {
    assert.equal(getRollbackWindowHours('ROBOTS_NOINDEX'), 168);
  });

  it('returns 168 for HREFLANG_MISSING', () => {
    assert.equal(getRollbackWindowHours('HREFLANG_MISSING'), 168);
  });

  it('returns 168 for SCHEMA_INVALID', () => {
    assert.equal(getRollbackWindowHours('SCHEMA_INVALID'), 168);
  });

  it('returns 168 for CANONICAL_WRONG', () => {
    assert.equal(getRollbackWindowHours('CANONICAL_WRONG'), 168);
  });

  it('returns 168 for HREFLANG_WRONG', () => {
    assert.equal(getRollbackWindowHours('HREFLANG_WRONG'), 168);
  });

  it('returns 120 for OG_MISSING', () => {
    assert.equal(getRollbackWindowHours('OG_MISSING'), 120);
  });

  it('returns 120 for OG_TITLE', () => {
    assert.equal(getRollbackWindowHours('OG_TITLE'), 120);
  });

  it('returns 120 for OG_DESC', () => {
    assert.equal(getRollbackWindowHours('OG_DESC'), 120);
  });

  it('returns 48 for TITLE_MISSING', () => {
    assert.equal(getRollbackWindowHours('TITLE_MISSING'), 48);
  });

  it('returns 48 for META_DESC_MISSING', () => {
    assert.equal(getRollbackWindowHours('META_DESC_MISSING'), 48);
  });

  it('returns 48 for ALT_MISSING', () => {
    assert.equal(getRollbackWindowHours('ALT_MISSING'), 48);
  });

  it('returns 48 for SPEAKABLE_MISSING', () => {
    assert.equal(getRollbackWindowHours('SPEAKABLE_MISSING'), 48);
  });

  it('returns DEFAULT for unknown type', () => {
    assert.equal(getRollbackWindowHours('UNKNOWN_TYPE'), 48);
  });

  it('is case-insensitive', () => {
    assert.equal(getRollbackWindowHours('schema_missing'), 168);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getRollbackWindowHours(null as any));
  });
});

// ── getRollbackWindowLabel ───────────────────────────────────────────────────

describe('getRollbackWindowLabel', () => {
  it('returns 7 days for 168-hour types', () => {
    assert.equal(getRollbackWindowLabel('SCHEMA_MISSING'), '7 days');
  });

  it('returns 5 days for 120-hour types', () => {
    assert.equal(getRollbackWindowLabel('OG_MISSING'), '5 days');
  });

  it('returns 48 hours for 48-hour types', () => {
    assert.equal(getRollbackWindowLabel('TITLE_MISSING'), '48 hours');
  });

  it('returns 48 hours for unknown types', () => {
    assert.equal(getRollbackWindowLabel('UNKNOWN'), '48 hours');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getRollbackWindowLabel(null as any));
  });
});

// ── calculateRollbackDeadline ────────────────────────────────────────────────

describe('calculateRollbackDeadline', () => {
  it('adds correct hours for schema type', () => {
    const applied = '2025-01-01T00:00:00.000Z';
    const deadline = calculateRollbackDeadline(applied, 'SCHEMA_MISSING');
    const expected = new Date('2025-01-01T00:00:00.000Z').getTime() + 168 * 60 * 60 * 1000;
    assert.equal(new Date(deadline).getTime(), expected);
  });

  it('adds 48 hours for title type', () => {
    const applied = '2025-01-01T00:00:00.000Z';
    const deadline = calculateRollbackDeadline(applied, 'TITLE_MISSING');
    const expected = new Date('2025-01-01T00:00:00.000Z').getTime() + 48 * 60 * 60 * 1000;
    assert.equal(new Date(deadline).getTime(), expected);
  });

  it('returns ISO string', () => {
    const deadline = calculateRollbackDeadline('2025-01-01T00:00:00.000Z', 'TITLE_MISSING');
    assert.ok(deadline.includes('T'));
  });

  it('never throws on bad date', () => {
    assert.doesNotThrow(() => calculateRollbackDeadline('not-a-date', 'TITLE_MISSING'));
  });
});

// ── isWithinRollbackWindow ───────────────────────────────────────────────────

describe('isWithinRollbackWindow', () => {
  it('returns true when within window', () => {
    const applied = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
    assert.equal(isWithinRollbackWindow(applied, 'TITLE_MISSING'), true);
  });

  it('returns false when past deadline', () => {
    const applied = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(); // 50 hours ago
    assert.equal(isWithinRollbackWindow(applied, 'TITLE_MISSING'), false);
  });

  it('returns true for schema fix at 5 days (within 7-day window)', () => {
    const applied = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
    assert.equal(isWithinRollbackWindow(applied, 'SCHEMA_MISSING'), true);
  });

  it('returns false for schema fix at 8 days (past 7-day window)', () => {
    const applied = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days ago
    assert.equal(isWithinRollbackWindow(applied, 'SCHEMA_MISSING'), false);
  });

  it('returns false on parse error', () => {
    assert.equal(isWithinRollbackWindow('bad-date', 'TITLE_MISSING'), false);
  });

  it('accepts now parameter', () => {
    const applied = '2025-01-01T00:00:00.000Z';
    const now = '2025-01-02T00:00:00.000Z'; // 24 hours later
    assert.equal(isWithinRollbackWindow(applied, 'TITLE_MISSING', now), true);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isWithinRollbackWindow(null as any, null as any));
  });
});

// ── getTimeRemainingInWindow ─────────────────────────────────────────────────

describe('getTimeRemainingInWindow', () => {
  it('returns expired=true when past deadline', () => {
    const applied = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
    const result = getTimeRemainingInWindow(applied, 'TITLE_MISSING');
    assert.equal(result.expired, true);
  });

  it('returns expired=false when within window', () => {
    const applied = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const result = getTimeRemainingInWindow(applied, 'TITLE_MISSING');
    assert.equal(result.expired, false);
  });

  it('returns correct hours', () => {
    const applied = '2025-01-01T00:00:00.000Z';
    const now = '2025-01-01T12:00:00.000Z'; // 12 hours in
    const result = getTimeRemainingInWindow(applied, 'TITLE_MISSING', now);
    assert.equal(result.hours, 36); // 48 - 12 = 36 hours remaining
  });

  it('label includes days when > 24 hours', () => {
    const applied = '2025-01-01T00:00:00.000Z';
    const now = '2025-01-01T12:00:00.000Z';
    const result = getTimeRemainingInWindow(applied, 'SCHEMA_MISSING', now);
    assert.ok(result.label.includes('day'));
  });

  it('label is expired when past', () => {
    const applied = new Date(Date.now() - 200 * 60 * 60 * 1000).toISOString();
    const result = getTimeRemainingInWindow(applied, 'TITLE_MISSING');
    assert.ok(result.label.includes('expired'));
  });

  it('label shows hours when < 24 hours remaining', () => {
    const applied = '2025-01-01T00:00:00.000Z';
    const now = '2025-01-02T12:00:00.000Z'; // 36 hours in, 12 remaining
    const result = getTimeRemainingInWindow(applied, 'TITLE_MISSING', now);
    assert.ok(result.label.includes('hour'));
  });

  it('never throws on bad input', () => {
    assert.doesNotThrow(() => getTimeRemainingInWindow(null as any, null as any));
  });
});

// ── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('DEFAULT_ROLLBACK_WINDOW_HOURS equals 48', () => {
    assert.equal(DEFAULT_ROLLBACK_WINDOW_HOURS, 48);
  });

  it('ROLLBACK_WINDOWS has all high-risk types at 168', () => {
    const highRisk = ['SCHEMA_MISSING', 'SCHEMA_INVALID', 'CANONICAL_MISSING', 'CANONICAL_WRONG', 'ROBOTS_NOINDEX', 'HREFLANG_MISSING', 'HREFLANG_WRONG'];
    for (const t of highRisk) {
      assert.equal(ROLLBACK_WINDOWS[t], 168, `${t} should be 168`);
    }
  });

  it('ROLLBACK_WINDOWS has OG types at 120', () => {
    const ogTypes = ['OG_MISSING', 'OG_TITLE', 'OG_DESC'];
    for (const t of ogTypes) {
      assert.equal(ROLLBACK_WINDOWS[t], 120, `${t} should be 120`);
    }
  });

  it('ROLLBACK_WINDOWS has title/meta types at 48', () => {
    const safeTypes = ['TITLE_MISSING', 'TITLE_LONG', 'TITLE_SHORT', 'META_DESC_MISSING', 'META_DESC_LONG', 'ALT_MISSING', 'SPEAKABLE_MISSING', 'ORPHANED_PAGE'];
    for (const t of safeTypes) {
      assert.equal(ROLLBACK_WINDOWS[t], 48, `${t} should be 48`);
    }
  });
});
