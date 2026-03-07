/**
 * packages/truth-server/src/index.ts
 *
 * Snapshot store for Velocity AEO.
 * Saves crawl run metadata to site_snapshots and retrieves it
 * alongside crawl_results for downstream consumers.
 *
 * Design rules:
 *   - Never throws — always returns result with success/found flags
 *   - Supabase is lazy-initialized via dynamic import of getConfig()
 *   - Client is injectable for unit tests (_injectSupabase)
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrawlResult } from '../../crawler/src/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type { CrawlResult };

export interface SaveSnapshotRequest {
  run_id:        string;
  tenant_id:     string;
  site_id:       string;
  site_url:      string;
  cms_type:      string;
  urls_crawled:  number;
  crawl_results: CrawlResult[];
}

export interface SaveSnapshotResult {
  snapshot_id: string;
  run_id:      string;
  tenant_id:   string;
  site_id:     string;
  saved_at:    string;
  success:     boolean;
  error?:      string;
}

export interface LoadSnapshotRequest {
  run_id:    string;
  tenant_id: string;
}

export interface LoadSnapshotResult {
  snapshot_id:   string | null;
  run_id:        string;
  tenant_id:     string;
  site_id:       string | null;
  site_url:      string | null;
  cms_type:      string | null;
  urls_crawled:  number;
  crawl_results: CrawlResult[];
  created_at:    string | null;
  found:         boolean;
  error?:        string;
}

// ── Injectable dependency ─────────────────────────────────────────────────────

/** undefined = not yet attempted | null = failed / unavailable */
let _supabaseClient: SupabaseClient | null | undefined;

export function _injectSupabase(client: SupabaseClient | null): void {
  _supabaseClient = client;
}

export function _resetInjections(): void {
  _supabaseClient = undefined;
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
    process.stderr.write(`[truth-server] snapshot:error — init: ${String(err)}\n`);
    _supabaseClient = null;
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function notFound(req: LoadSnapshotRequest, error?: string): LoadSnapshotResult {
  return {
    snapshot_id:   null,
    run_id:        req.run_id,
    tenant_id:     req.tenant_id,
    site_id:       null,
    site_url:      null,
    cms_type:      null,
    urls_crawled:  0,
    crawl_results: [],
    created_at:    null,
    found:         false,
    ...(error ? { error } : {}),
  };
}

function rowToCrawlResult(row: Record<string, unknown>): CrawlResult {
  return {
    url:            String(row['url']            ?? ''),
    status_code:    Number(row['status_code']    ?? 0),
    title:          (row['title']     as string)  ?? null,
    meta_desc:      (row['meta_desc'] as string)  ?? null,
    h1:             (row['h1']             as string[]) ?? [],
    h2:             (row['h2']             as string[]) ?? [],
    images:         (row['images']         as CrawlResult['images'])         ?? [],
    internal_links: (row['internal_links'] as string[]) ?? [],
    schema_blocks:  (row['schema_blocks']  as string[]) ?? [],
    canonical:      (row['canonical'] as string) ?? null,
    redirect_chain: (row['redirect_chain'] as string[]) ?? [],
    load_time_ms:   Number(row['load_time_ms'] ?? 0),
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Saves a crawl run snapshot to the site_snapshots table.
 * Never throws — returns success=false with error message on failure.
 */
export async function saveSnapshot(
  request: SaveSnapshotRequest,
): Promise<SaveSnapshotResult> {
  const snapshotId = randomUUID();
  const savedAt    = new Date().toISOString();

  const base = {
    snapshot_id: snapshotId,
    run_id:      request.run_id,
    tenant_id:   request.tenant_id,
    site_id:     request.site_id,
    saved_at:    savedAt,
  };

  const client = await getSupabase();
  if (!client) {
    process.stderr.write(`[truth-server] snapshot:error — Supabase unavailable\n`);
    return { ...base, success: false, error: 'Supabase unavailable' };
  }

  try {
    const { error } = await client.from('site_snapshots').insert({
      snapshot_id:  snapshotId,
      run_id:       request.run_id,
      tenant_id:    request.tenant_id,
      site_id:      request.site_id,
      site_url:     request.site_url,
      cms_type:     request.cms_type,
      urls_crawled: request.urls_crawled,
      created_at:   savedAt,
    });

    if (error) {
      process.stderr.write(`[truth-server] snapshot:error — ${error.message}\n`);
      return { ...base, success: false, error: error.message };
    }

    process.stderr.write(
      `[truth-server] snapshot:saved — run_id=${request.run_id}, snapshot_id=${snapshotId}\n`,
    );
    return { ...base, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[truth-server] snapshot:error — ${msg}\n`);
    return { ...base, success: false, error: msg };
  }
}

/**
 * Loads snapshot metadata from site_snapshots and per-URL data from
 * crawl_results. Never throws — returns found=false with error on failure.
 */
export async function loadSnapshot(
  request: LoadSnapshotRequest,
): Promise<LoadSnapshotResult> {
  const client = await getSupabase();
  if (!client) {
    process.stderr.write(`[truth-server] snapshot:error — Supabase unavailable\n`);
    return notFound(request, 'Supabase unavailable');
  }

  try {
    // 1. Fetch snapshot metadata
    const { data: snap, error: snapErr } = await client
      .from('site_snapshots')
      .select('*')
      .eq('run_id', request.run_id)
      .eq('tenant_id', request.tenant_id)
      .single();

    if (snapErr || !snap) {
      process.stderr.write(`[truth-server] snapshot:not-found — run_id=${request.run_id}\n`);
      return notFound(request);
    }

    // 2. Fetch crawl results for this run
    const { data: rows, error: rowsErr } = await client
      .from('crawl_results')
      .select('*')
      .eq('run_id', request.run_id)
      .eq('tenant_id', request.tenant_id);

    if (rowsErr) {
      process.stderr.write(
        `[truth-server] snapshot:error — crawl_results: ${rowsErr.message}\n`,
      );
    }

    const crawlResults: CrawlResult[] = (rows ?? []).map(
      (row: Record<string, unknown>) => rowToCrawlResult(row),
    );

    process.stderr.write(
      `[truth-server] snapshot:loaded — run_id=${request.run_id}, urls=${crawlResults.length}\n`,
    );

    const s = snap as Record<string, unknown>;
    return {
      snapshot_id:   (s['snapshot_id'] as string) ?? null,
      run_id:        request.run_id,
      tenant_id:     request.tenant_id,
      site_id:       (s['site_id']     as string) ?? null,
      site_url:      (s['site_url']    as string) ?? null,
      cms_type:      (s['cms_type']    as string) ?? null,
      urls_crawled:  Number(s['urls_crawled'] ?? 0),
      crawl_results: crawlResults,
      created_at:    (s['created_at']  as string) ?? null,
      found:         true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[truth-server] snapshot:error — ${msg}\n`);
    return notFound(request, msg);
  }
}
