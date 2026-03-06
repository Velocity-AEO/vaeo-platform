/**
 * packages/queue/src/index.test.ts
 *
 * Unit tests for the VAEO job queue.
 * No real Redis connection required — BullMQ Queue and Worker are injected
 * via _injectFactories() / _resetFactories().
 *
 * Tests confirm:
 *   1. addJob returns a job_id and writes queue:added to ActionLog stdout.
 *   2. createWorker processes a job and writes queue:complete to ActionLog.
 *   3. Failed job writes queue:failed with the error message to ActionLog.
 *   4. Stalled job writes queue:stalled to ActionLog.
 *   5. BACKOFF_CONFIG encodes exponential delay = 2^attempt * 1000ms.
 *   6. addJob passes the backoff config to the underlying queue.add() call.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Job } from 'bullmq';

import {
  QUEUES,
  BACKOFF_CONFIG,
  addJob,
  createWorker,
  _injectFactories,
  _resetFactories,
  type VaeoJob,
  type MockQueue,
  type MockWorker,
} from './index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Intercepts process.stdout.write and returns captured lines. */
async function captureStdout(fn: () => Promise<void>): Promise<string[]> {
  const captured: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return captured;
}

/** Parses all captured stdout lines as JSON, skipping non-JSON lines. */
function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return [];
    try {
      return [JSON.parse(trimmed) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

/** A baseline VaeoJob used across tests. */
const BASE_JOB: VaeoJob = {
  run_id:    'run-queue-001',
  tenant_id: 'tenant-aaa',
  site_id:   'site-bbb',
  cms:       'shopify',
  payload:   { target_url: 'https://example.com' },
};

/** Creates a minimal BullMQ Job-like object for event simulation. */
function fakeJob(id: string, data: VaeoJob = BASE_JOB): Job<VaeoJob> {
  return {
    id,
    data,
    processedOn: Date.now() - 120,  // pretend it took 120ms
  } as unknown as Job<VaeoJob>;
}

// ── Test: addJob ──────────────────────────────────────────────────────────────

describe('addJob', () => {
  afterEach(() => _resetFactories());

  it('returns a job_id from the queue', async () => {
    const capturedOpts: Record<string, unknown>[] = [];

    const mockQueue: MockQueue = {
      async add(_name, _data, opts) {
        capturedOpts.push(opts ?? {});
        return { id: 'job-test-001' };
      },
    };
    _injectFactories({ queue: () => mockQueue });

    const jobId = await addJob(QUEUES.CRAWL, BASE_JOB);
    assert.equal(jobId, 'job-test-001');
  });

  it('writes a queue:added ActionLog entry to stdout', async () => {
    _injectFactories({
      queue: () => ({ add: async () => ({ id: 'job-test-002' }) }),
    });

    const lines = await captureStdout(async () => {
      await addJob(QUEUES.CRAWL, BASE_JOB);
    });

    const entries = parseLines(lines);
    assert.ok(entries.length >= 1, 'expected at least one ActionLog entry');

    const entry = entries.find((e) => e['stage'] === 'queue:added');
    assert.ok(entry, 'expected a queue:added entry');
    assert.equal(entry['status'],    'pending');
    assert.equal(entry['run_id'],    BASE_JOB.run_id);
    assert.equal(entry['tenant_id'], BASE_JOB.tenant_id);
    assert.equal(entry['site_id'],   BASE_JOB.site_id);
    assert.equal(entry['cms'],       BASE_JOB.cms);
    assert.equal(entry['command'],   'queue');
    assert.ok(entry['ts'],           'ts must be set');

    const meta = entry['metadata'] as Record<string, unknown>;
    assert.equal(meta['queue'],  QUEUES.CRAWL);
    assert.equal(meta['job_id'], 'job-test-002');
  });

  it('passes exponential backoff config to queue.add()', async () => {
    const capturedOpts: Record<string, unknown>[] = [];

    _injectFactories({
      queue: () => ({
        add: async (_name: string, _data: VaeoJob, opts?: Record<string, unknown>) => {
          if (opts) capturedOpts.push(opts);
          return { id: 'job-test-003' };
        },
      }),
    });

    await addJob(QUEUES.OPTIMIZE, BASE_JOB, { priority: 2, attempts: 5 });

    assert.equal(capturedOpts.length, 1);
    const opts = capturedOpts[0];

    // Verify backoff object matches BACKOFF_CONFIG
    const backoff = opts['backoff'] as Record<string, unknown>;
    assert.equal(backoff['type'],  'exponential');
    assert.equal(backoff['delay'], 2000,
      'delay=2000 gives 2s/4s/8s: matches 2^attempt * 1000ms');

    assert.equal(opts['attempts'], 5,   'custom attempts respected');
    assert.equal(opts['priority'], 2,   'custom priority respected');
  });

  it('generates a fallback job_id when queue returns no id', async () => {
    _injectFactories({
      queue: () => ({ add: async () => ({ id: null }) }),
    });

    const jobId = await addJob(QUEUES.ROLLBACK, BASE_JOB);
    assert.ok(jobId.startsWith('local-'), 'fallback id must start with local-');
  });
});

// ── Test: createWorker ────────────────────────────────────────────────────────

describe('createWorker', () => {
  afterEach(() => _resetFactories());

  it('writes queue:complete to ActionLog when a job completes', async () => {
    const workerEmitter = new EventEmitter();
    _injectFactories({
      worker: () => Object.assign(workerEmitter, { close: async () => {} }) as MockWorker,
    });

    createWorker(QUEUES.CRAWL, async () => ({ done: true }));

    const lines = await captureStdout(async () => {
      workerEmitter.emit('completed', fakeJob('job-101'), { done: true }, 'active');
    });

    const entries = parseLines(lines);
    const entry = entries.find((e) => e['stage'] === 'queue:complete');
    assert.ok(entry, 'expected a queue:complete entry');
    assert.equal(entry['status'],  'ok');
    assert.equal(entry['command'], 'queue');
    assert.ok(
      typeof entry['duration_ms'] === 'number',
      'duration_ms must be a number',
    );

    const meta = entry['metadata'] as Record<string, unknown>;
    assert.equal(meta['job_id'], 'job-101');
    assert.equal(meta['queue'],  QUEUES.CRAWL);
  });

  it('writes queue:failed to ActionLog when a job fails', async () => {
    const workerEmitter = new EventEmitter();
    _injectFactories({
      worker: () => Object.assign(workerEmitter, { close: async () => {} }) as MockWorker,
    });

    createWorker(QUEUES.OPTIMIZE, async () => { throw new Error('patch failed'); });

    const failedJob = fakeJob('job-202');
    const failError = new Error('Shopify rate limit exceeded');

    const lines = await captureStdout(async () => {
      workerEmitter.emit('failed', failedJob, failError, 'active');
    });

    const entries = parseLines(lines);
    const entry = entries.find((e) => e['stage'] === 'queue:failed');
    assert.ok(entry, 'expected a queue:failed entry');
    assert.equal(entry['status'], 'failed');
    assert.equal(entry['error'],  'Shopify rate limit exceeded');

    const meta = entry['metadata'] as Record<string, unknown>;
    assert.equal(meta['job_id'], 'job-202');
  });

  it('writes queue:stalled to ActionLog when a job stalls', async () => {
    const workerEmitter = new EventEmitter();
    _injectFactories({
      worker: () => Object.assign(workerEmitter, { close: async () => {} }) as MockWorker,
    });

    createWorker(QUEUES.VALIDATE, async () => ({}));

    const lines = await captureStdout(async () => {
      workerEmitter.emit('stalled', 'job-303', 'active');
    });

    const entries = parseLines(lines);
    const entry = entries.find((e) => e['stage'] === 'queue:stalled');
    assert.ok(entry, 'expected a queue:stalled entry');
    assert.equal(entry['status'], 'failed');
    assert.ok((entry['error'] as string).includes('job-303'));
  });
});

// ── Test: BACKOFF_CONFIG ──────────────────────────────────────────────────────

describe('BACKOFF_CONFIG', () => {
  it('is exponential type', () => {
    assert.equal(BACKOFF_CONFIG.type, 'exponential');
  });

  it('delay=2000 produces the correct 2^attempt * 1000ms sequence', () => {
    // BullMQ formula: delay * 2^(retryCount - 1)
    const delay = BACKOFF_CONFIG.delay; // 2000
    assert.equal(delay * Math.pow(2, 0), 2000, 'attempt 1: 2^1 * 1000 = 2000ms');
    assert.equal(delay * Math.pow(2, 1), 4000, 'attempt 2: 2^2 * 1000 = 4000ms');
    assert.equal(delay * Math.pow(2, 2), 8000, 'attempt 3: 2^3 * 1000 = 8000ms');
  });
});

// ── Test: QUEUES constants ────────────────────────────────────────────────────

describe('QUEUES', () => {
  it('all queue names are prefixed with vaeo:', () => {
    for (const name of Object.values(QUEUES)) {
      assert.ok(name.startsWith('vaeo:'), `"${name}" must start with vaeo:`);
    }
  });

  it('defines the five required queues', () => {
    assert.equal(QUEUES.CRAWL,    'vaeo:crawl');
    assert.equal(QUEUES.OPTIMIZE, 'vaeo:optimize');
    assert.equal(QUEUES.VALIDATE, 'vaeo:validate');
    assert.equal(QUEUES.MONITOR,  'vaeo:monitor');
    assert.equal(QUEUES.ROLLBACK, 'vaeo:rollback');
  });
});
