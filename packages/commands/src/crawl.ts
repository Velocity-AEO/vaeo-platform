/**
 * packages/commands/src/crawl.ts
 *
 * vaeo crawl — full site discovery. Maps every URL, captures SEO signals,
 * stores results via the crawler package, and saves a crawl snapshot for
 * all subsequent commands to reference by run_id.
 *
 * Steps:
 *   1. Generate run_id (UUID v4)
 *   2. Look up site record (cms_type + site_url) from Supabase sites table
 *   3. Write ActionLog: crawl:start
 *   4. Call crawler.crawl() — discovers URLs, extracts SEO fields, writes crawl_results
 *   5. Save crawl summary to crawl_snapshots table → snapshot_id
 *   6. Write ActionLog: crawl:complete with urls_crawled count
 *   7. Return CrawlCommandResult
 *
 * Status rules:
 *   urls_crawled > 0 && urls_failed === 0  → 'completed'
 *   urls_crawled > 0 && urls_failed > 0    → 'partial'
 *   urls_crawled === 0 || crawler throws   → 'failed'
 *
 * saveSnapshot failure: non-blocking — crawl data is safe in crawl_results.
 * Never throws — always returns CrawlCommandResult.
 */

import { randomUUID } from 'node:crypto';
import { writeLog } from '../../action-log/src/index.js';
import {
  crawl as engineCrawl,
  type CrawlOptions  as EngineOptions,
  type CrawlResult   as EngineResult,
} from '../../crawler/src/index.js';
import type { CmsType } from '../../core/types.js';

// Re-exported so consumers (tests, CLI) don't need to import from the crawler directly.
export type { CrawlResult as EngineResult } from '../../crawler/src/index.js';

// ── Public types ───────────────────────────────────────────────────────────────

export interface CrawlRequest {
  site_id:   string;
  tenant_id: string;
  /** Maximum pages to crawl. Default: 2000. */
  max_urls?: number;
  /** Maximum link depth. Default: 3. */
  depth?:    number;
}

export interface CrawlCommandResult {
  run_id:       string;
  site_id:      string;
  tenant_id:    string;
  urls_crawled: number;
  /** ID of the crawl_snapshots row; empty string if snapshot write failed. */
  snapshot_id:  string;
  started_at:   string;
  completed_at: string;
  status:       'completed' | 'failed' | 'partial';
  error?:       string;
}

// ── Internal types ─────────────────────────────────────────────────────────────

export interface SiteLookup {
  cms_type: CmsType;
  site_url: string;
}

// ── Injectable ops ─────────────────────────────────────────────────────────────

export interface CrawlCommandOps {
  lookupSite: (site_id: string, tenant_id: string) => Promise<SiteLookup | null>;
  runCrawl:   (opts: EngineOptions)                 => Promise<EngineResult>;
  generateId: ()                                    => string;
}

// ── Real implementations ───────────────────────────────────────────────────────

async function realLookupSite(
  site_id: string,
  tenant_id: string,
): Promise<SiteLookup | null> {
  try {
    const { getConfig }    = await import('../../core/config.js');
    const { createClient } = await import('@supabase/supabase-js');
    const cfg    = getConfig();
    const client = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await client
      .from('sites')
      .select('cms_type, site_url')
      .eq('site_id', site_id)
      .eq('tenant_id', tenant_id)
      .single();
    if (error || !data) return null;
    return data as SiteLookup;
  } catch {
    return null;
  }
}

