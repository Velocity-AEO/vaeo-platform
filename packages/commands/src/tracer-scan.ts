/**
 * packages/commands/src/tracer-scan.ts
 *
 * vaeo tracer scan --site <domain>
 *
 * Phase 1 Tracer: crawls a site (or reads from existing crawl_results),
 * populates tracer_url_inventory and tracer_field_snapshots tables.
 *
 * Steps:
 *   1. Resolve site_id from the sites table using the domain
 *   2. Load crawl_results for the most recent run_id for this site
 *   3. Filter out protected routes
 *   4. Upsert URLs into tracer_url_inventory
 *   5. Extract field snapshots and write to tracer_field_snapshots
 *   6. Return TracerScanResult
 *
 * Never throws — always returns TracerScanResult.
 */

import { randomUUID } from 'node:crypto';
import { isProtectedRoute } from '../../core/src/protected-routes.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TracerScanRequest {
  site: string;  // domain e.g. "cococabanalife.com"
}

export interface TracerScanResult {
  run_id:           string;
  site_id:          string;
  site:             string;
  urls_inventoried: number;
  snapshots_written: number;
  protected_skipped: number;
  status:           'completed' | 'failed';
  error?:           string;
}

export interface CrawlResultRow {
  id:             string;
  run_id:         string;
  tenant_id:      string;
  site_id:        string;
  url:            string;
  status_code:    number | null;
  title:          string | null;
  meta_desc:      string | null;
  h1:             string[] | null;
  h2:             string[] | null;
  images:         unknown[] | null;
  internal_links: string[] | null;
  schema_blocks:  string[] | null;
  canonical:      string | null;
  redirect_chain: string[] | null;
  load_time_ms:   number | null;
  crawled_at:     string;
}

export interface UrlInventoryRow {
  site_id:        string;
  url:            string;
  template_id:    string | null;
  first_seen:     string;
  last_seen:      string;
  is_cms_managed: boolean;
  status:         'active' | 'redirected' | 'deleted' | '404';
}

export interface FieldSnapshotRow {
  run_id:        string;
  site_id:       string;
  url:           string;
  field_type:    string;
  current_value: string | null;
  char_count:    number | null;
  issue_flag:    boolean;
  issue_type:    string | null;
}

// ── Injectable ops ──────────────────────────────────────────────────────────

export interface TracerScanOps {
  lookupSiteByDomain: (domain: string) => Promise<{ site_id: string; tenant_id: string; cms_type: string } | null>;
  loadCrawlResults:   (siteId: string) => Promise<CrawlResultRow[]>;
  upsertUrlInventory: (rows: UrlInventoryRow[]) => Promise<number>;
  writeFieldSnapshots: (rows: FieldSnapshotRow[]) => Promise<number>;
  generateId:         () => string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Derive a Shopify template_id from the URL path pattern. */
export function deriveTemplateId(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    if (path === '/' || path === '') return 'index';
    if (path.startsWith('/products/')) return 'product';
    if (path.startsWith('/collections/') && path.includes('/products/')) return 'product';
    if (path.startsWith('/collections/')) return 'collection';
    if (path.startsWith('/pages/')) return 'page';
    if (path.startsWith('/blogs/') && path.split('/').length > 3) return 'article';
    if (path.startsWith('/blogs/')) return 'blog';
    if (path === '/contact' || path === '/contact-us') return 'page';
    return 'other';
  } catch {
    return null;
  }
}

/** Derive URL status from HTTP status code and redirect chain. */
export function deriveUrlStatus(
  statusCode: number | null,
  redirectChain: string[] | null,
): 'active' | 'redirected' | 'deleted' | '404' {
  if (statusCode === 404) return '404';
  if (statusCode && statusCode >= 500) return 'deleted';
  if (redirectChain && redirectChain.length > 0) return 'redirected';
  return 'active';
}

/**
 * Extract field snapshots from a crawl result row.
 * Checks for common SEO issues inline.
 */
