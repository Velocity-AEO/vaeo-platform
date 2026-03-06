/**
 * packages/action-log/src/index.test.ts
 *
 * Unit tests for writeLog and createLogger.
 * No real Supabase connection required — config env vars are absent in test
 * env, so getClient() will catch the import error and return null.
 * The Supabase path is therefore a no-op here; tests focus on:
 *   1. stdout is written synchronously
 *   2. writeLog never throws — even when Supabase is unreachable
 *   3. createLogger pre-fills bound fields on every call
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeLog, createLogger, type ActionLogEntry } from './index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Temporarily replaces process.stdout.write, runs fn(), restores it, and
 * returns every string chunk that was written during fn().
 */
function captureStdout(fn: () => void): string[] {
  const captured: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return captured;
}

const BASE: ActionLogEntry = {
  run_id:    'run-test-001',
  tenant_id: 'tenant-aaa',
  site_id:   'site-bbb',
  cms:       'shopify',
  command:   'test-command',
  stage:     'test:start',
  status:    'pending',
};

// ── writeLog ──────────────────────────────────────────────────────────────────

describe('writeLog', () => {
  it('writes exactly one JSON line to stdout synchronously', () => {
    const lines = captureStdout(() => writeLog(BASE));

    assert.equal(lines.length, 1, 'expected one stdout line');

    // Must end with newline
    assert.ok(lines[0].endsWith('\n'), 'line must end with \\n');

    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(parsed['run_id'],    BASE.run_id);
    assert.equal(parsed['tenant_id'], BASE.tenant_id);
    assert.equal(parsed['site_id'],   BASE.site_id);
    assert.equal(parsed['cms'],       BASE.cms);
    assert.equal(parsed['command'],   BASE.command);
    assert.equal(parsed['stage'],     BASE.stage);
    assert.equal(parsed['status'],    BASE.status);
  });

  it('always stamps ts with current ISO timestamp, ignoring caller value', () => {
    const before = Date.now();
    const lines = captureStdout(() =>
      writeLog({ ...BASE, ts: '1970-01-01T00:00:00.000Z' }),
    );
    const after = Date.now();

    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    const ts = new Date(parsed['ts'] as string).getTime();

    assert.ok(ts >= before, 'ts must be >= test start');
    assert.ok(ts <= after,  'ts must be <= test end');
  });

  it('includes optional fields when provided', () => {
    const lines = captureStdout(() =>
      writeLog({
        ...BASE,
        url:             'https://example.com/page',
        field:           'meta_description',
        before_value:    'Old description',
        after_value:     'New description',
        proof_artifacts: ['s3://bucket/snap.png'],
        duration_ms:     142,
        error:           undefined,
        metadata:        { confidence: 'safe' },
      }),
    );
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(parsed['url'],          'https://example.com/page');
    assert.equal(parsed['field'],        'meta_description');
    assert.equal(parsed['before_value'], 'Old description');
    assert.equal(parsed['after_value'],  'New description');
    assert.equal(parsed['duration_ms'],  142);
    assert.deepEqual(parsed['proof_artifacts'], ['s3://bucket/snap.png']);
    assert.deepEqual(parsed['metadata'], { confidence: 'safe' });
  });

  it('does NOT throw when Supabase is unreachable (config env vars absent)', async () => {
    // Config env vars are not set in the test environment.
    // getClient() will catch the import error and set _client = null.
    assert.doesNotThrow(() => {
      writeLog({ ...BASE, stage: 'test:supabase-unreachable', status: 'ok' });
    });

    // Allow the fire-and-forget async path time to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    // If we reach here without an unhandledRejection the test passes.
  });

  it('does NOT throw when called with only required fields', () => {
    assert.doesNotThrow(() => {
      writeLog({
        run_id: 'r', tenant_id: 't', site_id: 's',
        cms: 'wordpress', command: 'minimal', stage: 'x', status: 'skipped',
      });
    });
  });
});

// ── createLogger ──────────────────────────────────────────────────────────────

describe('createLogger', () => {
  it('pre-fills tenant_id, site_id, run_id, and cms on every call', () => {
    const log = createLogger({
      tenant_id: 'bound-tenant',
      site_id:   'bound-site',
      run_id:    'bound-run',
      cms:       'shopify',
    });

    const lines = captureStdout(() => {
      log({ command: 'patch-engine', stage: 'apply:start',    status: 'pending' });
      log({ command: 'patch-engine', stage: 'apply:complete', status: 'ok', duration_ms: 42 });
    });

    assert.equal(lines.length, 2);

    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      assert.equal(parsed['tenant_id'], 'bound-tenant', 'tenant_id must be pre-filled');
      assert.equal(parsed['site_id'],   'bound-site',   'site_id must be pre-filled');
      assert.equal(parsed['run_id'],    'bound-run',    'run_id must be pre-filled');
      assert.equal(parsed['cms'],       'shopify',      'cms must be pre-filled');
    }

    const first  = JSON.parse(lines[0]) as Record<string, unknown>;
    const second = JSON.parse(lines[1]) as Record<string, unknown>;
    assert.equal(first['stage'],       'apply:start');
    assert.equal(second['stage'],      'apply:complete');
    assert.equal(second['duration_ms'], 42);
  });

  it('allows per-call override of bound fields when necessary', () => {
    const log = createLogger({ tenant_id: 't', site_id: 's', run_id: 'r', cms: 'shopify' });

    const lines = captureStdout(() => {
      // Override cms for a specific call
      log({ command: 'migrator', stage: 'cms:override', status: 'ok', cms: 'wordpress' });
    });

    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(parsed['cms'], 'wordpress', 'per-call override must win');
  });

  it('pre-fills command when provided as a default', () => {
    const log = createLogger({
      tenant_id: 't', site_id: 's', run_id: 'r', cms: 'shopify',
      command: 'truth-server',
    });

    const lines = captureStdout(() => {
      log({ stage: 'snapshot:start', status: 'pending' });
    });

    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(parsed['command'], 'truth-server');
  });
});
