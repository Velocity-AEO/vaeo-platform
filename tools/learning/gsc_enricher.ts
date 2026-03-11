/**
 * tools/learning/gsc_enricher.ts
 *
 * Enriches learnings rows with GSC performance metrics (impressions, clicks, position, CTR).
 * Injectable gscClient and DB — never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GSCMetrics {
  url:         string;
  impressions: number;
  clicks:      number;
  position:    number;
  ctr:         number;
  fetched_at:  string;
}

export interface EnrichResult {
  ok:    boolean;
  error?: string;
}

export interface BatchEnrichResult {
  enriched: number;
  failed:   number;
}

// ── Injectable interfaces ─────────────────────────────────────────────────────

/** Minimal GSC client interface — returns GSCMetrics or null if not found. */
export interface GSCClient {
  getMetrics(url: string): Promise<GSCMetrics | null>;
}

/** Minimal DB interface for reading/updating learnings rows. */
export interface EnrichDb {
  from(table: 'learnings'): {
    select(cols: string): {
      eq(col: string, val: string): {
        is(col: string, val: null): Promise<{ data: Array<{ id: string; url: string }> | null; error: { message: string } | null }>;
      };
    };
    update(updates: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{ error: { message: string } | null }>;
    };
  };
}

// ── enrichLearningWithGSC ─────────────────────────────────────────────────────

/**
 * Fetch GSC metrics for a single URL and write to the learnings row.
 * Non-fatal — logs error to stderr but never throws.
 */
export async function enrichLearningWithGSC(
  learning_id: string,
  url:         string,
  gscClient:   GSCClient,
  db:          EnrichDb,
): Promise<void> {
  try {
    const metrics = await gscClient.getMetrics(url);
    if (!metrics) {
      process.stderr.write(`[gsc_enricher] No GSC data for ${url}\n`);
      return;
    }

    const { error } = await db
      .from('learnings')
      .update({ gsc_data: metrics })
      .eq('id', learning_id);

    if (error) {
      process.stderr.write(`[gsc_enricher] DB update failed for ${learning_id}: ${error.message}\n`);
    }
  } catch (err) {
    process.stderr.write(
      `[gsc_enricher] enrichLearningWithGSC failed for ${learning_id}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

// ── batchEnrichGSC ────────────────────────────────────────────────────────────

/**
 * Find all learnings for a site_id where gsc_data is null, then enrich each.
 * Returns { enriched, failed } counts.
 */
export async function batchEnrichGSC(
  site_id:   string,
  gscClient: GSCClient,
  db:        EnrichDb,
): Promise<BatchEnrichResult> {
  let enriched = 0;
  let failed   = 0;

  try {
    const { data, error } = await db
      .from('learnings')
      .select('id, url')
      .eq('site_id', site_id)
      .is('gsc_data', null);

    if (error || !data) {
      process.stderr.write(`[gsc_enricher] batchEnrichGSC query failed for site ${site_id}: ${error?.message ?? 'no data'}\n`);
      return { enriched: 0, failed: 0 };
    }

    for (const row of data) {
      try {
        await enrichLearningWithGSC(row.id, row.url ?? '', gscClient, db);
        enriched++;
      } catch {
        failed++;
      }
    }
  } catch (err) {
    process.stderr.write(
      `[gsc_enricher] batchEnrichGSC outer error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  return { enriched, failed };
}