export function extractFieldSnapshots(
  row: CrawlResultRow,
  runId: string,
): FieldSnapshotRow[] {
  const snapshots: FieldSnapshotRow[] = [];
  const base = { run_id: runId, site_id: row.site_id, url: row.url };

  // title
  const title = row.title ?? null;
  const titleLen = title?.length ?? 0;
  let titleIssue: string | null = null;
  if (!title || title.trim() === '') titleIssue = 'MISSING';
  else if (titleLen > 60) titleIssue = 'TOO_LONG';
  else if (titleLen < 10) titleIssue = 'TOO_SHORT';
  snapshots.push({
    ...base,
    field_type: 'title',
    current_value: title,
    char_count: titleLen,
    issue_flag: titleIssue !== null,
    issue_type: titleIssue,
  });

  // meta_description
  const desc = row.meta_desc ?? null;
  const descLen = desc?.length ?? 0;
  let descIssue: string | null = null;
  if (!desc || desc.trim() === '') descIssue = 'MISSING';
  else if (descLen > 155) descIssue = 'TOO_LONG';
  else if (descLen < 50) descIssue = 'TOO_SHORT';
  snapshots.push({
    ...base,
    field_type: 'meta_description',
    current_value: desc,
    char_count: descLen,
    issue_flag: descIssue !== null,
    issue_type: descIssue,
  });

  // h1
  const h1s = row.h1 ?? [];
  const h1Value = h1s.length > 0 ? h1s.join(' | ') : null;
  let h1Issue: string | null = null;
  if (h1s.length === 0) h1Issue = 'MISSING';
  else if (h1s.length > 1) h1Issue = 'MULTIPLE';
  snapshots.push({
    ...base,
    field_type: 'h1',
    current_value: h1Value,
    char_count: h1Value?.length ?? 0,
    issue_flag: h1Issue !== null,
    issue_type: h1Issue,
  });

  // h2
  const h2s = row.h2 ?? [];
  const h2Value = h2s.length > 0 ? h2s.join(' | ') : null;
  snapshots.push({
    ...base,
    field_type: 'h2',
    current_value: h2Value,
    char_count: h2Value?.length ?? 0,
    issue_flag: h2s.length === 0,
    issue_type: h2s.length === 0 ? 'MISSING' : null,
  });

  // canonical
  const canonical = row.canonical ?? null;
  let canonicalIssue: string | null = null;
  if (!canonical || canonical.trim() === '') canonicalIssue = 'MISSING';
  else {
    try {
      const canonUrl = new URL(canonical);
      const pageUrl = new URL(row.url);
      if (canonUrl.hostname !== pageUrl.hostname) canonicalIssue = 'OFF_DOMAIN';
    } catch {
      canonicalIssue = 'INVALID';
    }
  }
  snapshots.push({
    ...base,
    field_type: 'canonical',
    current_value: canonical,
    char_count: canonical?.length ?? 0,
    issue_flag: canonicalIssue !== null,
    issue_type: canonicalIssue,
  });

  // schema (JSON-LD)
  const schemas = row.schema_blocks ?? [];
  const schemaValue = schemas.length > 0 ? schemas.join('\n') : null;
  let schemaIssue: string | null = null;
  if (schemas.length === 0) schemaIssue = 'MISSING';
  snapshots.push({
    ...base,
    field_type: 'schema',
    current_value: schemaValue,
    char_count: schemaValue?.length ?? 0,
    issue_flag: schemaIssue !== null,
    issue_type: schemaIssue,
  });

  return snapshots;
}

// ── Real implementations ────────────────────────────────────────────────────

const realLookupSiteByDomain: TracerScanOps['lookupSiteByDomain'] = async (domain) => {
  const { getConfig } = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  // Match domain against site_url (could be stored as "domain.com" or "https://domain.com")
  const { data, error } = await db
    .from('sites')
    .select('site_id, tenant_id, cms_type')
    .or(`site_url.eq.${domain},site_url.eq.https://${domain}`)
    .limit(1)
    .single();
  if (error || !data) return null;
  return data as { site_id: string; tenant_id: string; cms_type: string };
};

const realLoadCrawlResults: TracerScanOps['loadCrawlResults'] = async (siteId) => {
  const { getConfig } = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  // Load the most recent crawl results for this site
  const { data, error } = await db
    .from('crawl_results')
    .select('*')
    .eq('site_id', siteId)
    .order('crawled_at', { ascending: false })
    .limit(2000);
  if (error) throw new Error(`crawl_results load failed: ${error.message}`);
  return (data ?? []) as CrawlResultRow[];
};

const realUpsertUrlInventory: TracerScanOps['upsertUrlInventory'] = async (rows) => {
  const { getConfig } = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  // Map internal UrlInventoryRow → actual DB columns
  const dbRows = rows.map((r) => ({
    site_id:       r.site_id,
    url:           r.url,
    status_code:   r.status === '404' ? 404 : r.status === 'deleted' ? 500 : 200,
    content_type:  'text/html',
    is_protected:  false,
    discovered_at: r.first_seen,
    last_seen_at:  r.last_seen,
  }));
  const { error } = await db
    .from('tracer_url_inventory')
    .upsert(dbRows, { onConflict: 'site_id,url' });
  if (error) throw new Error(`tracer_url_inventory upsert failed: ${error.message}`);
  return rows.length;
};

const realWriteFieldSnapshots: TracerScanOps['writeFieldSnapshots'] = async (rows) => {
  const { getConfig } = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  // Map internal FieldSnapshotRow → actual DB columns
  const dbRows = rows.map((r) => ({
    run_id:        r.run_id,
    site_id:       r.site_id,
    url:           r.url,
    field_name:    r.field_type,
    current_value: r.current_value,
  }));
  const { error } = await db
    .from('tracer_field_snapshots')
    .insert(dbRows);
  if (error) throw new Error(`tracer_field_snapshots insert failed: ${error.message}`);
  return rows.length;
};

