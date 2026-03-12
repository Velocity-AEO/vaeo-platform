/**
 * tools/health/component_checkers.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCrawler,
  checkAIGenerator,
  checkApplyEngine,
  checkValidator,
  checkLearningCenter,
  checkGSCSync,
  checkJobQueue,
  checkShopifyAPI,
  checkStripeWebhook,
  checkSchemaValidator,
  checkSandbox,
  checkTracer,
  runAllChecks,
} from './component_checkers.ts';

// ── checkCrawler ──────────────────────────────────────────────────────────────

describe('checkCrawler', () => {
  it('green when ok and fast', async () => {
    const r = await checkCrawler({ ping: async () => ({ ok: true, latency_ms: 45 }) });
    assert.equal(r.component, 'crawler');
    assert.equal(r.status, 'green');
  });

  it('yellow when latency > 2000ms', async () => {
    const r = await checkCrawler({ ping: async () => ({ ok: true, latency_ms: 2500 }) });
    assert.equal(r.status, 'yellow');
    assert.ok(r.message.includes('slow'));
  });

  it('red when ok=false', async () => {
    const r = await checkCrawler({ ping: async () => ({ ok: false, latency_ms: 100 }) });
    assert.equal(r.status, 'red');
    assert.ok(r.message.includes('unreachable'));
  });

  it('red when ping throws', async () => {
    const r = await checkCrawler({ ping: async () => { throw new Error('timeout'); } });
    assert.equal(r.status, 'red');
    assert.ok(r.error?.includes('timeout'));
  });

  it('green with default (no deps)', async () => {
    const r = await checkCrawler();
    assert.equal(r.status, 'green');
  });
});

// ── checkAIGenerator ─────────────────────────────────────────────────────────

describe('checkAIGenerator', () => {
  it('green when ok and fast', async () => {
    const r = await checkAIGenerator({ ping: async () => ({ ok: true, latency_ms: 900 }) });
    assert.equal(r.status, 'green');
  });

  it('yellow when latency > 5000ms', async () => {
    const r = await checkAIGenerator({ ping: async () => ({ ok: true, latency_ms: 6000 }) });
    assert.equal(r.status, 'yellow');
  });

  it('red when ok=false', async () => {
    const r = await checkAIGenerator({ ping: async () => ({ ok: false, latency_ms: 0 }) });
    assert.equal(r.status, 'red');
  });
});

// ── checkApplyEngine ─────────────────────────────────────────────────────────

describe('checkApplyEngine', () => {
  it('green when ok and model available', async () => {
    const r = await checkApplyEngine({ ping: async () => ({ ok: true, model_available: true }) });
    assert.equal(r.status, 'green');
  });

  it('yellow when model_available=false', async () => {
    const r = await checkApplyEngine({ ping: async () => ({ ok: true, model_available: false }) });
    assert.equal(r.status, 'yellow');
    assert.ok(r.message.includes('degraded'));
  });

  it('red when ok=false', async () => {
    const r = await checkApplyEngine({ ping: async () => ({ ok: false, model_available: false }) });
    assert.equal(r.status, 'red');
  });

  it('red on error', async () => {
    const r = await checkApplyEngine({ ping: async () => { throw new Error('crash'); } });
    assert.equal(r.status, 'red');
  });
});

// ── checkValidator ────────────────────────────────────────────────────────────

describe('checkValidator', () => {
  it('green when ok', async () => {
    const r = await checkValidator({ ping: async () => ({ ok: true }) });
    assert.equal(r.status, 'green');
    assert.equal(r.component, 'validator');
  });

  it('red when not ok', async () => {
    const r = await checkValidator({ ping: async () => ({ ok: false }) });
    assert.equal(r.status, 'red');
  });
});

// ── checkLearningCenter ───────────────────────────────────────────────────────

describe('checkLearningCenter', () => {
  it('green when recent write', async () => {
    const r = await checkLearningCenter({
      getLastWrite: async () => ({ written_at: new Date(Date.now() - 3600_000).toISOString() }),
    });
    assert.equal(r.status, 'green');
    assert.equal(r.component, 'learning_center');
  });

  it('yellow when written_at null', async () => {
    const r = await checkLearningCenter({ getLastWrite: async () => ({ written_at: null }) });
    assert.equal(r.status, 'yellow');
    assert.ok(r.message.includes('No learning'));
  });

  it('yellow when written_at > 24h ago', async () => {
    const old = new Date(Date.now() - 25 * 3600_000).toISOString();
    const r = await checkLearningCenter({ getLastWrite: async () => ({ written_at: old }) });
    assert.equal(r.status, 'yellow');
    assert.ok(r.message.includes('cold'));
  });
});

// ── checkGSCSync ──────────────────────────────────────────────────────────────

describe('checkGSCSync', () => {
  it('green when recent sync', async () => {
    const r = await checkGSCSync({
      getLastSync: async () => ({ synced_at: new Date(Date.now() - 3600_000).toISOString() }),
    });
    assert.equal(r.status, 'green');
  });

  it('red on sync error', async () => {
    const r = await checkGSCSync({
      getLastSync: async () => ({ synced_at: null, error: 'auth failed' }),
    });
    assert.equal(r.status, 'red');
    assert.ok(r.message.includes('auth failed'));
  });

  it('yellow when synced_at null', async () => {
    const r = await checkGSCSync({ getLastSync: async () => ({ synced_at: null }) });
    assert.equal(r.status, 'yellow');
  });

  it('yellow when stale (> 48h)', async () => {
    const old = new Date(Date.now() - 49 * 3600_000).toISOString();
    const r = await checkGSCSync({ getLastSync: async () => ({ synced_at: old }) });
    assert.equal(r.status, 'yellow');
    assert.ok(r.message.includes('stale'));
  });
});

// ── checkJobQueue ─────────────────────────────────────────────────────────────

describe('checkJobQueue', () => {
  it('green when no stuck or failures', async () => {
    const r = await checkJobQueue({
      getQueueStats: async () => ({ pending: 2, stuck: 0, failed_last_hour: 0 }),
    });
    assert.equal(r.status, 'green');
  });

  it('red when stuck > 0', async () => {
    const r = await checkJobQueue({
      getQueueStats: async () => ({ pending: 0, stuck: 2, failed_last_hour: 0 }),
    });
    assert.equal(r.status, 'red');
    assert.ok(r.message.includes('2'));
    assert.ok(r.message.includes('stuck'));
  });

  it('yellow when failed_last_hour > 5', async () => {
    const r = await checkJobQueue({
      getQueueStats: async () => ({ pending: 0, stuck: 0, failed_last_hour: 8 }),
    });
    assert.equal(r.status, 'yellow');
    assert.ok(r.message.includes('8'));
  });
});

// ── checkShopifyAPI ───────────────────────────────────────────────────────────

describe('checkShopifyAPI', () => {
  it('green when ok and fast', async () => {
    const r = await checkShopifyAPI({ ping: async () => ({ ok: true, latency_ms: 210 }) });
    assert.equal(r.status, 'green');
  });

  it('yellow when latency > 3000ms', async () => {
    const r = await checkShopifyAPI({ ping: async () => ({ ok: true, latency_ms: 4000 }) });
    assert.equal(r.status, 'yellow');
  });

  it('red when unreachable', async () => {
    const r = await checkShopifyAPI({ ping: async () => ({ ok: false, latency_ms: 0 }) });
    assert.equal(r.status, 'red');
  });
});

// ── checkStripeWebhook ────────────────────────────────────────────────────────

describe('checkStripeWebhook', () => {
  it('green when recent event', async () => {
    const r = await checkStripeWebhook({
      getLastEvent: async () => ({ received_at: new Date(Date.now() - 3600_000).toISOString() }),
    });
    assert.equal(r.status, 'green');
  });

  it('yellow when received_at null', async () => {
    const r = await checkStripeWebhook({ getLastEvent: async () => ({ received_at: null }) });
    assert.equal(r.status, 'yellow');
    assert.ok(r.message.includes('No Stripe'));
  });

  it('yellow when silent > 72h', async () => {
    const old = new Date(Date.now() - 73 * 3600_000).toISOString();
    const r = await checkStripeWebhook({ getLastEvent: async () => ({ received_at: old }) });
    assert.equal(r.status, 'yellow');
    assert.ok(r.message.includes('silent'));
  });
});

// ── checkSandbox ──────────────────────────────────────────────────────────────

describe('checkSandbox', () => {
  it('green when recent passing run', async () => {
    const r = await checkSandbox({
      getLastRun: async () => ({ ran_at: new Date(Date.now() - 3600_000).toISOString(), passed: true }),
    });
    assert.equal(r.status, 'green');
  });

  it('yellow when never run', async () => {
    const r = await checkSandbox({ getLastRun: async () => ({ ran_at: null, passed: false }) });
    assert.equal(r.status, 'yellow');
  });

  it('red when last run failed', async () => {
    const r = await checkSandbox({
      getLastRun: async () => ({ ran_at: new Date().toISOString(), passed: false }),
    });
    assert.equal(r.status, 'red');
    assert.ok(r.message.includes('failed'));
  });
});

// ── checkTracer ───────────────────────────────────────────────────────────────

describe('checkTracer', () => {
  it('green when recent scan', async () => {
    const r = await checkTracer({
      getLastScan: async () => ({ scanned_at: new Date(Date.now() - 3600_000).toISOString() }),
    });
    assert.equal(r.status, 'green');
  });

  it('yellow when never run', async () => {
    const r = await checkTracer({ getLastScan: async () => ({ scanned_at: null }) });
    assert.equal(r.status, 'yellow');
    assert.ok(r.message.includes('never run'));
  });

  it('yellow when scan overdue (> 25h)', async () => {
    const old = new Date(Date.now() - 26 * 3600_000).toISOString();
    const r = await checkTracer({ getLastScan: async () => ({ scanned_at: old }) });
    assert.equal(r.status, 'yellow');
    assert.ok(r.message.includes('overdue'));
  });
});

// ── runAllChecks ──────────────────────────────────────────────────────────────

describe('runAllChecks', () => {
  it('returns 12 results', async () => {
    const results = await runAllChecks();
    assert.equal(results.length, 12);
  });

  it('all default checks return valid status', async () => {
    const results = await runAllChecks();
    for (const r of results) {
      assert.ok(['green', 'yellow', 'red'].includes(r.status), `bad status on ${r.component}`);
    }
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => runAllChecks());
  });
});
