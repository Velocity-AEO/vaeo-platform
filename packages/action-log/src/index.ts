/**
 * packages/action-log/src/index.ts
 *
 * Central event ledger for the entire VAEO platform.
 * Every system writes here: patch engine, rollback runner, truth-server,
 * validators, crawlee crawler.
 *
 * Design rules:
 *   - writeLog is synchronous from the caller's perspective.
 *   - Supabase write is a non-blocking fire-and-forget promise; never awaited.
 *   - stdout line is always written synchronously before the async path starts.
 *   - If Supabase is unreachable or misconfigured: stderr only, no throw.
 *   - ts is always overwritten to new Date().toISOString() — ignore caller value.
 *   - This module must never throw or crash the calling system.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CmsType } from '../../core/types.js';

// ── ActionLogEntry ────────────────────────────────────────────────────────────

/** Structured audit record written for every VAEO platform event. */
export interface ActionLogEntry {
  /** UUID of the current automation run. */
  run_id: string;
  /** UUID of the tenant (agency or operator) that owns this site. */
  tenant_id: string;
  /** UUID of the site being operated on. */
  site_id: string;
  /** Optional UUID of the specific queue action being executed. */
  action_id?: string;
  /** CMS the command ran against. */
  cms: CmsType;
  /** System that produced this entry (e.g. 'patch-engine', 'rollback-runner'). */
  command: string;
  /** Pipeline stage at which this event was recorded (e.g. 'apply:start'). */
  stage: string;
  /** Terminal status of this stage. */
  status: 'pending' | 'ok' | 'failed' | 'skipped';
  /** Optional URL affected by this operation. */
  url?: string;
  /** Optional field name that was changed (e.g. 'meta_description'). */
  field?: string;
  /** Optional value before the change — used for audit and rollback review. */
  before_value?: string;
  /** Optional value after the change. */
  after_value?: string;
  /** Optional S3/R2 URLs of proof screenshots, snapshots, or validator reports. */
  proof_artifacts?: string[];
  /** Error message when status is 'failed'. */
  error?: string;
  /** Duration of the operation in milliseconds. */
  duration_ms?: number;
  /** Extra context specific to this command or stage. */
  metadata?: Record<string, unknown>;
  /**
   * ISO 8601 timestamp. Always overwritten to new Date().toISOString()
   * by writeLog — do not rely on a caller-supplied value being preserved.
   */
  ts?: string;
}

/** Internal: entry with ts guaranteed present after writeLog stamps it. */
type SealedEntry = Omit<ActionLogEntry, 'ts'> & { ts: string };

// ── Supabase client — lazy singleton ──────────────────────────────────────────

/**
 * undefined  = not yet attempted
 * null       = attempted and failed (Supabase disabled for this process)
 * SupabaseClient = ready to use
 */
let _client: SupabaseClient | null | undefined;

/**
 * Lazily initialises the Supabase service-role client via dynamic config import.
 * Returns null if config is unavailable (e.g. missing env vars in tests).
 * After the first attempt the result is cached for the lifetime of the process.
 */
async function getClient(): Promise<SupabaseClient | null> {
  if (_client !== undefined) return _client;
  try {
    // Dynamic imports so neither supabase-js nor config errors surface at
    // module-load time — action-log must never crash the calling system.
    const [{ createClient }, { config }] = await Promise.all([
      import('@supabase/supabase-js'),
      import('../../core/config.js'),
    ]);
    _client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    });
    return _client;
  } catch (err) {
    process.stderr.write(
      `[action-log] Supabase init failed — DB writes disabled: ${String(err)}\n`,
    );
    _client = null;
    return null;
  }
}

// ── DB row builder ────────────────────────────────────────────────────────────

const TABLE = 'action_log' as const;

/** Maps an ActionLogEntry to action_log column names. Only writes defined fields. */
function toRow(entry: SealedEntry): Record<string, unknown> {
  const row: Record<string, unknown> = {
    run_id:    entry.run_id,
    tenant_id: entry.tenant_id,
    site_id:   entry.site_id,
    cms_type:  entry.cms,         // DB column is cms_type, not cms
    command:   entry.command,
    stage:     entry.stage,
    status:    entry.status,
    ts:        entry.ts,
  };

  // Only include optional fields when they carry a value
  if (entry.action_id    != null) row.action_id    = entry.action_id;
  if (entry.url          != null) row.url          = entry.url;
  if (entry.field        != null) row.field        = entry.field;
  if (entry.before_value != null) row.before_value = entry.before_value;
  if (entry.after_value  != null) row.after_value  = entry.after_value;
  if (entry.proof_artifacts?.length) row.proof_artifacts = entry.proof_artifacts;
  if (entry.error        != null) row.error        = entry.error;
  if (entry.duration_ms  != null) row.duration_ms  = entry.duration_ms;
  if (entry.metadata     != null) row.metadata     = entry.metadata;

  return row;
}

// ── writeLog ──────────────────────────────────────────────────────────────────

/**
 * Writes one structured ActionLogEntry to stdout (always, synchronously) and
 * fires a non-blocking Supabase insert.
 *
 * Stdout format: JSON.stringify(entry) + newline — one compact line per event.
 *
 * The caller NEVER awaits this function. The Supabase path is best-effort:
 * any failure is emitted to stderr and does not propagate to the caller.
 *
 * @example
 * writeLog({
 *   run_id: 'abc', tenant_id: 'xyz', site_id: 'def',
 *   cms: 'shopify', command: 'patch-engine',
 *   stage: 'apply:complete', status: 'ok', duration_ms: 830,
 * });
 */
export function writeLog(entry: ActionLogEntry): void {
  // Stamp ts now — caller-supplied value is discarded
  const sealed: SealedEntry = { ...entry, ts: new Date().toISOString() };

  // ① Synchronous stdout write — no external dependencies, always succeeds
  process.stdout.write(JSON.stringify(sealed) + '\n');

  // ② Non-blocking Supabase insert — fire-and-forget
  void (async () => {
    try {
      const client = await getClient();
      if (!client) return; // already logged to stderr by getClient()

      const { error } = await client.from(TABLE).insert(toRow(sealed));
      if (error) {
        process.stderr.write(
          `[action-log] Supabase insert failed (${sealed.run_id}/${sealed.stage}): ${error.message}\n`,
        );
      }
    } catch (err) {
      process.stderr.write(
        `[action-log] Unexpected error in Supabase write: ${String(err)}\n`,
      );
    }
  })();
}

// ── createLogger ──────────────────────────────────────────────────────────────

/**
 * Returns a pre-configured writeLog with tenant_id, site_id, run_id, and cms
 * already bound. Pass any additional defaults (e.g. command) to avoid
 * repetition across calls from the same system.
 *
 * The returned function accepts all ActionLogEntry fields except the four
 * that are pre-filled — overrides are merged on top of defaults, so the
 * caller can still override any field for a specific event.
 *
 * @example
 * const log = createLogger({
 *   tenant_id: tenantId, site_id: siteId, run_id: runId, cms: 'shopify',
 * });
 * log({ command: 'patch-engine', stage: 'apply:start', status: 'pending' });
 * log({ command: 'patch-engine', stage: 'apply:complete', status: 'ok', duration_ms: 830 });
 */
export function createLogger(
  defaults: Partial<ActionLogEntry>,
): (overrides: Omit<ActionLogEntry, 'tenant_id' | 'site_id' | 'run_id' | 'cms'>) => void {
  return (overrides) => {
    writeLog({ ...defaults, ...overrides } as ActionLogEntry);
  };
}
