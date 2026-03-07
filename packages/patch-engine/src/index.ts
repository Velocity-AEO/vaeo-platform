/**
 * packages/patch-engine/src/index.ts
 *
 * Patch application and rollback engine for Velocity AEO.
 *
 * Applies proposed fixes to a CMS via an injected adapter, stores rollback
 * manifests in Supabase, and reverses changes on demand.
 *
 * Design rules:
 *   - Never throws — always returns result with success flag
 *   - Supabase is lazy-initialized via dynamic import of getConfig()
 *   - CMS adapter and Supabase client are injectable for unit tests
 *   - Real CMS adapter is a stderr-logging stub (adapters/ rebuilt separately)
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RollbackManifest {
  action_id:    string;
  run_id:       string;
  cms_type:     string;
  before_value: Record<string, unknown>;
  api_endpoint: string;
  created_at:   string;
}

export interface PatchRequest {
  action_id:    string;
  run_id:       string;
  tenant_id:    string;
  site_id:      string;
  cms_type:     'shopify' | 'wordpress';
  issue_type:   string;
  proposed_fix: Record<string, unknown>;
  sandbox?:     boolean;
}

export interface PatchResult {
  action_id:         string;
  run_id:            string;
  success:           boolean;
  sandbox:           boolean;
  rollback_manifest: RollbackManifest | null;
  error?:            string;
}

export interface RollbackRequest {
  action_id: string;
  run_id:    string;
  tenant_id: string;
  site_id:   string;
  cms_type:  'shopify' | 'wordpress';
}

export interface RollbackResult {
  action_id: string;
  run_id:    string;
  success:   boolean;
  error?:    string;
}

// ── CMS adapter interface ─────────────────────────────────────────────────────

export interface CmsAdapter {
  applyFix(fix: Record<string, unknown>): Promise<void>;
  revertFix(manifest: RollbackManifest): Promise<void>;
}

// ── Injectable dependencies ───────────────────────────────────────────────────

/** undefined = not yet attempted | null = unavailable */
let _supabaseClient: SupabaseClient | null | undefined;
let _cmsAdapter: CmsAdapter | undefined;

export function _injectSupabase(client: SupabaseClient | null): void {
  _supabaseClient = client;
}

export function _injectCmsAdapter(adapter: CmsAdapter): void {
  _cmsAdapter = adapter;
}

export function _resetInjections(): void {
  _supabaseClient = undefined;
  _cmsAdapter = undefined;
}

// ── Stub CMS adapter (used when no adapter is injected) ───────────────────────

const stubAdapter: CmsAdapter = {
  async applyFix(fix) {
    process.stderr.write(
      `[patch-engine] stub:applyFix — ${JSON.stringify(fix).slice(0, 120)}\n`,
    );
  },
  async revertFix(manifest) {
    process.stderr.write(
      `[patch-engine] stub:revertFix — action_id=${manifest.action_id}\n`,
    );
  },
};

function getAdapter(): CmsAdapter {
  return _cmsAdapter ?? stubAdapter;
}

// ── Supabase lazy init ────────────────────────────────────────────────────────

async function getSupabase(): Promise<SupabaseClient | null> {
  if (_supabaseClient !== undefined) return _supabaseClient;
  try {
    const [{ createClient }, { getConfig }] = await Promise.all([
      import('@supabase/supabase-js'),
      import('../../core/src/config.js'),
    ]);
    const cfg = getConfig();
    _supabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
    return _supabaseClient;
  } catch (err) {
    process.stderr.write(`[patch-engine] patch:error — Supabase init: ${String(err)}\n`);
    _supabaseClient = null;
    return null;
  }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function storeRollbackManifest(
  client: SupabaseClient,
  actionId: string,
  manifest: RollbackManifest,
): Promise<void> {
  const { error } = await client
    .from('action_queue')
    .update({ rollback_manifest: manifest })
    .eq('action_id', actionId);
  if (error) {
    throw new Error(`Failed to store rollback manifest: ${error.message}`);
  }
}

async function fetchRollbackManifest(
  client: SupabaseClient,
  actionId: string,
  tenantId: string,
): Promise<RollbackManifest | null> {
  const { data, error } = await client
    .from('action_queue')
    .select('rollback_manifest')
    .eq('action_id', actionId)
    .eq('tenant_id', tenantId)
    .single();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return (row['rollback_manifest'] as RollbackManifest) ?? null;
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Applies a proposed fix to the CMS and stores a rollback manifest.
 * Never throws — returns success=false with error on failure.
 */
export async function applyPatch(request: PatchRequest): Promise<PatchResult> {
  const sandbox = request.sandbox ?? true;

  process.stderr.write(
    `[patch-engine] patch:applying — action_id=${request.action_id}, issue_type=${request.issue_type}\n`,
  );

  const base: Omit<PatchResult, 'success' | 'error'> = {
    action_id:         request.action_id,
    run_id:            request.run_id,
    sandbox,
    rollback_manifest: null,
  };

  // Build rollback manifest before applying (capture before_value from proposed_fix)
  const manifest: RollbackManifest = {
    action_id:    request.action_id,
    run_id:       request.run_id,
    cms_type:     request.cms_type,
    before_value: request.proposed_fix['before_value'] as Record<string, unknown> ?? {},
    api_endpoint: String(request.proposed_fix['api_endpoint'] ?? ''),
    created_at:   new Date().toISOString(),
  };

  try {
    // 1. Apply fix via CMS adapter
    await getAdapter().applyFix(request.proposed_fix);

    // 2. Persist rollback manifest to Supabase (best-effort)
    const client = await getSupabase();
    if (client) {
      try {
        await storeRollbackManifest(client, request.action_id, manifest);
      } catch (err) {
        process.stderr.write(
          `[patch-engine] patch:error — manifest store: ${String(err)}\n`,
        );
        // Non-fatal: fix was applied; manifest just wasn't persisted
      }
    }

    process.stderr.write(
      `[patch-engine] patch:applied — action_id=${request.action_id}, success=true\n`,
    );
    return { ...base, success: true, rollback_manifest: manifest };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[patch-engine] patch:error — action_id=${request.action_id}: ${msg}\n`);
    return { ...base, success: false, error: msg };
  }
}

/**
 * Reverses a previously applied patch using its stored rollback manifest.
 * Never throws — returns success=false with error on failure.
 */
export async function rollbackPatch(request: RollbackRequest): Promise<RollbackResult> {
  process.stderr.write(
    `[patch-engine] rollback:applying — action_id=${request.action_id}\n`,
  );

  const base: Omit<RollbackResult, 'success' | 'error'> = {
    action_id: request.action_id,
    run_id:    request.run_id,
  };

  try {
    // 1. Load manifest from Supabase
    const client = await getSupabase();
    if (!client) {
      process.stderr.write(
        `[patch-engine] rollback:error — action_id=${request.action_id}: Supabase unavailable\n`,
      );
      return { ...base, success: false, error: 'Supabase unavailable' };
    }

    const manifest = await fetchRollbackManifest(client, request.action_id, request.tenant_id);
    if (!manifest) {
      process.stderr.write(
        `[patch-engine] rollback:error — action_id=${request.action_id}: no manifest found\n`,
      );
      return { ...base, success: false, error: 'No rollback manifest found for this action_id' };
    }

    // 2. Revert via CMS adapter
    await getAdapter().revertFix(manifest);

    process.stderr.write(
      `[patch-engine] rollback:applied — action_id=${request.action_id}, success=true\n`,
    );
    return { ...base, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[patch-engine] rollback:error — action_id=${request.action_id}: ${msg}\n`,
    );
    return { ...base, success: false, error: msg };
  }
}
