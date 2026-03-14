/**
 * packages/patch-engine/src/rollback-runner.ts
 *
 * Standalone rollback executor — can be called directly from the CLI
 * without needing a full PatchEngine instance.
 *
 * Two jobs:
 *   executeRollback — finds the undo record, loads the right adapter,
 *                     reverses every change in reverse order, confirms done.
 *   verifyRollback  — after rollback completes, calls fetch_state and checks
 *                     that every field actually went back to its original value.
 *
 * Design rules:
 *   - Never call process.env directly — use packages/core/config.ts
 *   - Every Supabase query includes tenant_id — no cross-tenant access
 *   - All errors logged to ActionLog before throwing — complete audit trail
 *   - Target: under 5 minutes for 50 fields (adapter is the bottleneck, not us)
 */

// Inline structural type — avoids a hard dependency on @supabase/supabase-js
type SupabaseClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
import type {
  CMSAdapter,
  PatchManifest,
  PatchEntry,
  ActionLogEvent,
  CmsType,
} from '../../../packages/core/types.js';

// ── Table name constant ───────────────────────────────────────────────────────

const TABLE_ROLLBACK_MANIFESTS = 'rollback_manifests' as const;

// ── Types that mirror the rollback_manifests DB schema ───────────────────────

type ManifestStatus = 'pending' | 'partial' | 'applied' | 'rolled_back' | 'failed_rollback';

interface RollbackPatchEntry {
  idempotency_key: string;
  url: string;
  field: string;
  before_value: string | null;
  after_value: string;
  applied: boolean;
}

interface RollbackManifestRow {
  manifest_id: string;
  run_id: string;
  tenant_id: string;
  site_id: string;
  cms_type: CmsType;
  patches: RollbackPatchEntry[];
  status: ManifestStatus;
  created_at: string;
}

// ── Public return types ───────────────────────────────────────────────────────

/** Returned by executeRollback() on success. */
export interface ExecuteRollbackResult {
  success: true;
  run_id: string;
  fields_reversed: number;
  time_ms: number;
}

/** Returned by verifyRollback(). */
export interface VerifyRollbackResult {
  verified: boolean;
  /** Field identifiers (field@url) that did not restore correctly. */
  mismatches: string[];
}

// ── ActionLog ─────────────────────────────────────────────────────────────────

/**
 * Emits one ActionLogEvent line to stdout.
 * The platform log aggregator picks these up — the runner just emits them.
 */
function writeLog(
  overrides: Partial<ActionLogEvent> &
    Pick<ActionLogEvent, 'run_id' | 'site_id' | 'stage' | 'status'>,
): void {
  const event: ActionLogEvent = {
    tenant_id: '',
    cms: 'shopify',
    command: 'rollback-runner',
    urls: [],
    proof_artifacts: [],
    before_metrics: null,
    after_metrics: null,
    ts: new Date().toISOString(),
    ...overrides,
  };
  process.stdout.write(JSON.stringify(event) + '\n');
}

// ── Supabase factory ──────────────────────────────────────────────────────────

/**
 * Creates a service-role Supabase client using dynamic imports so that
 * neither @supabase/supabase-js nor config.ts are loaded at module-load time.
 */
async function makeSupabase(): Promise<SupabaseClient> {
  const [{ createClient }, { config }] = await Promise.all([
    import('@supabase/supabase-js'),
    import('../../../packages/core/config.js'),
  ]);
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// ── Adapter factory ───────────────────────────────────────────────────────────

/**
 * Returns the correct CMS adapter based on the cms_type stored in the manifest.
 * Adapters are imported dynamically so their static imports (e.g. Shopify's
 * config.ts import) do not participate in the module-load cycle.
 */
async function adapterForCms(cmsType: CmsType): Promise<CMSAdapter> {
  if (cmsType === 'shopify') {
    const { ShopifyAdapter } = await import('../../adapters/shopify/src/index.js');
    return new ShopifyAdapter();
  }
  if (cmsType === 'wordpress') {
    const { WordPressAdapter } = await import('../../adapters/wordpress/src/index.js');
    return new WordPressAdapter();
  }
  throw new Error(`[rollback-runner] Unknown cms_type: ${String(cmsType)}`);
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

/**
 * Fetches the rollback manifest row for a given run_id + tenant_id.
 * Always includes tenant_id in the WHERE clause — no cross-tenant access.
 * Throws with a clear message if not found.
 */
async function fetchManifest(
  supabase: SupabaseClient,
  runId: string,
  tenantId: string,
): Promise<RollbackManifestRow> {
  const { data, error } = await supabase
    .from(TABLE_ROLLBACK_MANIFESTS)
    .select('*')
    .eq('run_id', runId)
    .eq('tenant_id', tenantId)
    .single();

  if (error) {
    throw new Error(
      `[rollback-runner] Supabase error fetching manifest for run ${runId}: ${error.message}`,
    );
  }
  if (!data) {
    throw new Error(`[rollback-runner] No manifest found for run_id ${runId}`);
  }

  return data as RollbackManifestRow;
}

/**
 * Updates the status column of the manifest row.
 * Throws if the update fails — a stale status would break idempotency checks.
 */
async function setManifestStatus(
  supabase: SupabaseClient,
  manifestId: string,
  tenantId: string,
  status: ManifestStatus,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE_ROLLBACK_MANIFESTS)
    .update({ status })
    .eq('manifest_id', manifestId)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(
      `[rollback-runner] Failed to set manifest ${manifestId} status="${status}": ${error.message}`,
    );
  }
}

