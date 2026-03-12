/**
 * tools/jobs/crawl_processor.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processCrawlJob,
  processCrawlBatch,
  type CrawlProcessorDeps,
} from './crawl_processor.ts';
import type { Job } from './job_queue.ts';
import type { SitemapURL } from '../tracer/sitemap_discovery.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:           crypto.randomUUID(),
    site_id:      'site-1',
    job_type:     'crawl_site',
    status:       'running',
    payload:      { site_url: 'https://example.com' },
    priority:     5,
    attempts:     1,
    max_attempts: 3,
    scheduled_at: new Date().toISOString(),
    created_at:   new Date().toISOString(),
    ...overrides,
  };
}

const SAMPLE_URLS: SitemapURL[] = [
  { url: 'https://example.com/', priority: 1 },
  { url: 'https://example.com/about', priority: 0.8 },
  { url: 'https://example.com/products', priority: 0.9 },
];

function makeDeps(overrides: Partial<CrawlProcessorDeps> = {}): CrawlProcessorDeps & {
  completed: string[];
  failed:    { id: string; error: string }[];
  stored:    unknown[];
} {
  const completed: string[] = [];
  const failed:    { id: string; error: string }[] = [];
  const stored:    unknown[] = [];

  return {
    discoverURLs: async () => SAMPLE_URLS,
    completeJob:  async (id) => { completed.push(id); },
    failJob:      async (id, err) => { failed.push({ id, error: err }); },
    storeResult:  async (r) => { stored.push(r); },
    completed,
    failed,
    stored,
    ...overrides,
  };
}

// ── processCrawlJob ────────────────────────────────────────────────────────────

describe('processCrawlJob', () => {
  it('discovers URLs and completes the job', async () => {
    const deps = makeDeps();
    const job  = makeJob();
    const r    = await processCrawlJob(job, null, deps);

    assert.equal(r.urls_discovered, 3);
    assert.equal(r.urls.length, 3);
    assert.ok(!r.error);
    assert.deepEqual(deps.completed, [job.id]);
    assert.equal(deps.failed.length, 0);
  });

  it('stores result when storeResult dep is provided', async () => {
    const deps = makeDeps();
    const job  = makeJob();
    await processCrawlJob(job, null, deps);

    assert.equal(deps.stored.length, 1);
    const stored = deps.stored[0] as Record<string, unknown>;
    assert.equal(stored['job_id'], job.id);
    assert.equal(stored['site_id'], job.site_id);
  });

  it('does NOT call storeResult when dep is absent', async () => {
    const deps = makeDeps();
    delete (deps as Partial<typeof deps>).storeResult;
    const job  = makeJob();
    await processCrawlJob(job, null, deps);

    assert.equal(deps.stored.length, 0);
    assert.deepEqual(deps.completed, [job.id]);
  });

  it('returns crawled_at timestamp as ISO string', async () => {
    const deps = makeDeps();
    const job  = makeJob();
    const r    = await processCrawlJob(job, null, deps);

    assert.ok(typeof r.crawled_at === 'string');
    assert.ok(!isNaN(Date.parse(r.crawled_at)));
  });

  it('sets site_id and job_id in result', async () => {
    const deps = makeDeps();
    const job  = makeJob({ site_id: 'site-xyz' });
    const r    = await processCrawlJob(job, null, deps);

    assert.equal(r.site_id, 'site-xyz');
    assert.equal(r.job_id, job.id);
  });

  it('fails job when site_url missing from payload', async () => {
    const deps = makeDeps();
    const job  = makeJob({ payload: {} });
    const r    = await processCrawlJob(job, null, deps);

    assert.ok(r.error);
    assert.equal(r.urls_discovered, 0);
    assert.equal(r.urls.length, 0);
    assert.equal(deps.failed.length, 1);
    assert.equal(deps.completed.length, 0);
  });

  it('includes error message referencing missing site_url', async () => {
    const deps = makeDeps();
    const job  = makeJob({ payload: {} });
    const r    = await processCrawlJob(job, null, deps);

    assert.ok(r.error!.includes('site_url'));
  });

  it('fails job when discoverURLs throws', async () => {
    const deps = makeDeps({
      discoverURLs: async () => { throw new Error('network timeout'); },
    });
    const job  = makeJob();
    const r    = await processCrawlJob(job, null, deps);

    assert.ok(r.error!.includes('network timeout'));
    assert.equal(deps.failed[0]?.error, 'network timeout');
    assert.equal(deps.completed.length, 0);
  });

  it('respects max_urls from payload', async () => {
    let capturedOpts: Record<string, unknown> = {};
    const deps = makeDeps({
      discoverURLs: async (_url, opts) => {
        capturedOpts = opts as Record<string, unknown>;
        return SAMPLE_URLS;
      },
    });
    const job = makeJob({ payload: { site_url: 'https://example.com', max_urls: 100 } });
    await processCrawlJob(job, null, deps);

    assert.equal(capturedOpts['maxUrls'], 100);
  });

  it('defaults max_urls to 500 when not in payload', async () => {
    let capturedOpts: Record<string, unknown> = {};
    const deps = makeDeps({
      discoverURLs: async (_url, opts) => {
        capturedOpts = opts as Record<string, unknown>;
        return SAMPLE_URLS;
      },
    });
    const job = makeJob({ payload: { site_url: 'https://example.com' } });
    await processCrawlJob(job, null, deps);

    assert.equal(capturedOpts['maxUrls'], 500);
  });

  it('never throws when all deps are null', async () => {
    const nullDeps: CrawlProcessorDeps = {
      discoverURLs: async () => { throw new Error('boom'); },
      completeJob:  async () => {},
      failJob:      async () => {},
    };
    await assert.doesNotReject(() => processCrawlJob(makeJob(), null, nullDeps));
  });
});

// ── processCrawlBatch ──────────────────────────────────────────────────────────

describe('processCrawlBatch', () => {
  it('processes multiple jobs and returns aggregate stats', async () => {
    const deps = makeDeps();
    const jobs = [makeJob(), makeJob(), makeJob()];
    const r    = await processCrawlBatch(jobs, null, deps);

    assert.equal(r.processed, 3);
    assert.equal(r.succeeded, 3);
    assert.equal(r.failed, 0);
    assert.equal(r.results.length, 3);
  });

  it('counts failed jobs separately', async () => {
    let callCount = 0;
    const deps = makeDeps({
      discoverURLs: async () => {
        if (callCount++ === 1) throw new Error('timeout');
        return SAMPLE_URLS;
      },
    });
    const jobs = [makeJob(), makeJob(), makeJob()];
    const r    = await processCrawlBatch(jobs, null, deps);

    assert.equal(r.processed, 3);
    assert.equal(r.succeeded, 2);
    assert.equal(r.failed, 1);
  });

  it('returns empty results for empty job list', async () => {
    const deps = makeDeps();
    const r    = await processCrawlBatch([], null, deps);

    assert.equal(r.processed, 0);
    assert.equal(r.succeeded, 0);
    assert.equal(r.failed, 0);
    assert.deepEqual(r.results, []);
  });

  it('never throws', async () => {
    const deps = makeDeps({
      discoverURLs: async () => { throw new Error('boom'); },
    });
    await assert.doesNotReject(() => processCrawlBatch([makeJob()], null, deps));
  });
});
