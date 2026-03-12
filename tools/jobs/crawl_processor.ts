/**
 * tools/jobs/crawl_processor.ts
 *
 * Processes a `crawl_site` job from the job queue.
 *
 * Flow:
 *   1. Discover URLs from site's sitemap via discoverURLs
 *   2. Store discovered URLs as a result in the job's payload / a results table
 *   3. Mark the job complete (or fail it on error)
 *
 * All dependencies are injectable. Never throws.
 */

import { discoverURLs, type SitemapURL } from '../tracer/sitemap_discovery.js';
import { completeJob, failJob, type Job } from './job_queue.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrawlResult {
  site_id:        string;
  job_id:         string;
  urls_discovered: number;
  urls:           SitemapURL[];
  crawled_at:     string;
  error?:         string;
}

export interface CrawlProcessorDeps {
  discoverURLs:  (siteUrl: string, opts?: { maxUrls?: number; fetch?: typeof globalThis.fetch }) => Promise<SitemapURL[]>;
  completeJob:   (jobId: string, db: unknown) => Promise<void>;
  failJob:       (jobId: string, error: string, db: unknown) => Promise<void>;
  storeResult?:  (result: CrawlResult, db: unknown) => Promise<void>;
}

export const defaultCrawlDeps: CrawlProcessorDeps = {
  discoverURLs,
  completeJob,
  failJob,
};

// ── processCrawlJob ───────────────────────────────────────────────────────────

/**
 * Process a single crawl_site job.
 * Returns a CrawlResult — never throws.
 */
export async function processCrawlJob(
  job:  Job,
  db:   unknown,
  deps: CrawlProcessorDeps = defaultCrawlDeps,
): Promise<CrawlResult> {
  const siteUrl = (job.payload as Record<string, unknown>)['site_url'] as string | undefined;

  if (!siteUrl) {
    const errMsg = 'crawl_site job missing site_url in payload';
    await deps.failJob(job.id, errMsg, db);
    return { site_id: job.site_id, job_id: job.id, urls_discovered: 0, urls: [], crawled_at: new Date().toISOString(), error: errMsg };
  }

  try {
    const maxUrls = (job.payload as Record<string, unknown>)['max_urls'] as number | undefined ?? 500;
    const urls = await deps.discoverURLs(siteUrl, { maxUrls });

    const result: CrawlResult = {
      site_id:         job.site_id,
      job_id:          job.id,
      urls_discovered: urls.length,
      urls,
      crawled_at:      new Date().toISOString(),
    };

    if (deps.storeResult) {
      await deps.storeResult(result, db);
    }

    await deps.completeJob(job.id, db);
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await deps.failJob(job.id, errMsg, db);
    return {
      site_id:         job.site_id,
      job_id:          job.id,
      urls_discovered: 0,
      urls:            [],
      crawled_at:      new Date().toISOString(),
      error:           errMsg,
    };
  }
}

// ── processCrawlBatch ─────────────────────────────────────────────────────────

export interface BatchCrawlResult {
  processed: number;
  succeeded: number;
  failed:    number;
  results:   CrawlResult[];
}

/**
 * Process multiple crawl_site jobs in sequence.
 * Never throws.
 */
export async function processCrawlBatch(
  jobs: Job[],
  db:   unknown,
  deps: CrawlProcessorDeps = defaultCrawlDeps,
): Promise<BatchCrawlResult> {
  const results: CrawlResult[] = [];
  let succeeded = 0;
  let failed    = 0;

  for (const job of jobs) {
    const r = await processCrawlJob(job, db, deps);
    results.push(r);
    if (r.error) failed++;
    else         succeeded++;
  }

  return { processed: jobs.length, succeeded, failed, results };
}
