/**
 * tools/health/health_check.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHealthReport,
  deriveOverallStatus,
  COMPONENT_REGISTRY,
  type HealthCheckResult,
} from './health_check.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResult(
  component: string,
  status: 'green' | 'yellow' | 'red',
  message = 'ok',
): HealthCheckResult {
  return { component, status, message, checked_at: new Date().toISOString() };
}

const NOW = Date.now();

// ── COMPONENT_REGISTRY ────────────────────────────────────────────────────────

describe('COMPONENT_REGISTRY', () => {
  it('has at least 12 components', () => {
    assert.ok(COMPONENT_REGISTRY.length >= 12);
  });

  it('includes required components', () => {
    const required = [
      'crawler', 'ai_generator', 'apply_engine', 'validator',
      'learning_center', 'gsc_sync', 'job_queue', 'shopify_api',
      'stripe_webhook', 'schema_validator', 'sandbox', 'tracer',
    ];
    for (const c of required) {
      assert.ok(COMPONENT_REGISTRY.includes(c), `missing: ${c}`);
    }
  });
});

// ── deriveOverallStatus ───────────────────────────────────────────────────────

describe('deriveOverallStatus', () => {
  it('returns green when all green', () => {
    assert.equal(
      deriveOverallStatus([makeResult('a', 'green'), makeResult('b', 'green')]),
      'green',
    );
  });

  it('returns yellow when some yellow, none red', () => {
    assert.equal(
      deriveOverallStatus([makeResult('a', 'green'), makeResult('b', 'yellow')]),
      'yellow',
    );
  });

  it('returns red when any red', () => {
    assert.equal(
      deriveOverallStatus([makeResult('a', 'yellow'), makeResult('b', 'red')]),
      'red',
    );
  });

  it('red takes priority over yellow', () => {
    assert.equal(
      deriveOverallStatus([
        makeResult('a', 'green'),
        makeResult('b', 'yellow'),
        makeResult('c', 'red'),
      ]),
      'red',
    );
  });

  it('returns green for empty array', () => {
    assert.equal(deriveOverallStatus([]), 'green');
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() =>
      deriveOverallStatus(null as unknown as HealthCheckResult[]),
    );
  });
});

// ── buildHealthReport — counts ────────────────────────────────────────────────

describe('buildHealthReport — counts', () => {
  it('counts accurately for all-green', () => {
    const r = buildHealthReport(
      [makeResult('a', 'green'), makeResult('b', 'green')],
      'r1', NOW,
    );
    assert.equal(r.green_count, 2);
    assert.equal(r.yellow_count, 0);
    assert.equal(r.red_count, 0);
  });

  it('counts accurately for mixed', () => {
    const r = buildHealthReport(
      [makeResult('a', 'green'), makeResult('b', 'yellow'), makeResult('c', 'red')],
      'r2', NOW,
    );
    assert.equal(r.green_count, 1);
    assert.equal(r.yellow_count, 1);
    assert.equal(r.red_count, 1);
  });
});

// ── buildHealthReport — overall_status ───────────────────────────────────────

describe('buildHealthReport — overall_status', () => {
  it('green when all green', () => {
    const r = buildHealthReport([makeResult('a', 'green')], 'r3', NOW);
    assert.equal(r.overall_status, 'green');
  });

  it('yellow when some yellow, none red', () => {
    const r = buildHealthReport(
      [makeResult('a', 'green'), makeResult('b', 'yellow')], 'r4', NOW,
    );
    assert.equal(r.overall_status, 'yellow');
  });

  it('red when any red', () => {
    const r = buildHealthReport(
      [makeResult('a', 'yellow'), makeResult('b', 'red')], 'r5', NOW,
    );
    assert.equal(r.overall_status, 'red');
  });
});

// ── buildHealthReport — summary ───────────────────────────────────────────────

describe('buildHealthReport — summary', () => {
  it('all-green summary format', () => {
    const r = buildHealthReport(
      [makeResult('a', 'green'), makeResult('b', 'green'), makeResult('c', 'green')],
      'r6', NOW,
    );
    assert.ok(r.summary.includes('All'), `summary: ${r.summary}`);
    assert.ok(r.summary.includes('3'), `summary: ${r.summary}`);
    assert.ok(r.summary.includes('healthy'), `summary: ${r.summary}`);
  });

  it('yellow summary format', () => {
    const r = buildHealthReport(
      [makeResult('a', 'green'), makeResult('b', 'yellow')], 'r7', NOW,
    );
    assert.ok(r.summary.includes('attention'), `summary: ${r.summary}`);
  });

  it('red summary includes component names', () => {
    const r = buildHealthReport(
      [makeResult('crawler', 'red'), makeResult('b', 'green')], 'r8', NOW,
    );
    assert.ok(r.summary.includes('crawler'), `summary: ${r.summary}`);
    assert.ok(r.summary.includes('failing'), `summary: ${r.summary}`);
  });

  it('red summary with multiple failing components', () => {
    const r = buildHealthReport(
      [makeResult('crawler', 'red'), makeResult('gsc_sync', 'red')], 'r9', NOW,
    );
    assert.ok(r.summary.includes('crawler'));
    assert.ok(r.summary.includes('gsc_sync'));
  });
});

// ── buildHealthReport — other fields ─────────────────────────────────────────

describe('buildHealthReport — other fields', () => {
  it('sets report_id', () => {
    const r = buildHealthReport([], 'my-id', NOW);
    assert.equal(r.report_id, 'my-id');
  });

  it('sets site_id when provided', () => {
    const r = buildHealthReport([], 'r', NOW, 'site-1');
    assert.equal(r.site_id, 'site-1');
  });

  it('sets run_id when provided', () => {
    const r = buildHealthReport([], 'r', NOW, undefined, 'run-1');
    assert.equal(r.run_id, 'run-1');
  });

  it('duration_ms is non-negative', () => {
    const before = Date.now();
    const r = buildHealthReport([], 'r', before);
    assert.ok(r.duration_ms >= 0);
  });

  it('generated_at is a valid ISO string', () => {
    const r = buildHealthReport([], 'r', NOW);
    assert.ok(!isNaN(new Date(r.generated_at).getTime()));
  });

  it('empty results → green with zero counts', () => {
    const r = buildHealthReport([], 'r', NOW);
    assert.equal(r.overall_status, 'green');
    assert.equal(r.green_count, 0);
    assert.equal(r.red_count, 0);
  });

  it('never throws on null results', () => {
    assert.doesNotThrow(() =>
      buildHealthReport(null as unknown as HealthCheckResult[], 'r', NOW),
    );
  });
});
