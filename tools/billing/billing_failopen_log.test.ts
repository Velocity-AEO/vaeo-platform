/**
 * tools/billing/billing_failopen_log.test.ts
 *
 * Tests for billing fail-open logging.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  logBillingFailOpen,
  checkBillingGate,
  type BillingFailOpenEntry,
} from './billing_enforcement.js';

// ── logBillingFailOpen ───────────────────────────────────────────────────────

describe('logBillingFailOpen', () => {
  it('calls saveFn with correct data', async () => {
    let saved: BillingFailOpenEntry | null = null;
    await logBillingFailOpen('t1', 's1', 'check_billing_gate', new Error('db down'), {
      saveFn: async (entry) => { saved = entry; },
    });
    assert.ok(saved);
    assert.equal(saved!.tenant_id, 't1');
    assert.equal(saved!.site_id, 's1');
    assert.equal(saved!.action, 'check_billing_gate');
    assert.equal(saved!.error_message, 'db down');
    assert.equal(saved!.reconciled, false);
  });

  it('includes failed_at timestamp', async () => {
    let saved: BillingFailOpenEntry | null = null;
    await logBillingFailOpen('t1', 's1', 'action', 'error', {
      saveFn: async (entry) => { saved = entry; },
    });
    assert.ok(saved!.failed_at);
    assert.ok(saved!.failed_at.includes('T'));
  });

  it('logs to console when saveFn throws', async () => {
    // Should not throw even when save fails
    await assert.doesNotReject(() =>
      logBillingFailOpen('t1', 's1', 'action', 'error', {
        saveFn: async () => { throw new Error('save failed'); },
      }),
    );
  });

  it('never throws when saveFn throws', async () => {
    await assert.doesNotReject(() =>
      logBillingFailOpen('t1', 's1', 'action', new Error('boom'), {
        saveFn: async () => { throw new Error('save failed'); },
      }),
    );
  });

  it('never throws with no deps', async () => {
    await assert.doesNotReject(() =>
      logBillingFailOpen('t1', 's1', 'action', 'error'),
    );
  });

  it('never throws with null inputs', async () => {
    await assert.doesNotReject(() =>
      logBillingFailOpen(null as any, null as any, null as any, null),
    );
  });

  it('log entry includes tenant_id and site_id', async () => {
    let saved: BillingFailOpenEntry | null = null;
    await logBillingFailOpen('tenant_abc', 'site_xyz', 'fix', 'err', {
      saveFn: async (entry) => { saved = entry; },
    });
    assert.equal(saved!.tenant_id, 'tenant_abc');
    assert.equal(saved!.site_id, 'site_xyz');
  });

  it('log entry includes error_message from Error object', async () => {
    let saved: BillingFailOpenEntry | null = null;
    await logBillingFailOpen('t1', 's1', 'action', new Error('specific error'), {
      saveFn: async (entry) => { saved = entry; },
    });
    assert.equal(saved!.error_message, 'specific error');
  });

  it('log entry includes error_message from string', async () => {
    let saved: BillingFailOpenEntry | null = null;
    await logBillingFailOpen('t1', 's1', 'action', 'string error', {
      saveFn: async (entry) => { saved = entry; },
    });
    assert.equal(saved!.error_message, 'string error');
  });

  it('reconciled defaults to false', async () => {
    let saved: BillingFailOpenEntry | null = null;
    await logBillingFailOpen('t1', 's1', 'action', 'error', {
      saveFn: async (entry) => { saved = entry; },
    });
    assert.equal(saved!.reconciled, false);
  });
});

// ── checkBillingGate — fail-open logging integration ─────────────────────────

describe('checkBillingGate — fail-open logging', () => {
  it('calls failOpenLogFn when gate fails open', async () => {
    let logged = false;
    const result = await checkBillingGate('s1', 1, {
      loadUsageFn: async () => { throw new Error('db down'); },
      failOpenLogFn: async () => { logged = true; },
    });
    assert.equal(result.allowed, true);
    assert.equal(logged, true);
  });

  it('still fails open when failOpenLogFn throws', async () => {
    const result = await checkBillingGate('s1', 1, {
      loadUsageFn: async () => { throw new Error('db down'); },
      failOpenLogFn: async () => { throw new Error('log failed too'); },
    });
    assert.equal(result.allowed, true);
    assert.ok(result.reason?.includes('skipped'));
  });

  it('does not call failOpenLogFn on normal success', async () => {
    let logged = false;
    const result = await checkBillingGate('s1', 1, {
      loadUsageFn: async () => 5,
      loadPlanFn:  async () => 100,
      failOpenLogFn: async () => { logged = true; },
    });
    assert.equal(result.allowed, true);
    assert.equal(logged, false);
  });

  it('does not call failOpenLogFn on normal deny', async () => {
    let logged = false;
    const result = await checkBillingGate('s1', 10, {
      loadUsageFn: async () => 95,
      loadPlanFn:  async () => 100,
      failOpenLogFn: async () => { logged = true; },
    });
    assert.equal(result.allowed, false);
    assert.equal(logged, false);
  });
});
