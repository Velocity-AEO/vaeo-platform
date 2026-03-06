/**
 * packages/patch-engine/src/index.ts
 *
 * The patch engine — applies SEO fixes to a CMS safely.
 *
 * "Safely" means exactly this order, every time:
 *   1. Write the complete undo record to Supabase FIRST
 *   2. Apply each change ONE AT A TIME via the CMS adapter
 *   3. If anything fails mid-run, reverse every change already applied
 *
 * A site should never be left in a half-patched state. If it is,
 * the rollback_manifest is always there to undo it.
 *
 * Never call process.env directly — credentials come from packages/core/config.ts.
 * Every Supabase query includes tenant_id — no cross-tenant data access.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  CMSAdapter,
  PatchManifest,
  PatchEntry,
  ActionLogEvent,
  CmsType,
  StageStatus,
} from '../../../packages/core/types.js';
import { config } from '../../../packages/core/config.js';

// ── Table name constants — change here, never in queries ─────────────────────

const TABLE_ROLLBACK_MANIFESTS = 'rollback_manifests' as const;

// ── Rollback manifest status values ──────────────────────────────────────────

type ManifestStatus = 'pending' | 'partial' | 'applied' | 'rolled_back';

// ── Internal types ────────────────────────────────────────────────────────────

/** A single entry in the rollback manifest — one field, its before and after. */
interface RollbackPatchEntry {
  idempotency_key: string;
  url: string;
  field: string;
  before_value: string | null;
  after_value: string;
  applied: boolean;
}

/** The rollback manifest row as stored in Supabase. */
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

/** Returned by apply() on success. */
export interface ApplyResult {
  /** Database ID of the written rollback manifest. */
  manifest_id: string;
  /** Idempotency keys of every patch that was successfully applied. */
  applied_keys: string[];
  /** Final manifest status — always 'applied' on success. */
  status: ManifestStatus;
}

/** Returned by rollback(). */
export interface RollbackResult {
  success: boolean;
  /** Number of fields that were successfully restored to before_value. */
  fields_reversed: number;
  /** Errors encountered during rollback (collected, not thrown individually). */
  errors: string[];
}

/** Returned by status(). */
export interface ManifestStatusResult {
  manifest_id: string;
  run_id: string;
  status: ManifestStatus;
  patches_total: number;
  patches_applied: number;
  created_at: string;
}

// ── ActionLog ─────────────────────────────────────────────────────────────────

/**
 * Emits an ActionLogEvent to stdout as newline-delimited JSON.
 * The platform log aggregator (Supabase / Upstash) persists these.
 */
function writeLog(
  overrides: Partial<ActionLogEvent> &
    Pick<ActionLogEvent, 'run_id' | 'site_id' | 'stage' | 'status'>,
): void {
  const event: ActionLogEvent = {
    tenant_id: '',
    cms: 'shopify',
    command: 'patch-engine',
    urls: [],
    proof_artifacts: [],
    before_metrics: null,
    after_metrics: null,
    ts: new Date().toISOString(),
    ...overrides,
  };
  process.stdout.write(JSON.stringify(event) + '\n');
}

// ── Supabase client ───────────────────────────────────────────────────────────

/**
 * Creates a service-role Supabase client.
 * Service-role bypasses RLS so we can enforce tenant isolation ourselves
 * by always including tenant_id in every WHERE / INSERT.
 */
function makeSupabase(): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// ── PatchEngine ───────────────────────────────────────────────────────────────

/**
 * PatchEngine orchestrates safe, rollback-first application of SEO patches.
 *
 * Inject the appropriate CMS adapter at construction time so the engine
 * remains CMS-agnostic — it never calls Shopify or WordPress APIs directly.
 */
export class PatchEngine {
  private readonly supabase: SupabaseClient;

  constructor(private readonly adapter: CMSAdapter) {
    this.supabase = makeSupabase();
  }

  /**
   * Applies all patches in the manifest to the CMS — but only after writing
   * a complete rollback record to Supabase first. If that write fails, the
   * method throws immediately and nothing is changed on the CMS.
   *
   * Patches are applied one at a time. If any single patch fails, all patches
   * already applied in this run are reversed automatically before throwing.
   *
   * Returns the manifest_id and list of applied idempotency keys on success.
   */
  async apply(manifest: PatchManifest, tenantId: string): Promise<ApplyResult> {
    const { run_id, site_id, cms, patches } = manifest;
    const tenant_id = tenantId;

    writeLog({
      run_id,
      site_id,
      tenant_id,
      cms,
      stage: 'apply:start',
      status: 'pending',
      urls: patches.map((p) => p.url),
    });

    // ── Step 1: Write rollback manifest BEFORE any CMS mutation ──────────────

    const rollbackEntries: RollbackPatchEntry[] = patches.map((p) => ({
      idempotency_key: p.idempotency_key,
      url: p.url,
      field: p.field,
      before_value: p.before_value,
      after_value: p.after_value,
      applied: false,
    }));

    let manifestId: string;
    try {
      const { data, error } = await this.supabase
        .from(TABLE_ROLLBACK_MANIFESTS)
        .insert({
          run_id,
          tenant_id,
          site_id,
          cms_type: cms,
          patches: rollbackEntries,
          status: 'pending' satisfies ManifestStatus,
        })
        .select('manifest_id')
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('No manifest_id returned after insert');

      manifestId = (data as { manifest_id: string }).manifest_id;
    } catch (err) {
      writeLog({ run_id, site_id, tenant_id, cms, stage: 'apply:manifest_write_failed', status: 'error' });
      throw new Error(
        `[patch-engine] apply: rollback manifest write failed for run ${run_id} — ` +
        `refusing to proceed without undo record.\n` +
        `Cause: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    writeLog({
      run_id,
      site_id,
      tenant_id,
      cms,
      stage: 'apply:manifest_written',
      status: 'ok',
      proof_artifacts: [`supabase://${TABLE_ROLLBACK_MANIFESTS}/${manifestId}`],
    });

    // ── Step 2: Apply patches one at a time ───────────────────────────────────

    const appliedKeys: string[] = [];

    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];

