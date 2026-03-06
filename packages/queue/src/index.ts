/**
 * packages/queue/src/index.ts
 *
 * Job queue for Velocity AEO using BullMQ and Upstash Redis.
 *
 * One dedicated queue per job type — vaeo:crawl, vaeo:optimize,
 * vaeo:validate, vaeo:monitor, vaeo:rollback. Workers pick jobs up
 * in the background so multiple sites process concurrently without
 * blocking the CLI or each other.
 *
 * Design rules:
 *   - Queue names are prefixed vaeo: to avoid Redis key collisions.
 *   - Redis config is loaded lazily at module init via top-level await.
 *     If config is missing the module still loads (degraded mode).
 *   - addJob / createWorker write to ActionLog on every state change.
 *   - Queue and Worker constructors are injectable for unit tests.
 */

import { Queue, Worker, type Job, type Processor, type WorkerOptions } from 'bullmq';
import Redis from 'ioredis';
import { EventEmitter } from 'node:events';
import type { CmsType } from '../../core/types.js';
import { createLogger } from '../../action-log/src/index.js';

// ── Queue name constants ───────────────────────────────────────────────────────

/** All VAEO queue names. Prefixed vaeo: to prevent Redis key collisions. */
export const QUEUES = {
  CRAWL:    'vaeo:crawl',
  OPTIMIZE: 'vaeo:optimize',
  VALIDATE: 'vaeo:validate',
  MONITOR:  'vaeo:monitor',
  ROLLBACK: 'vaeo:rollback',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ── Interfaces ────────────────────────────────────────────────────────────────

/** Standard payload carried by every VAEO queue job. */
export interface VaeoJob {
  /** UUID of the automation run this job belongs to. */
  run_id:    string;
  /** UUID of the tenant that owns this site. */
  tenant_id: string;
  /** UUID of the site being processed. */
  site_id:   string;
  /** CMS the job runs against. */
  cms:       CmsType;
  /** Job-type-specific data (URLs, patch manifest ref, validator options, etc.). */
  payload:   Record<string, unknown>;
}

/** Options for addJob. */
export interface AddJobOpts {
  /** Job priority: 1 = highest, 10 = lowest. Default: 5. */
  priority?: number;
  /** Delay before the job becomes available, in milliseconds. Default: 0. */
  delay_ms?: number;
  /** Maximum attempts before the job is marked permanently failed. Default: 3. */
  attempts?: number;
}

// ── Retry / backoff config ────────────────────────────────────────────────────

const DEFAULT_ATTEMPTS = 3;

/**
 * Exponential backoff config passed to every BullMQ job.
 * BullMQ formula: delay * 2^(retryCount - 1), with delay = 2000 gives:
 *   attempt 1 → 2 s  (2^1 * 1000)
 *   attempt 2 → 4 s  (2^2 * 1000)
 *   attempt 3 → 8 s  (2^3 * 1000)
 */
export const BACKOFF_CONFIG = {
  type:  'exponential' as const,
  delay: 2000,
} as const;

// ── Redis connection — lazy, loaded at module init ────────────────────────────

interface RedisConnectionOpts {
  host:     string;
  port:     number;
  password: string;
}

/** Populated at module load time. null = degraded mode (no Redis config). */
let _connectionOpts: RedisConnectionOpts | null = null;

/** Cached ioredis instance. Created on first use. */
let _redis: Redis | null = null;

/**
 * Attempts to load REDIS_URL and REDIS_TOKEN from config at module init.
 * Catches and logs any failure so the module still loads (degraded mode).
 * Top-level await — runs once before any exports are used.
 */
_connectionOpts = await (async (): Promise<RedisConnectionOpts | null> => {
  try {
    // Dynamic import so a missing config never throws at module load time.
    const { config } = await import('../../core/config.js');
    const url = new URL(config.redis.url);
    return {
      host:     url.hostname,
      port:     parseInt(url.port || '6380', 10),
      password: config.redis.token,
    };
  } catch {
    process.stderr.write(
      '[queue] Redis config unavailable — queue is in degraded mode.\n' +
      '        Set REDIS_URL and REDIS_TOKEN in Doppler to enable job processing.\n',
    );
    return null;
  }
})();

/**
 * Returns the shared ioredis connection for BullMQ.
 * Returns null when Redis is not configured (degraded mode).
 */
function getConnection(): Redis | null {
  if (_redis) return _redis;
  if (!_connectionOpts) return null;

  _redis = new Redis({
    host:                 _connectionOpts.host,
    port:                 _connectionOpts.port,
    password:             _connectionOpts.password,
    tls:                  {},     // required for Upstash TLS
    maxRetriesPerRequest: null,   // required for BullMQ
    enableReadyCheck:     false,  // recommended for BullMQ
    lazyConnect:          true,   // connect only when the first command is sent
  });

  // Log connection errors to stderr — never throw from here.
  _redis.on('error', (err: Error) => {
    process.stderr.write(`[queue] Redis connection error: ${err.message}\n`);
  });

  return _redis;
}

// ── Injectable types (exposed for unit tests) ─────────────────────────────────

/**
 * Minimal Queue-like interface.
 * The real implementation is a BullMQ Queue; tests inject a fake.
 */
export interface MockQueue {
  add(
    jobName: string,
    data:    VaeoJob,
    opts?:   Record<string, unknown>,
  ): Promise<{ id?: string | null }>;
}

/**
 * Minimal Worker-like interface: EventEmitter with lifecycle methods.
 * The real implementation is a BullMQ Worker; tests inject a fake EventEmitter.
 */
export interface MockWorker {
  on(event: 'completed', handler: (job: Job<VaeoJob>, result: unknown, prev: string) => void): this;
  on(event: 'failed',    handler: (job: Job<VaeoJob> | undefined, err: Error, prev: string) => void): this;
  on(event: 'stalled',   handler: (jobId: string, prev: string) => void): this;
  on(event: 'error',     handler: (err: Error) => void): this;
  on(event: string,      handler: (...args: unknown[]) => void): this;
  close(): Promise<void>;
}

type QueueFactory  = (name: QueueName) => MockQueue;
type WorkerFactory = (
  name:      QueueName,
  processor: Processor<VaeoJob>,
  opts:      WorkerOptions,
) => MockWorker;

/** Injected Queue constructor — null means use real BullMQ. */
let _queueFactory:  QueueFactory  | null = null;

/** Injected Worker constructor — null means use real BullMQ. */
let _workerFactory: WorkerFactory | null = null;

/**
 * Overrides the BullMQ Queue and Worker constructors for testing.
 * Always call _resetFactories() in the test's afterEach / finally block.
 */
export function _injectFactories(overrides: {
  queue?:  QueueFactory;
  worker?: WorkerFactory;
}): void {
  if (overrides.queue  !== undefined) _queueFactory  = overrides.queue;
  if (overrides.worker !== undefined) _workerFactory = overrides.worker;
}

/** Restores real BullMQ constructors. Call after each test. */
export function _resetFactories(): void {
  _queueFactory  = null;
  _workerFactory = null;
}

// ── Queue instance cache ──────────────────────────────────────────────────────

/** One Queue instance per queue name — BullMQ recommends reusing instances. */
const _queueCache = new Map<QueueName, MockQueue>();

/**
 * Returns the cached Queue for the given name.
 * Creates a new one on first use. Uses injected factory when available (tests).
 * Throws if Redis is not configured and no factory is injected.
 */
function getQueue(name: QueueName): MockQueue {
  // Test path: always create via factory (no caching needed in tests)
  if (_queueFactory) return _queueFactory(name);

  const cached = _queueCache.get(name);
  if (cached) return cached;

  const conn = getConnection();
  if (!conn) {
    throw new Error(
      `[queue] Redis not configured — cannot create queue "${name}".\n` +
      '        Set REDIS_URL and REDIS_TOKEN in Doppler.',
    );
  }

  const q = new Queue<VaeoJob>(name, { connection: conn }) as unknown as MockQueue;
  _queueCache.set(name, q);
  return q;
}

// ── addJob ────────────────────────────────────────────────────────────────────

/**
 * Adds a job to the named queue and returns the job_id.
 *
 * Behaviour:
 *   - Writes a queue:added ActionLog entry (status=pending) on success.
 *   - Applies 3-attempt exponential backoff by default.
 *   - Throws if Redis is not configured (REDIS_URL / REDIS_TOKEN missing).
 *
 * @param queueName  One of the QUEUES constants.
 * @param jobData    Standard VaeoJob payload (run_id, tenant_id, site_id, cms, payload).
 * @param opts       Optional priority, delay, and attempt override.
 * @returns          The BullMQ job ID string.
 */
export async function addJob(
  queueName: QueueName,
  jobData:   VaeoJob,
  opts?:     AddJobOpts,
): Promise<string> {
  const log = createLogger({
    run_id:    jobData.run_id,
    tenant_id: jobData.tenant_id,
    site_id:   jobData.site_id,
    cms:       jobData.cms,
    command:   'queue',
  });

  const q = getQueue(queueName);

  const bullOpts = {
    priority: opts?.priority ?? 5,
    delay:    opts?.delay_ms,
    attempts: opts?.attempts ?? DEFAULT_ATTEMPTS,
    backoff:  BACKOFF_CONFIG,
  };

  const job = await q.add(queueName, jobData, bullOpts);
  const jobId = job.id ?? `local-${Date.now()}`;

  log({
    stage:    'queue:added',
    status:   'pending',
    metadata: {
      queue:    queueName,
      job_id:   jobId,
      priority: bullOpts.priority,
      attempts: bullOpts.attempts,
    },
  });

  return jobId;
}

// ── createWorker ──────────────────────────────────────────────────────────────

/**
 * Creates a BullMQ Worker for the named queue and wires up ActionLog events.
 *
 * Event → ActionLog mapping:
 *   completed → stage='queue:complete'  status='ok'     (with duration_ms)
 *   failed    → stage='queue:failed'   status='failed'  (with error message)
 *   stalled   → stage='queue:stalled'  status='failed'
 *   error     → stderr only (internal BullMQ/Redis errors, not job failures)
 *
 * In degraded mode (no Redis config) returns a no-op EventEmitter so the
 * calling code does not crash — jobs just won't be processed.
 *
 * @param queueName  One of the QUEUES constants.
 * @param processor  Async function that receives a BullMQ Job and returns a result.
 * @returns          A MockWorker (real BullMQ Worker or injected fake).
 */
export function createWorker(
  queueName: QueueName,
  processor: (job: Job<VaeoJob>) => Promise<unknown>,
): MockWorker {
  let worker: MockWorker;

  if (_workerFactory) {
    // Test path: use injected factory
    const workerOpts: WorkerOptions = { concurrency: 1 };
    worker = _workerFactory(queueName, processor as Processor<VaeoJob>, workerOpts);
  } else {
    const conn = getConnection();

    if (!conn) {
      // Degraded mode: return a no-op emitter so callers don't crash.
      process.stderr.write(
        `[queue] createWorker: Redis not configured — "${queueName}" worker is disabled.\n`,
      );
      worker = Object.assign(new EventEmitter(), { close: async () => {} }) as MockWorker;
    } else {
      worker = new Worker<VaeoJob>(queueName, processor as Processor<VaeoJob>, {
        connection:  conn,
        concurrency: 1,
      }) as unknown as MockWorker;
    }
  }

  // ── Event listeners ────────────────────────────────────────────────────────

  // Successful job completion
  worker.on('completed', (job: Job<VaeoJob>, _result: unknown, _prev: string) => {
    const elapsed = job.processedOn != null ? Date.now() - job.processedOn : undefined;
    createLogger({
      run_id:    job.data.run_id,
      tenant_id: job.data.tenant_id,
      site_id:   job.data.site_id,
      cms:       job.data.cms,
      command:   'queue',
    })({
      stage:       'queue:complete',
      status:      'ok',
      duration_ms: elapsed,
      metadata:    { queue: queueName, job_id: job.id },
    });
  });

  // Job exhausted all retries
  worker.on('failed', (job: Job<VaeoJob> | undefined, err: Error, _prev: string) => {
    createLogger({
      run_id:    job?.data.run_id    ?? '',
      tenant_id: job?.data.tenant_id ?? '',
      site_id:   job?.data.site_id   ?? '',
      cms:       job?.data.cms       ?? 'shopify',
      command:   'queue',
    })({
      stage:    'queue:failed',
      status:   'failed',
      error:    err.message,
      metadata: { queue: queueName, job_id: job?.id },
    });
  });

  // Job stalled (worker heartbeat missed — job returned to queue or marked failed)
  worker.on('stalled', (jobId: string, _prev: string) => {
    createLogger({
      run_id: '', tenant_id: '', site_id: '',
      cms: 'shopify', command: 'queue',
    })({
      stage:    'queue:stalled',
      status:   'failed',
      error:    `Job stalled: ${jobId}`,
      metadata: { queue: queueName, job_id: jobId },
    });
  });

  // Internal BullMQ / Redis errors (not job-level failures)
  worker.on('error', (err: Error) => {
    process.stderr.write(`[queue] Worker error on "${queueName}": ${err.message}\n`);
  });

  return worker;
}