function defaultOps(): TracerScanOps {
  return {
    lookupSiteByDomain: realLookupSiteByDomain,
    loadCrawlResults:   realLoadCrawlResults,
    upsertUrlInventory: realUpsertUrlInventory,
    writeFieldSnapshots: realWriteFieldSnapshots,
    generateId:         () => randomUUID(),
  };
}

// ── runTracerScan ───────────────────────────────────────────────────────────

export async function runTracerScan(
  request: TracerScanRequest,
  _testOps?: Partial<TracerScanOps>,
): Promise<TracerScanResult> {
  const ops = _testOps ? { ...defaultOps(), ..._testOps } : defaultOps();
  const runId = ops.generateId();

  const fail = (error: string): TracerScanResult => ({
    run_id: runId,
    site_id: '',
    site: request.site,
    urls_inventoried: 0,
    snapshots_written: 0,
    protected_skipped: 0,
    status: 'failed',
    error,
  });

  // ── 1. Validate ───────────────────────────────────────────────────────────
  if (!request.site?.trim()) {
    return fail('site domain is required');
  }

  // ── 2. Resolve site_id ────────────────────────────────────────────────────
  let siteRecord: { site_id: string; tenant_id: string; cms_type: string };
  try {
    const found = await ops.lookupSiteByDomain(request.site);
    if (!found) return fail(`Site not found for domain: ${request.site}`);
    siteRecord = found;
  } catch (err) {
    return fail(`Site lookup error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. Load crawl results ─────────────────────────────────────────────────
  let crawlRows: CrawlResultRow[];
  try {
    crawlRows = await ops.loadCrawlResults(siteRecord.site_id);
    if (crawlRows.length === 0) {
      return fail(`No crawl_results found for site_id=${siteRecord.site_id}. Run vaeo crawl first.`);
    }
  } catch (err) {
    return fail(`Failed to load crawl results: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 4. Filter protected routes ────────────────────────────────────────────
  const protectedUrls = crawlRows.filter((r) => isProtectedRoute(r.url));
  const activeRows = crawlRows.filter((r) => !isProtectedRoute(r.url));

  // ── 5. Deduplicate by URL (keep most recent crawled_at) ───────────────────
  const urlMap = new Map<string, CrawlResultRow>();
  for (const row of activeRows) {
    const existing = urlMap.get(row.url);
    if (!existing || row.crawled_at > existing.crawled_at) {
      urlMap.set(row.url, row);
    }
  }
  const deduped = Array.from(urlMap.values());

  // ── 6. Build URL inventory rows ───────────────────────────────────────────
  const now = new Date().toISOString();
  const inventoryRows: UrlInventoryRow[] = deduped.map((row) => ({
    site_id:        siteRecord.site_id,
    url:            row.url,
    template_id:    deriveTemplateId(row.url),
    first_seen:     now,
    last_seen:      now,
    is_cms_managed: true,
    status:         deriveUrlStatus(row.status_code, row.redirect_chain),
  }));

  // ── 7. Build field snapshots ──────────────────────────────────────────────
  const allSnapshots: FieldSnapshotRow[] = [];
  for (const row of deduped) {
    const snapshots = extractFieldSnapshots(row, runId);
    allSnapshots.push(...snapshots);
  }

  // ── 8. Write to database ──────────────────────────────────────────────────
  try {
    await ops.upsertUrlInventory(inventoryRows);
  } catch (err) {
    return fail(`Failed to write URL inventory: ${err instanceof Error ? err.message : String(err)}`);
  }

  let snapshotsWritten = 0;
  try {
    snapshotsWritten = await ops.writeFieldSnapshots(allSnapshots);
  } catch (err) {
    return fail(`Failed to write field snapshots: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    run_id:            runId,
    site_id:           siteRecord.site_id,
    site:              request.site,
    urls_inventoried:  inventoryRows.length,
    snapshots_written: snapshotsWritten,
    protected_skipped: protectedUrls.length,
    status:            'completed',
  };
}

// ── CLI entry point ─────────────────────────────────────────────────────────

export async function runTracerScanCli(opts: { site: string }): Promise<void> {
  const result = await runTracerScan({ site: opts.site });

  if (result.status === 'completed') {
    process.stdout.write(
      `✓ Tracer scan completed — run_id: ${result.run_id}\n` +
      `  URLs inventoried: ${result.urls_inventoried}\n` +
      `  Field snapshots: ${result.snapshots_written}\n` +
      `  Protected routes skipped: ${result.protected_skipped}\n`,
    );
  } else {
    process.stderr.write(`✗ Tracer scan failed: ${result.error ?? 'unknown error'}\n`);
    process.exitCode = 1;
  }
}
