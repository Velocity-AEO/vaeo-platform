/**
 * tools/gsc-ingest/keyword_sync.ts
 *
 * Syncs Google Search Console keyword data into the tracer_gsc_cache table.
 * Fetches 90-day keyword data for all URLs in tracer_url_inventory,
 * and provides a top-keywords lookup for the title/meta generator.
 *
 * Pure logic with injectable deps — no direct I/O.
 *
 * Rate limiting: max 10 URLs per batch, 1 second delay between batches
 * to stay within GSC API quotas.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface GscCredentials {
  clientId:     string;
  clientSecret: string;
  refreshToken: string;
}

export interface GscKeywordRow {
  query:       string;
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
}

export interface GscCacheRow {
  site_id:     string;
  url:         string;
  query:       string;
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
  captured_at: string;
}

export interface UrlInventoryRow {
  url:    string;
  status: string;
}

export interface SyncResult {
  status:          'completed' | 'failed';
  urls_processed:  number;
  keywords_cached: number;
  batches:         number;
  errors:          string[];
  error?:          string;
}

export interface KeywordSyncDeps {
  /** Fetch keyword data from GSC Search Analytics API for a single URL. */
  fetchGscData: (siteUrl: string, pageUrl: string, credentials: GscCredentials) => Promise<GscKeywordRow[]>;
  /** Load all active URLs from tracer_url_inventory for a site. */
  loadUrlInventory: (siteId: string) => Promise<UrlInventoryRow[]>;
  /** Upsert keyword rows into tracer_gsc_cache. */
  upsertCache: (rows: GscCacheRow[]) => Promise<number>;
  /** Read top keywords from tracer_gsc_cache for a URL. */
  readCachedKeywords: (siteId: string, url: string, limit: number) => Promise<GscCacheRow[]>;
  /** Delay function — injectable for test skipping. */
  delay: (ms: number) => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const DAYS_BACK = 90;

// ── syncKeywordsForSite ──────────────────────────────────────────────────────

/**
 * Fetch 90-day keyword data from Google Search Console for all active URLs
 * in tracer_url_inventory, and store in tracer_gsc_cache.
 *
 * Rate-limited: processes at most 10 URLs per batch with a 1-second delay
 * between batches.
 */
export async function syncKeywordsForSite(
  siteId:         string,
  siteUrl:        string,
  gscCredentials: GscCredentials,
  deps:           KeywordSyncDeps,
): Promise<SyncResult> {
  if (!siteId?.trim()) {
    return { status: 'failed', urls_processed: 0, keywords_cached: 0, batches: 0, errors: [], error: 'siteId is required' };
  }
  if (!siteUrl?.trim()) {
    return { status: 'failed', urls_processed: 0, keywords_cached: 0, batches: 0, errors: [], error: 'siteUrl is required' };
  }
  if (!gscCredentials.clientId || !gscCredentials.clientSecret || !gscCredentials.refreshToken) {
    return { status: 'failed', urls_processed: 0, keywords_cached: 0, batches: 0, errors: [], error: 'GSC credentials are incomplete' };
  }

  // Load all active URLs
  let urls: UrlInventoryRow[];
  try {
    urls = await deps.loadUrlInventory(siteId);
  } catch (err) {
    return { status: 'failed', urls_processed: 0, keywords_cached: 0, batches: 0, errors: [], error: `Failed to load URL inventory: ${errMsg(err)}` };
  }

  const activeUrls = urls.filter((u) => u.status === 'active');
  if (activeUrls.length === 0) {
    return { status: 'completed', urls_processed: 0, keywords_cached: 0, batches: 0, errors: [] };
  }

  // Process in batches
  const batches = toBatches(activeUrls, BATCH_SIZE);
  let totalUrlsProcessed = 0;
  let totalKeywordsCached = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // Delay between batches (not before the first)
    if (i > 0) {
      await deps.delay(BATCH_DELAY_MS);
    }

    const cacheRows: GscCacheRow[] = [];

    for (const urlRow of batch) {
      try {
        const keywords = await deps.fetchGscData(siteUrl, urlRow.url, gscCredentials);
        for (const kw of keywords) {
          cacheRows.push({
            site_id:     siteId,
            url:         urlRow.url,
            query:       kw.query,
            clicks:      kw.clicks,
            impressions: kw.impressions,
            ctr:         kw.ctr,
            position:    kw.position,
            captured_at: now,
          });
        }
        totalUrlsProcessed++;
      } catch (err) {
        errors.push(`${urlRow.url}: ${errMsg(err)}`);
      }
    }

    // Upsert this batch's cache rows
    if (cacheRows.length > 0) {
      try {
        const written = await deps.upsertCache(cacheRows);
        totalKeywordsCached += written;
      } catch (err) {
        errors.push(`Batch ${i + 1} upsert failed: ${errMsg(err)}`);
      }
    }
  }

  return {
    status:          'completed',
    urls_processed:  totalUrlsProcessed,
    keywords_cached: totalKeywordsCached,
    batches:         batches.length,
    errors,
  };
}

// ── getTopKeywordsForUrl ─────────────────────────────────────────────────────

/**
 * Returns the top 5 keywords by clicks for a given URL from the
 * tracer_gsc_cache table. Used by the title_meta_generator.
 *
 * Returns an empty array if no data is cached.
 */
export async function getTopKeywordsForUrl(
  siteId: string,
  url:    string,
  deps:   Pick<KeywordSyncDeps, 'readCachedKeywords'>,
): Promise<GscKeywordRow[]> {
  if (!siteId?.trim() || !url?.trim()) return [];

  try {
    const cached = await deps.readCachedKeywords(siteId, url, 5);
    return cached.map((row) => ({
      query:       row.query,
      clicks:      row.clicks,
      impressions: row.impressions,
      ctr:         row.ctr,
      position:    row.position,
    }));
  } catch {
    return [];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toBatches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