function defaultOps(): CrawlCommandOps {
  return {
    lookupSite: realLookupSite,
    runCrawl:   engineCrawl,
    generateId: () => randomUUID(),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Ensures start_url is a fully-qualified https:// URL.
 * The sites.site_url column may store bare hostnames (mystore.myshopify.com)
 * or full URLs — handle both.
 */
function toStartUrl(siteUrl: string): string {
  return siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;
}

function deriveStatus(
  urlsCrawled: number,
  urlsFailed:  number,
): 'completed' | 'failed' | 'partial' {
  if (urlsCrawled === 0) return 'failed';
  if (urlsFailed  > 0)  return 'partial';
  return 'completed';
}

// ── runCrawl ───────────────────────────────────────────────────────────────────

/**
 * Orchestrates a full site crawl and returns a stable run_id for subsequent commands.
 * Never throws — always returns CrawlCommandResult.
 */
export async function runCrawl(
  request:   CrawlRequest,
  _testOps?: Partial<CrawlCommandOps>,
): Promise<CrawlCommandResult> {
  const ops       = _testOps ? { ...defaultOps(), ..._testOps } : defaultOps();
  const runId     = ops.generateId();
  const startedAt = new Date().toISOString();
  const maxUrls   = request.max_urls ?? 2000;
  const depth     = request.depth    ?? 3;

  // ── Failure helper ─────────────────────────────────────────────────────────
  const fail = (error: string, cms: CmsType = 'shopify', urlsCrawled = 0): CrawlCommandResult => {
    const completedAt = new Date().toISOString();
    writeLog({
      run_id:    runId,
      tenant_id: request.tenant_id,
      site_id:   request.site_id,
      cms,
      command:   'crawl',
      stage:     'crawl:failed',
      status:    'failed',
      error,
    });
    return {
      run_id:       runId,
      site_id:      request.site_id,
      tenant_id:    request.tenant_id,
      urls_crawled: urlsCrawled,
      snapshot_id:  '',
      started_at:   startedAt,
      completed_at: completedAt,
      status:       'failed',
      error,
    };
  };

  // ── 1. Validate basic required fields ──────────────────────────────────────
  if (!request.site_id?.trim()) {
    return fail('site_id is required');
  }
  if (!request.tenant_id?.trim()) {
    return fail('tenant_id is required');
  }

  // ── 2. Look up site record ─────────────────────────────────────────────────
  let site: SiteLookup;
  try {
    const found = await ops.lookupSite(request.site_id, request.tenant_id);
    if (!found) return fail(`Site not found: ${request.site_id}`);
    site = found;
  } catch (err) {
    return fail(`Site lookup error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const startUrl = toStartUrl(site.site_url);

  // ── 3. Write ActionLog: crawl:start ────────────────────────────────────────
  writeLog({
    run_id:    runId,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    cms:       site.cms_type,
    command:   'crawl',
    stage:     'crawl:start',
    status:    'pending',
    metadata:  { start_url: startUrl, max_urls: maxUrls, depth, cms: site.cms_type },
  });

  // ── 4. Run crawler ─────────────────────────────────────────────────────────
  let engineResult: EngineResult;
  try {
    engineResult = await ops.runCrawl({
      run_id:    runId,
      tenant_id: request.tenant_id,
      site_id:   request.site_id,
      cms:       site.cms_type,
      start_url: startUrl,
      max_urls:  maxUrls,
      max_depth: depth,
    });
  } catch (err) {
    return fail(
      `Crawl engine error: ${err instanceof Error ? err.message : String(err)}`,
      site.cms_type,
    );
  }

  const completedAt = new Date().toISOString();
  const status      = deriveStatus(engineResult.urls_crawled, engineResult.urls_failed);

  // ── 5. snapshot_id — crawl_results are keyed by run_id; use it as stable ref
  const snapshotId = runId;

  // ── 6. Write ActionLog: crawl:complete ─────────────────────────────────────
  writeLog({
    run_id:      runId,
    tenant_id:   request.tenant_id,
    site_id:     request.site_id,
    cms:         site.cms_type,
    command:     'crawl',
    stage:       'crawl:complete',
    status:      status === 'failed' ? 'failed' : 'ok',
    duration_ms: engineResult.duration_ms,
    metadata:    {
      urls_crawled: engineResult.urls_crawled,
      urls_failed:  engineResult.urls_failed,
      snapshot_id:  snapshotId,
      status,
    },
  });

  return {
    run_id:       runId,
    site_id:      request.site_id,
    tenant_id:    request.tenant_id,
    urls_crawled: engineResult.urls_crawled,
    snapshot_id:  snapshotId,
    started_at:   startedAt,
    completed_at: completedAt,
    status,
  };
}

// ── CLI runner ─────────────────────────────────────────────────────────────────

/**
 * Called from apps/terminal/src/index.ts via the `vaeo crawl` command action.
 * Prints run_id and urls_crawled to stdout on success; errors to stderr.
 */
export async function runCrawlCli(opts: {
  siteId:   string;
  tenantId: string;
  maxUrls?: number;
  depth?:   number;
}): Promise<void> {
  const result = await runCrawl({
    site_id:   opts.siteId,
    tenant_id: opts.tenantId,
    max_urls:  opts.maxUrls,
    depth:     opts.depth,
  });

  if (result.status === 'failed') {
    process.stderr.write(`✗ Crawl failed: ${result.error ?? 'unknown error'}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `✓ Crawl ${result.status} — run_id: ${result.run_id}, ${result.urls_crawled} URLs crawled\n`,
    );
  }
}