      try {
        // Delegate to the CMS adapter — pass a single-patch manifest
        await this.adapter.apply_patch({
          ...manifest,
          patches: [patch],
        });

        appliedKeys.push(patch.idempotency_key);

        // Mark this entry as applied in-memory
        rollbackEntries[i].applied = true;

        // Update manifest status to 'partial' after the first successful patch
        await this.updateManifestStatus(manifestId, tenant_id, 'partial', rollbackEntries);

        writeLog({
          run_id,
          site_id,
          tenant_id,
          cms,
          stage: `apply:patch_ok:${patch.idempotency_key}`,
          status: 'ok',
          urls: [patch.url],
        });
      } catch (patchErr) {
        // A patch failed — reverse everything applied so far, then throw
        writeLog({
          run_id,
          site_id,
          tenant_id,
          cms,
          stage: `apply:patch_failed:${patch.idempotency_key}`,
          status: 'error',
          urls: [patch.url],
        });

        // Trigger auto-rollback for patches already applied in this run
        if (appliedKeys.length > 0) {
          writeLog({ run_id, site_id, tenant_id, cms, stage: 'apply:auto_rollback_start', status: 'pending' });

          const autoRollbackResult = await this.reverseEntries(
            rollbackEntries.filter((e) => e.applied),
            manifest,
          );

          await this.updateManifestStatus(manifestId, tenant_id, 'rolled_back', rollbackEntries);

          writeLog({
            run_id,
            site_id,
            tenant_id,
            cms,
            stage: 'apply:auto_rollback_complete',
            status: autoRollbackResult.errors.length === 0 ? 'ok' : 'error',
          });
        } else {
          // Nothing applied yet — just mark manifest as rolled_back
          await this.updateManifestStatus(manifestId, tenant_id, 'rolled_back', rollbackEntries);
        }

        throw new Error(
          `[patch-engine] apply: patch "${patch.idempotency_key}" failed at position ${i + 1}/${patches.length}. ` +
          `Auto-rollback triggered for ${appliedKeys.length} previously applied patch(es).\n` +
          `Cause: ${patchErr instanceof Error ? patchErr.message : String(patchErr)}`,
        );
      }
    }

    // ── Step 3: Mark manifest as fully applied ────────────────────────────────

    await this.updateManifestStatus(manifestId, tenant_id, 'applied', rollbackEntries);

    writeLog({
      run_id,
      site_id,
      tenant_id,
      cms,
      stage: 'apply:complete',
      status: 'ok',
      proof_artifacts: [`supabase://${TABLE_ROLLBACK_MANIFESTS}/${manifestId}`],
      urls: patches.map((p) => p.url),
    });

    return {
      manifest_id: manifestId,
      applied_keys: appliedKeys,
      status: 'applied',
    };
  }

  /**
   * Reverses all patches applied in a run by reading the rollback manifest from
   * Supabase and restoring each field's before_value via the CMS adapter — in
   * reverse order. If the manifest is already rolled back, returns early.
   *
   * Collects all errors before returning so a partial rollback is fully reported.
   */
  async rollback(runId: string, tenantId: string): Promise<RollbackResult> {
    writeLog({ run_id: runId, site_id: '', stage: 'rollback:start', status: 'pending' });

    // Fetch the rollback manifest — always filter by tenant_id
    let row: RollbackManifestRow;
    try {
      const { data, error } = await this.supabase
        .from(TABLE_ROLLBACK_MANIFESTS)
        .select('*')
        .eq('run_id', runId)
        .eq('tenant_id', tenantId)
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error(`No rollback manifest found for run_id=${runId}`);

      row = data as RollbackManifestRow;
    } catch (err) {
      writeLog({ run_id: runId, site_id: '', stage: 'rollback:fetch_error', status: 'error' });
      throw new Error(
        `[patch-engine] rollback: cannot fetch manifest for run ${runId}.\n` +
        `Cause: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Guard: already rolled back — return early rather than double-reversing
    if (row.status === 'rolled_back') {
      writeLog({ run_id: runId, site_id: row.site_id, stage: 'rollback:already_done', status: 'skipped' });
      return { success: true, fields_reversed: 0, errors: ['Manifest already has status rolled_back — no action taken'] };
    }

    // Only act on 'applied' or 'partial' manifests
    if (row.status !== 'applied' && row.status !== 'partial') {
      throw new Error(
        `[patch-engine] rollback: manifest for run ${runId} has status "${row.status}". ` +
        `Can only roll back 'applied' or 'partial' manifests.`,
      );
    }

    // Build a PatchManifest from the rollback entries so we can call the adapter
    const patchManifestBase: PatchManifest = {
      run_id: row.run_id,
      site_id: row.site_id,
      cms: row.cms_type,
      patches: [],
      backup_ref: '',
    };

    // Reverse only entries that were actually applied — in reverse order
    const appliedEntries = row.patches
      .filter((e) => e.applied)
      .reverse();

    const result = await this.reverseEntries(appliedEntries, patchManifestBase);

    // Update manifest status
    const finalStatus: ManifestStatus = result.errors.length === 0 ? 'rolled_back' : 'partial';
    await this.updateManifestStatus(row.manifest_id, tenantId, finalStatus, row.patches);

    writeLog({
      run_id: runId,
      site_id: row.site_id,
      stage: 'rollback:complete',
      status: result.errors.length === 0 ? 'ok' : 'error',
      proof_artifacts: [`supabase://${TABLE_ROLLBACK_MANIFESTS}/${row.manifest_id}`],
    });

    return result;
  }

  /**
   * Returns the current status of the rollback manifest for a given run_id.
   * Used by the CLI to check whether a run is safe to roll back before committing.
   */
  async status(runId: string, tenantId: string): Promise<ManifestStatusResult> {
    const { data, error } = await this.supabase
      .from(TABLE_ROLLBACK_MANIFESTS)
      .select('manifest_id, run_id, status, patches, created_at')
      .eq('run_id', runId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      throw new Error(
        `[patch-engine] status: cannot fetch manifest for run ${runId}.\n` +
        `Cause: ${error.message}`,
      );
    }
    if (!data) {
      throw new Error(`[patch-engine] status: no manifest found for run_id=${runId}`);
    }

    const row = data as Pick<RollbackManifestRow, 'manifest_id' | 'run_id' | 'status' | 'patches' | 'created_at'>;
    const patches = row.patches as RollbackPatchEntry[];

    return {
      manifest_id: row.manifest_id,
      run_id: row.run_id,
      status: row.status,
      patches_total: patches.length,
      patches_applied: patches.filter((p) => p.applied).length,
      created_at: row.created_at,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Applies each rollback entry in the order given (caller reverses before passing).
   * Restores the before_value of every field via the CMS adapter.
   * Collects all errors rather than stopping at the first failure.
   */
  private async reverseEntries(
    entries: RollbackPatchEntry[],
    manifestBase: PatchManifest,
  ): Promise<RollbackResult> {
    const errors: string[] = [];
    let fieldsReversed = 0;

    for (const entry of entries) {
      if (entry.before_value === null) {
        // Field didn't exist before — skip restoring it
        continue;
      }

      // Build a single-patch manifest with before_value as the new after_value
      const reversePatch: PatchEntry = {
        idempotency_key: `rollback:${entry.idempotency_key}`,
        url: entry.url,
        field: entry.field,
        before_value: entry.after_value,
        after_value: entry.before_value,  // restore original
        confidence: 'safe',
      };

      try {
        await this.adapter.apply_patch({
          ...manifestBase,
          patches: [reversePatch],
        });

        fieldsReversed++;

        writeLog({
          run_id: manifestBase.run_id,
          site_id: manifestBase.site_id,
          stage: `rollback:field_reversed:${entry.idempotency_key}`,
          status: 'ok',
          urls: [entry.url],
        });
      } catch (err) {
        const msg = `field "${entry.field}" on ${entry.url}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        writeLog({
          run_id: manifestBase.run_id,
          site_id: manifestBase.site_id,
          stage: `rollback:field_error:${entry.idempotency_key}`,
          status: 'error',
          urls: [entry.url],
        });
      }
    }

    return {
      success: errors.length === 0,
      fields_reversed: fieldsReversed,
      errors,
    };
  }

  /**
   * Updates the status column and patches array of the rollback manifest row.
   * Silent failure would leave the manifest in a stale state — so this throws.
   */
  private async updateManifestStatus(
    manifestId: string,
    tenantId: string,
    status: ManifestStatus,
    patches: RollbackPatchEntry[],
  ): Promise<void> {
    const { error } = await this.supabase
      .from(TABLE_ROLLBACK_MANIFESTS)
      .update({ status, patches })
      .eq('manifest_id', manifestId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new Error(
        `[patch-engine] updateManifestStatus: failed to set status="${status}" ` +
        `for manifest ${manifestId}: ${error.message}`,
      );
    }
  }
}

// ── Default export ────────────────────────────────────────────────────────────

export default PatchEngine;
