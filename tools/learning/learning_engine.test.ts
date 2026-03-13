/**
 * tools/learning/learning_engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldAutoApprove,
  getDailyAutoApprovalCount,
  type ShouldAutoApproveInput,
} from './learning_engine.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function input(overrides?: Partial<ShouldAutoApproveInput>): ShouldAutoApproveInput {
  return {
    issue_type:          'TITLE_MISSING',  // low risk, threshold=0.75
    confidence:          0.80,
    sandbox_passed:      false,            // not required for TITLE_MISSING
    viewport_qa_passed:  false,            // not required for TITLE_MISSING
    ...overrides,
  };
}

// ── shouldAutoApprove — threshold checks ──────────────────────────────────────

describe('shouldAutoApprove — threshold', () => {
  it('uses risk-adjusted threshold (approves at 0.80 for TITLE_MISSING, threshold=0.75)', async () => {
    const d = await shouldAutoApprove(input({ confidence: 0.80 }), 'site_1');
    assert.equal(d.approved, true);
  });

  it('rejects below threshold (0.70 < 0.75 for TITLE_MISSING)', async () => {
    const d = await shouldAutoApprove(input({ confidence: 0.70 }), 'site_1');
    assert.equal(d.approved, false);
    assert.ok(d.reason.includes('below threshold'));
  });

  it('rejects exactly at threshold - epsilon', async () => {
    const d = await shouldAutoApprove(input({ confidence: 0.7499 }), 'site_1');
    assert.equal(d.approved, false);
  });

  it('approves exactly at threshold', async () => {
    const d = await shouldAutoApprove(input({ confidence: 0.75 }), 'site_1');
    assert.equal(d.approved, true);
  });

  it('high risk SCHEMA_MISSING requires 0.92 confidence', async () => {
    const d = await shouldAutoApprove(input({
      issue_type:     'SCHEMA_MISSING',
      confidence:     0.91,
      sandbox_passed: true,  // required for high risk
    }), 'site_1');
    assert.equal(d.approved, false);
    assert.ok(d.reason.includes('below threshold'));
  });
});

// ── shouldAutoApprove — sandbox gate ─────────────────────────────────────────

describe('shouldAutoApprove — sandbox gate', () => {
  it('requires sandbox for high risk (SCHEMA_MISSING)', async () => {
    const d = await shouldAutoApprove(input({
      issue_type:     'SCHEMA_MISSING',
      confidence:     0.95,
      sandbox_passed: true,
    }), 'site_1');
    assert.equal(d.sandbox_required, true);
  });

  it('rejects when sandbox required and sandbox_passed=false', async () => {
    const d = await shouldAutoApprove(input({
      issue_type:     'SCHEMA_MISSING',
      confidence:     0.95,
      sandbox_passed: false,
    }), 'site_1');
    assert.equal(d.approved, false);
    assert.ok(d.reason.includes('sandbox'));
  });

  it('approves when sandbox required and sandbox_passed=true (confidence met)', async () => {
    const d = await shouldAutoApprove(input({
      issue_type:     'CANONICAL_MISSING',
      confidence:     0.95,
      sandbox_passed: true,
    }), 'site_1');
    assert.equal(d.approved, true);
  });

  it('does not require sandbox for low risk (TITLE_MISSING)', async () => {
    const d = await shouldAutoApprove(input({ confidence: 0.80 }), 'site_1');
    assert.equal(d.sandbox_required, false);
    assert.equal(d.approved, true);
  });
});

// ── shouldAutoApprove — viewport QA gate ─────────────────────────────────────

describe('shouldAutoApprove — viewport QA gate', () => {
  it('requires viewport QA for critical risk (ROBOTS_NOINDEX)', async () => {
    const d = await shouldAutoApprove(input({
      issue_type:          'ROBOTS_NOINDEX',
      confidence:          0.98,
      sandbox_passed:      true,
      viewport_qa_passed:  true,
    }), 'site_1');
    assert.equal(d.viewport_qa_required, true);
  });

  it('rejects when viewport QA required but viewport_qa_passed=false', async () => {
    const d = await shouldAutoApprove(input({
      issue_type:          'ROBOTS_NOINDEX',
      confidence:          0.98,
      sandbox_passed:      true,
      viewport_qa_passed:  false,
    }), 'site_1');
    assert.equal(d.approved, false);
    assert.ok(d.reason.includes('viewport'));
  });

  it('does not require viewport QA for META_DESC_MISSING', async () => {
    const d = await shouldAutoApprove(input({
      issue_type:  'META_DESC_MISSING',
      confidence:  0.80,
    }), 'site_1');
    assert.equal(d.viewport_qa_required, false);
  });
});

// ── shouldAutoApprove — daily limit gate ──────────────────────────────────────

describe('shouldAutoApprove — daily limit', () => {
  it('rejects at daily limit', async () => {
    // TITLE_MISSING limit is 50; inject count=50 (at limit)
    const d = await shouldAutoApprove(input({ confidence: 0.80 }), 'site_1', {
      getDailyCount: async () => 50,
    });
    assert.equal(d.approved, false);
    assert.ok(d.reason.includes('daily limit'));
  });

  it('approves below daily limit', async () => {
    // count=49 < limit=50 → approve
    const d = await shouldAutoApprove(input({ confidence: 0.80 }), 'site_1', {
      getDailyCount: async () => 49,
    });
    assert.equal(d.approved, true);
  });

  it('logs when daily limit reached', async () => {
    const logs: string[] = [];
    await shouldAutoApprove(input({ confidence: 0.80 }), 'site_1', {
      getDailyCount: async () => 50,
      logFn:         (msg) => logs.push(msg),
    });
    assert.ok(logs.some((l) => l.includes('[LEARNING]')));
    assert.ok(logs.some((l) => l.includes('TITLE_MISSING')));
  });
});

// ── shouldAutoApprove — decision log fields ───────────────────────────────────

describe('shouldAutoApprove — decision log', () => {
  it('includes risk_level', async () => {
    const d = await shouldAutoApprove(input(), 'site_1');
    assert.ok(['low', 'medium', 'high', 'critical'].includes(d.risk_level));
  });

  it('includes threshold_used', async () => {
    const d = await shouldAutoApprove(input(), 'site_1');
    assert.equal(typeof d.threshold_used, 'number');
    assert.equal(d.threshold_used, 0.75); // TITLE_MISSING is low
  });

  it('includes sandbox_required', async () => {
    const d = await shouldAutoApprove(input(), 'site_1');
    assert.equal(typeof d.sandbox_required, 'boolean');
  });

  it('includes daily_count', async () => {
    const d = await shouldAutoApprove(input(), 'site_1', {
      getDailyCount: async () => 7,
    });
    assert.equal(d.daily_count, 7);
  });

  it('includes daily_limit', async () => {
    const d = await shouldAutoApprove(input(), 'site_1');
    assert.equal(d.daily_limit, 50); // TITLE_MISSING limit
  });

  it('sandbox_passed reflects input', async () => {
    const d = await shouldAutoApprove(input({ sandbox_passed: true }), 'site_1');
    assert.equal(d.sandbox_passed, true);
  });

  it('viewport_qa_passed reflects input', async () => {
    const d = await shouldAutoApprove(input({ viewport_qa_passed: true }), 'site_1');
    assert.equal(d.viewport_qa_passed, true);
  });
});

// ── getDailyAutoApprovalCount ─────────────────────────────────────────────────

describe('getDailyAutoApprovalCount', () => {
  it('returns count from countFn', async () => {
    const count = await getDailyAutoApprovalCount('TITLE_MISSING', 'site_1', {
      countFn: async () => 12,
    });
    assert.equal(count, 12);
  });

  it('returns 0 on error', async () => {
    const count = await getDailyAutoApprovalCount('TITLE_MISSING', 'site_1', {
      countFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(count, 0);
  });

  it('returns 0 by default (no DB)', async () => {
    const count = await getDailyAutoApprovalCount('SCHEMA_MISSING', 'site_1');
    assert.equal(count, 0);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      getDailyAutoApprovalCount(null as never, null as never, {
        countFn: async () => { throw new Error('boom'); },
      }),
    );
  });
});

// ── shouldAutoApprove — never throws ─────────────────────────────────────────

describe('shouldAutoApprove — never throws', () => {
  it('never throws on null input', async () => {
    await assert.doesNotReject(() =>
      shouldAutoApprove(null as never, null as never),
    );
  });

  it('never throws when getDailyCount throws', async () => {
    await assert.doesNotReject(() =>
      shouldAutoApprove(input({ confidence: 0.90 }), 'site_1', {
        getDailyCount: async () => { throw new Error('db'); },
      }),
    );
  });
});
