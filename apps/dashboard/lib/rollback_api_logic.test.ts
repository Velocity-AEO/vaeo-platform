/**
 * apps/dashboard/lib/rollback_api_logic.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRollbackRequest,
  getRollbackStatusMessage,
  canShowRollbackButton,
} from './rollback_api_logic.ts';
import type { RollbackResult } from '../../../tools/rollback/rollback_engine.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function recentFix(original_value: string | null = 'orig') {
  return {
    applied_at:     new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    original_value,
  };
}

function oldFix(original_value: string | null = 'orig') {
  return {
    applied_at:     new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
    original_value,
  };
}

function mockResult(overrides?: Partial<RollbackResult>): RollbackResult {
  return {
    fix_id:         'fix_1',
    site_id:        'site_1',
    success:        true,
    restored_value: 'Original Title',
    rolled_back_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── buildRollbackRequest ──────────────────────────────────────────────────────

describe('buildRollbackRequest', () => {
  it('includes fix_id when provided', () => {
    const req = buildRollbackRequest('fix_99');
    assert.equal(req.fix_id, 'fix_99');
  });

  it('omits fix_id when null', () => {
    const req = buildRollbackRequest(null);
    assert.equal('fix_id' in req, false);
  });

  it('omits fix_id when undefined', () => {
    const req = buildRollbackRequest(undefined as never);
    assert.equal('fix_id' in req, false);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => buildRollbackRequest(null));
    assert.doesNotThrow(() => buildRollbackRequest('fix_1'));
  });
});

// ── getRollbackStatusMessage ──────────────────────────────────────────────────

describe('getRollbackStatusMessage', () => {
  it('returns success message when success=true', () => {
    const msg = getRollbackStatusMessage(mockResult({ success: true }));
    assert.equal(msg, 'Fix successfully rolled back');
  });

  it('includes error in failure message', () => {
    const msg = getRollbackStatusMessage(mockResult({ success: false, error: 'timeout' }));
    assert.ok(msg.includes('timeout'));
  });

  it('failure message starts with "Rollback failed:"', () => {
    const msg = getRollbackStatusMessage(mockResult({ success: false, error: 'x' }));
    assert.ok(msg.startsWith('Rollback failed:'));
  });

  it('handles missing error field gracefully', () => {
    const msg = getRollbackStatusMessage(mockResult({ success: false, error: undefined }));
    assert.ok(msg.includes('Rollback failed'));
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getRollbackStatusMessage({} as RollbackResult));
  });
});

// ── canShowRollbackButton ─────────────────────────────────────────────────────

describe('canShowRollbackButton', () => {
  it('returns true for recent fix with original_value', () => {
    assert.equal(canShowRollbackButton(recentFix('orig')), true);
  });

  it('returns false when original_value is null', () => {
    assert.equal(canShowRollbackButton(recentFix(null)), false);
  });

  it('returns false when fix is too old', () => {
    assert.equal(canShowRollbackButton(oldFix('orig')), false);
  });

  it('returns false when both old and no original', () => {
    assert.equal(canShowRollbackButton(oldFix(null)), false);
  });

  it('never throws on empty object', () => {
    assert.doesNotThrow(() => canShowRollbackButton({} as never));
  });
});