// ── executeRollback ───────────────────────────────────────────────────────────

/**
 * Finds the undo record for a run, loads the right CMS adapter, and reverses
 * every change in reverse order — last patch applied is the first reversed.
 *
 * Guards:
 *   - Already rolled back → logs and returns early (idempotent).
 *   - Never applied (status=pending) → throws: nothing to undo.
 *
 * On any failure during reversal: sets manifest status to 'failed_rollback',
 * logs the full error, and throws so the caller can alert the operator.
 */
export async function executeRollback(
  runId: string,
  tenantId: string,
): Promise<ExecuteRollbackResult> {
  const startMs = Date.now();
  const supabase = await makeSupabase();

  writeLog({ run_id: runId, site_id: '', stage: 'rollback:start', status: 'pending' });

  // ── Fetch manifest ─────────────────────────────────────────────────────────

  let row: RollbackManifestRow;
  try {
    row = await fetchManifest(supabase, runId, tenantId);
  } catch (err) {
    writeLog({ run_id: runId, site_id: '', stage: 'rollback:fetch_error', status: 'error' });
    throw err;
  }

  const { manifest_id, site_id, cms_type, patches, status } = row;

  // ── Status guards ──────────────────────────────────────────────────────────

  if (status === 'rolled_back') {
    writeLog({
      run_id: runId,
      site_id,
      cms: cms_type,
      stage: 'rollback:skipped',
      status: 'skipped',
    });
    // Return a valid result — caller can print "already done"
    return { success: true, run_id: runId, fields_reversed: 0, time_ms: Date.now() - startMs };
  }

  if (status === 'pending') {
    writeLog({ run_id: runId, site_id, cms: cms_type, stage: 'rollback:invalid_status', status: 'error' });
    throw new Error(
      `[rollback-runner] Manifest was never applied — nothing to roll back (run_id=${runId}, status=pending)`,
    );
  }

  if (status !== 'applied' && status !== 'partial') {
    throw new Error(
      `[rollback-runner] Cannot roll back manifest with status="${status}" (run_id=${runId})`,
    );
  }

  // ── Load adapter and reverse patches ──────────────────────────────────────

  const adapter = await adapterForCms(cms_type);

  // Only reverse patches that were actually applied — in reverse order
  const toReverse = patches.filter((p) => p.applied).reverse();

  if (toReverse.length === 0) {
    writeLog({ run_id: runId, site_id, cms: cms_type, stage: 'rollback:nothing_to_reverse', status: 'ok' });
    await setManifestStatus(supabase, manifest_id, tenantId, 'rolled_back');
    return { success: true, run_id: runId, fields_reversed: 0, time_ms: Date.now() - startMs };
  }

  // Build a base PatchManifest for adapter calls
  const manifestBase: PatchManifest = {
    run_id: runId,
    site_id,
    cms: cms_type,
    patches: [],
    backup_ref: '',
  };

  let fieldsReversed = 0;
  const errors: string[] = [];

  for (const entry of toReverse) {
    if (entry.before_value === null) {
      // Field didn't exist before the patch — nothing to restore
      continue;
    }

    const reversePatch: PatchEntry = {
      idempotency_key: `rollback:${entry.idempotency_key}`,
      url: entry.url,
      field: entry.field,
      before_value: entry.after_value,
      after_value: entry.before_value,   // restore the original value
      confidence: 'safe',
    };

    try {
      await adapter.apply_patch({ ...manifestBase, patches: [reversePatch] });

      fieldsReversed++;

      writeLog({
        run_id: runId,
        site_id,
        cms: cms_type,
        stage: `rollback:field_reversed:${entry.idempotency_key}`,
        status: 'ok',
        urls: [entry.url],
      });
    } catch (err) {
      const msg = `"${entry.field}" on ${entry.url}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);

      writeLog({
        run_id: runId,
        site_id,
        cms: cms_type,
        stage: `rollback:field_error:${entry.idempotency_key}`,
        status: 'error',
        urls: [entry.url],
      });
    }
  }

  // ── Handle partial or complete failure ────────────────────────────────────

  if (errors.length > 0) {
    await setManifestStatus(supabase, manifest_id, tenantId, 'failed_rollback');

    const summary = errors.map((e) => `  - ${e}`).join('\n');
    writeLog({
      run_id: runId,
      site_id,
      cms: cms_type,
      stage: 'rollback:failed',
      status: 'error',
    });

    throw new Error(
      `[rollback-runner] Rollback failed for run ${runId}.\n` +
      `  ${fieldsReversed} field(s) reversed, ${errors.length} failed:\n${summary}`,
    );
  }

  // ── Mark complete ─────────────────────────────────────────────────────────

  await setManifestStatus(supabase, manifest_id, tenantId, 'rolled_back');

  const time_ms = Date.now() - startMs;

  writeLog({
    run_id: runId,
    site_id,
    cms: cms_type,
    stage: 'rollback:complete',
    status: 'ok',
    proof_artifacts: [`supabase://${TABLE_ROLLBACK_MANIFESTS}/${manifest_id}`],
  });

  return { success: true, run_id: runId, fields_reversed: fieldsReversed, time_ms };
}

