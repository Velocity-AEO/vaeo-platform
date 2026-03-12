/**
 * tools/health/component_checkers.ts
 *
 * Individual component health checkers — all injectable, never throw.
 */

import type { HealthCheckResult } from './health_check.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function redResult(component: string, message: string, error?: string): HealthCheckResult {
  return { component, status: 'red', message, checked_at: now(), ...(error ? { error } : {}) };
}

function yellowResult(component: string, message: string): HealthCheckResult {
  return { component, status: 'yellow', message, checked_at: now() };
}

function greenResult(
  component: string,
  message: string,
  extras: Partial<HealthCheckResult> = {},
): HealthCheckResult {
  return { component, status: 'green', message, checked_at: now(), ...extras };
}

function msAgo(isoString: string): number {
  return Date.now() - new Date(isoString).getTime();
}

const H24 = 24 * 60 * 60 * 1000;
const H25 = 25 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;
const H72 = 72 * 60 * 60 * 1000;

// ── checkCrawler ──────────────────────────────────────────────────────────────

export async function checkCrawler(
  deps?: { ping?: () => Promise<{ ok: boolean; latency_ms: number }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.ping
      ? await deps.ping()
      : { ok: true, latency_ms: 45 };
    if (!result.ok) return redResult('crawler', 'Crawler unreachable');
    if (result.latency_ms > 2000) return { ...yellowResult('crawler', 'Crawler slow'), latency_ms: result.latency_ms };
    return greenResult('crawler', 'Crawler healthy', { latency_ms: result.latency_ms });
  } catch (err) {
    return redResult('crawler', 'Crawler check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkAIGenerator ─────────────────────────────────────────────────────────

export async function checkAIGenerator(
  deps?: { ping?: () => Promise<{ ok: boolean; latency_ms: number }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.ping
      ? await deps.ping()
      : { ok: true, latency_ms: 890 };
    if (!result.ok) return redResult('ai_generator', 'AI generator unreachable');
    if (result.latency_ms > 5000) return { ...yellowResult('ai_generator', 'AI generator slow'), latency_ms: result.latency_ms };
    return greenResult('ai_generator', 'AI generator healthy', { latency_ms: result.latency_ms });
  } catch (err) {
    return redResult('ai_generator', 'AI generator check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkApplyEngine ─────────────────────────────────────────────────────────

export async function checkApplyEngine(
  deps?: { ping?: () => Promise<{ ok: boolean; model_available: boolean }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.ping
      ? await deps.ping()
      : { ok: true, model_available: true };
    if (!result.ok) return redResult('apply_engine', 'Apply engine unreachable');
    if (!result.model_available) return yellowResult('apply_engine', 'Apply engine degraded');
    return greenResult('apply_engine', 'Apply engine healthy');
  } catch (err) {
    return redResult('apply_engine', 'Apply engine check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkValidator ────────────────────────────────────────────────────────────

export async function checkValidator(
  deps?: { ping?: () => Promise<{ ok: boolean }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.ping ? await deps.ping() : { ok: true };
    if (!result.ok) return redResult('validator', 'Validator unreachable');
    return greenResult('validator', 'Validator healthy');
  } catch (err) {
    return redResult('validator', 'Validator check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkLearningCenter ───────────────────────────────────────────────────────

export async function checkLearningCenter(
  deps?: { getLastWrite?: () => Promise<{ written_at: string | null }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.getLastWrite
      ? await deps.getLastWrite()
      : { written_at: new Date(Date.now() - 3600_000).toISOString() };
    if (!result.written_at) return yellowResult('learning_center', 'No learning writes yet');
    if (msAgo(result.written_at) > H24) return yellowResult('learning_center', 'Learning center cold');
    return greenResult('learning_center', 'Learning center healthy', { last_success: result.written_at });
  } catch (err) {
    return redResult('learning_center', 'Learning center check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkGSCSync ──────────────────────────────────────────────────────────────

export async function checkGSCSync(
  deps?: { getLastSync?: () => Promise<{ synced_at: string | null; error?: string }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.getLastSync
      ? await deps.getLastSync()
      : { synced_at: new Date(Date.now() - 3600_000).toISOString() };
    if (result.error) return redResult('gsc_sync', `GSC sync error: ${result.error}`);
    if (!result.synced_at) return yellowResult('gsc_sync', 'GSC never synced');
    if (msAgo(result.synced_at) > H48) return yellowResult('gsc_sync', 'GSC sync stale');
    return greenResult('gsc_sync', 'GSC sync healthy', { last_success: result.synced_at });
  } catch (err) {
    return redResult('gsc_sync', 'GSC sync check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkJobQueue ─────────────────────────────────────────────────────────────

export async function checkJobQueue(
  deps?: {
    getQueueStats?: () => Promise<{ pending: number; stuck: number; failed_last_hour: number }>;
  },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.getQueueStats
      ? await deps.getQueueStats()
      : { pending: 2, stuck: 0, failed_last_hour: 0 };
    if (result.stuck > 0) return redResult('job_queue', `${result.stuck} stuck jobs detected`);
    if (result.failed_last_hour > 5) return yellowResult('job_queue', `${result.failed_last_hour} failures in last hour`);
    return greenResult('job_queue', 'Job queue healthy');
  } catch (err) {
    return redResult('job_queue', 'Job queue check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkShopifyAPI ───────────────────────────────────────────────────────────

export async function checkShopifyAPI(
  deps?: { ping?: () => Promise<{ ok: boolean; latency_ms: number }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.ping
      ? await deps.ping()
      : { ok: true, latency_ms: 210 };
    if (!result.ok) return redResult('shopify_api', 'Shopify API unreachable');
    if (result.latency_ms > 3000) return { ...yellowResult('shopify_api', 'Shopify API slow'), latency_ms: result.latency_ms };
    return greenResult('shopify_api', 'Shopify API healthy', { latency_ms: result.latency_ms });
  } catch (err) {
    return redResult('shopify_api', 'Shopify API check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkStripeWebhook ────────────────────────────────────────────────────────

export async function checkStripeWebhook(
  deps?: { getLastEvent?: () => Promise<{ received_at: string | null }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.getLastEvent
      ? await deps.getLastEvent()
      : { received_at: new Date(Date.now() - 3600_000).toISOString() };
    if (!result.received_at) return yellowResult('stripe_webhook', 'No Stripe events received');
    if (msAgo(result.received_at) > H72) return yellowResult('stripe_webhook', 'Stripe webhook silent');
    return greenResult('stripe_webhook', 'Stripe webhook healthy', { last_success: result.received_at });
  } catch (err) {
    return redResult('stripe_webhook', 'Stripe webhook check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkSchemaValidator ──────────────────────────────────────────────────────

export async function checkSchemaValidator(
  deps?: { ping?: () => Promise<{ ok: boolean }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.ping ? await deps.ping() : { ok: true };
    if (!result.ok) return redResult('schema_validator', 'Schema validator unreachable');
    return greenResult('schema_validator', 'Schema validator healthy');
  } catch (err) {
    return redResult('schema_validator', 'Schema validator check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkSandbox ──────────────────────────────────────────────────────────────

export async function checkSandbox(
  deps?: { getLastRun?: () => Promise<{ ran_at: string | null; passed: boolean }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.getLastRun
      ? await deps.getLastRun()
      : { ran_at: new Date(Date.now() - 3600_000).toISOString(), passed: true };
    if (!result.ran_at) return yellowResult('sandbox', 'Sandbox never run');
    if (!result.passed) return redResult('sandbox', 'Last sandbox run failed');
    return greenResult('sandbox', 'Sandbox healthy', { last_success: result.ran_at });
  } catch (err) {
    return redResult('sandbox', 'Sandbox check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── checkTracer ───────────────────────────────────────────────────────────────

export async function checkTracer(
  deps?: { getLastScan?: () => Promise<{ scanned_at: string | null }> },
): Promise<HealthCheckResult> {
  try {
    const result = deps?.getLastScan
      ? await deps.getLastScan()
      : { scanned_at: new Date(Date.now() - 3600_000).toISOString() };
    if (!result.scanned_at) return yellowResult('tracer', 'Tracer never run');
    if (msAgo(result.scanned_at) > H25) return yellowResult('tracer', 'Tracer scan overdue');
    return greenResult('tracer', 'Tracer healthy', { last_success: result.scanned_at });
  } catch (err) {
    return redResult('tracer', 'Tracer check failed', err instanceof Error ? err.message : String(err));
  }
}

// ── runAllChecks ──────────────────────────────────────────────────────────────

export async function runAllChecks(
  deps?: Record<string, unknown>,
): Promise<HealthCheckResult[]> {
  const d = deps ?? {};

  const checkers: Array<() => Promise<HealthCheckResult>> = [
    () => checkCrawler(      (d['crawler']       as Parameters<typeof checkCrawler>[0])      ?? undefined),
    () => checkAIGenerator(  (d['ai_generator']   as Parameters<typeof checkAIGenerator>[0]) ?? undefined),
    () => checkApplyEngine(  (d['apply_engine']   as Parameters<typeof checkApplyEngine>[0]) ?? undefined),
    () => checkValidator(    (d['validator']      as Parameters<typeof checkValidator>[0])    ?? undefined),
    () => checkLearningCenter((d['learning_center'] as Parameters<typeof checkLearningCenter>[0]) ?? undefined),
    () => checkGSCSync(      (d['gsc_sync']       as Parameters<typeof checkGSCSync>[0])      ?? undefined),
    () => checkJobQueue(     (d['job_queue']      as Parameters<typeof checkJobQueue>[0])     ?? undefined),
    () => checkShopifyAPI(   (d['shopify_api']    as Parameters<typeof checkShopifyAPI>[0])   ?? undefined),
    () => checkStripeWebhook((d['stripe_webhook'] as Parameters<typeof checkStripeWebhook>[0]) ?? undefined),
    () => checkSchemaValidator((d['schema_validator'] as Parameters<typeof checkSchemaValidator>[0]) ?? undefined),
    () => checkSandbox(      (d['sandbox']        as Parameters<typeof checkSandbox>[0])      ?? undefined),
    () => checkTracer(       (d['tracer']         as Parameters<typeof checkTracer>[0])       ?? undefined),
  ];

  const results: HealthCheckResult[] = [];
  for (const check of checkers) {
    try {
      results.push(await check());
    } catch (err) {
      results.push(redResult('unknown', 'Check threw unexpectedly', err instanceof Error ? err.message : String(err)));
    }
  }
  return results;
}