// ── verifyRollback ────────────────────────────────────────────────────────────

/**
 * After rollback completes, confirms that every field actually went back to its
 * original value by calling fetch_state on the adapter and comparing against
 * the before_value stored in the rollback manifest.
 *
 * Returns a list of mismatches if any field did not restore correctly.
 * The caller decides whether to alert the operator — this function never throws
 * on mismatch; it always returns a structured result.
 */
export async function verifyRollback(
  runId: string,
  tenantId: string,
): Promise<VerifyRollbackResult> {
  const supabase = await makeSupabase();

  writeLog({ run_id: runId, site_id: '', stage: 'rollback:verify_start', status: 'pending' });

  // ── Fetch manifest ─────────────────────────────────────────────────────────

  let row: RollbackManifestRow;
  try {
    row = await fetchManifest(supabase, runId, tenantId);
  } catch (err) {
    writeLog({ run_id: runId, site_id: '', stage: 'rollback:verify_fetch_error', status: 'error' });
    throw err;
  }

  const { site_id, cms_type, patches } = row;
  const adapter = await adapterForCms(cms_type);

  // ── Fetch current CMS state ────────────────────────────────────────────────

  let currentState: Record<string, unknown>;
  try {
    currentState = await adapter.fetch_state(site_id);
  } catch (err) {
    writeLog({ run_id: runId, site_id, cms: cms_type, stage: 'rollback:verify_fetch_state_error', status: 'error' });
    throw new Error(
      `[rollback-runner] verifyRollback: fetch_state failed for site ${site_id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Compare current values against before_values ──────────────────────────

  const mismatches: string[] = [];

  for (const entry of patches) {
    if (!entry.applied || entry.before_value === null) {
      // Skip: this field wasn't changed, or it had no original value to restore
      continue;
    }

    // Build a lookup key matching the structure returned by fetch_state.
    // fetch_state returns a nested Record; we navigate by URL-keyed resource then field.
    // The state structure is: { pages: { [gid]: { [field]: value } }, ... }
    // We compare using a path: url → field → value.
    const fieldKey = `${entry.field}@${entry.url}`;
    const currentValue = resolveFieldFromState(currentState, entry.url, entry.field);

    if (currentValue !== entry.before_value) {
      mismatches.push(fieldKey);
    }
  }

  // ── Log and return ────────────────────────────────────────────────────────

  if (mismatches.length > 0) {
    writeLog({
      run_id: runId,
      site_id,
      cms: cms_type,
      stage: 'rollback:verify_failed',
      status: 'error',
    });
    // Log each mismatch individually so the audit trail is granular
    for (const m of mismatches) {
      writeLog({
        run_id: runId,
        site_id,
        cms: cms_type,
        stage: `rollback:verify_mismatch:${m}`,
        status: 'error',
      });
    }
    return { verified: false, mismatches };
  }

  writeLog({
    run_id: runId,
    site_id,
    cms: cms_type,
    stage: 'rollback:verified',
    status: 'ok',
  });

  return { verified: true, mismatches: [] };
}

// ── Field resolver ────────────────────────────────────────────────────────────

/**
 * Navigates the nested state object returned by fetch_state to find the
 * current value of a specific field for a specific URL/resource.
 *
 * fetch_state returns structures like:
 *   { pages: { "gid://shopify/Page/123": { title: "...", meta_description: "..." } } }
 *
 * The resource URL or GID is the key within each surface collection.
 * Returns null if the field cannot be located in the current state.
 */
function resolveFieldFromState(
  state: Record<string, unknown>,
  url: string,
  field: string,
): string | null {
  // Walk every top-level collection in the state object
  for (const collection of Object.values(state)) {
    if (collection === null || typeof collection !== 'object' || Array.isArray(collection)) {
      continue;
    }

    const asRecord = collection as Record<string, unknown>;

    // Check if this collection has an entry keyed by the URL/GID
    if (Object.prototype.hasOwnProperty.call(asRecord, url)) {
      const resource = asRecord[url];
      if (resource !== null && typeof resource === 'object' && !Array.isArray(resource)) {
        const asResourceRecord = resource as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(asResourceRecord, field)) {
          const val = asResourceRecord[field];
          return typeof val === 'string' ? val : JSON.stringify(val);
        }
      }
    }
  }

  return null;
}
