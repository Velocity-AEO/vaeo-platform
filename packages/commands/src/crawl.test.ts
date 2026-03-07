/**
 * packages/commands/src/crawl.test.ts
 *
 * Tests for runCrawl.
 * All external deps (Supabase lookup, crawler engine) are injected.
 * snapshot_id === run_id — no separate crawl_snapshots table.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runCrawl,
  type CrawlRequest,
  type CrawlCommandOps,
  type SiteLookup,
  type EngineResult,
} from './crawl.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXED_UUID   = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_V4_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SHOPIFY_SITE: SiteLookup = { cms_type: 'shopify', site_url: 'https://mystore.myshopify.com' };

function baseReq(overrides: Partial<CrawlRequest> = {}): CrawlRequest {
  return {
    site_id:   'site-uuid-001',
    tenant_id: 'tenant-uuid-001',
    ...overrides,
  };
}

function engineResult(urlsCrawled: number, urlsFailed = 0): EngineResult {
  return {
    run_id:       FIXED_UUID,
    tenant_id:    'tenant-uuid-001',
    site_id:      'site-uuid-001',
    urls_crawled: urlsCrawled,
    urls_failed:  urlsFailed,
    duration_ms:  1200,
    stored_at:    new Date().toISOString(),
  };
}

/** Happy-path ops. */
function happy(overrides: Partial<CrawlCommandOps> = {}): Partial<CrawlCommandOps> {
  return {
    lookupSite: async () => SHOPIFY_SITE,
    runCrawl:   async () => engineResult(100),
    generateId: () => FIXED_UUID,
    ...overrides,
  };
}

/** Capture all JSON log lines written to stdout during fn(). */
async function captureLog(fn: () => Promise<void>): Promise<Record<string, unknown>[]> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // @ts-expect-error — test-only stdout capture
  process.stdout.write = (chunk: unknown): boolean => { chunks.push(String(chunk)); return true; };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks
    .join('')
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => JSON.parse(l.trim()) as Record<string, unknown>);
}

// ── runCrawl — happy path ─────────────────────────────────────────────────────

describe('runCrawl — successful crawl returns status=completed with run_id', () => {
  it('returns status=completed when urls_crawled > 0 and urls_failed === 0', async () => {
    const result = await runCrawl(baseReq(), happy());
    assert.equal(result.status,       'completed');
    assert.equal(result.run_id,       FIXED_UUID);
    assert.equal(result.site_id,      'site-uuid-001');
    assert.equal(result.tenant_id,    'tenant-uuid-001');
    assert.equal(result.urls_crawled, 100);
    // snapshot_id === run_id (no separate crawl_snapshots table)
    assert.equal(result.snapshot_id,  FIXED_UUID);
    assert.equal(result.error,        undefined);
  });

  it('passes run_id, cms, start_url to the crawler engine', async () => {
    let capturedOpts: Parameters<CrawlCommandOps['runCrawl']>[0] | null = null;
    await runCrawl(baseReq(), happy({
      runCrawl: async (opts) => { capturedOpts = opts; return engineResult(50); },
    }));
    assert.ok(capturedOpts);
    assert.equal(capturedOpts.run_id,    FIXED_UUID);
    assert.equal(capturedOpts.cms,       'shopify');
    assert.equal(capturedOpts.start_url, 'https://mystore.myshopify.com');
    assert.equal(capturedOpts.site_id,   'site-uuid-001');
    assert.equal(capturedOpts.tenant_id, 'tenant-uuid-001');
  });

  it('passes max_urls and depth from request to the crawler', async () => {
    let capturedOpts: Parameters<CrawlCommandOps['runCrawl']>[0] | null = null;
    await runCrawl(baseReq({ max_urls: 500, depth: 5 }), happy({
      runCrawl: async (opts) => { capturedOpts = opts; return engineResult(50); },
    }));
    assert.ok(capturedOpts);
    assert.equal(capturedOpts.max_urls,  500);
    assert.equal(capturedOpts.max_depth, 5);
  });

  it('uses default max_urls=2000 and depth=3 when not specified', async () => {
    let capturedOpts: Parameters<CrawlCommandOps['runCrawl']>[0] | null = null;
    await runCrawl(baseReq(), happy({
      runCrawl: async (opts) => { capturedOpts = opts; return engineResult(10); },
    }));
    assert.ok(capturedOpts);
    assert.equal(capturedOpts.max_urls,  2000);
    assert.equal(capturedOpts.max_depth, 3);
  });

  it('prefixes bare hostname site_url with https://', async () => {
    let capturedUrl = '';
    await runCrawl(baseReq(), happy({
      lookupSite: async () => ({ cms_type: 'shopify', site_url: 'mystore.myshopify.com' }),
      runCrawl:   async (opts) => { capturedUrl = opts.start_url; return engineResult(10); },
    }));
    assert.equal(capturedUrl, 'https://mystore.myshopify.com');
  });

  it('leaves https:// site_url unchanged', async () => {
    let capturedUrl = '';
    await runCrawl(baseReq(), happy({
      runCrawl: async (opts) => { capturedUrl = opts.start_url; return engineResult(10); },
    }));
    assert.equal(capturedUrl, 'https://mystore.myshopify.com');
  });
});

// ── runCrawl — partial crawl ──────────────────────────────────────────────────

describe('runCrawl — partial crawl (some URLs failed)', () => {
  it('returns status=partial when urls_crawled > 0 and urls_failed > 0', async () => {
    const result = await runCrawl(baseReq(), happy({
      runCrawl: async () => engineResult(90, 10),
    }));
    assert.equal(result.status,       'partial');
    assert.equal(result.urls_crawled, 90);
    assert.equal(result.error,        undefined);
  });
});

// ── runCrawl — crawler failure returns status=failed without throwing ─────────

describe('runCrawl — crawler failure returns status=failed without throwing', () => {
  it('returns status=failed when runCrawl throws', async () => {
    const result = await runCrawl(baseReq(), happy({
      runCrawl: async () => { throw new Error('Playwright browser crashed'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Playwright browser crashed'));
    assert.equal(result.urls_crawled, 0);
  });

  it('does not throw when runCrawl throws', async () => {
    await assert.doesNotReject(() =>
      runCrawl(baseReq(), happy({
        runCrawl: async () => { throw new Error('fatal'); },
      })),
    );
  });

  it('returns status=failed when lookupSite returns null (site not found)', async () => {
    const result = await runCrawl(baseReq(), happy({ lookupSite: async () => null }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Site not found'));
  });

  it('returns status=failed when lookupSite throws', async () => {
    const result = await runCrawl(baseReq(), happy({
      lookupSite: async () => { throw new Error('Supabase timeout'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Supabase timeout'));
  });

  it('does not throw when lookupSite throws', async () => {
    await assert.doesNotReject(() =>
      runCrawl(baseReq(), happy({
        lookupSite: async () => { throw new Error('db error'); },
      })),
    );
  });

  it('returns status=failed when all pages fail (urls_crawled=0)', async () => {
    const result = await runCrawl(baseReq(), happy({
      runCrawl: async () => engineResult(0, 50),
    }));
    assert.equal(result.status, 'failed');
  });

  it('returns status=failed when site_id is empty', async () => {
    const result = await runCrawl({ ...baseReq(), site_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('site_id'));
  });

  it('returns status=failed when tenant_id is empty', async () => {
    const result = await runCrawl({ ...baseReq(), tenant_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('tenant_id'));
  });
});

// ── runCrawl — run_id is UUID v4 ──────────────────────────────────────────────

describe('runCrawl — run_id is a valid UUID v4', () => {
  it('generates a UUID v4 when generateId is not injected', async () => {
    const result = await runCrawl(baseReq(), {
      lookupSite: async () => SHOPIFY_SITE,
      runCrawl:   async () => engineResult(10),
      // generateId intentionally omitted → uses real crypto.randomUUID()
    });
    assert.match(result.run_id, UUID_V4_RE);
  });

  it('each runCrawl call generates a unique run_id', async () => {
    const ops: Partial<CrawlCommandOps> = {
      lookupSite: async () => SHOPIFY_SITE,
      runCrawl:   async () => engineResult(10),
    };
    const [r1, r2] = await Promise.all([
      runCrawl(baseReq(), ops),
      runCrawl(baseReq(), ops),
    ]);
    assert.notEqual(r1.run_id, r2.run_id);
  });

  it('snapshot_id equals run_id', async () => {
    const result = await runCrawl(baseReq(), happy());
    assert.equal(result.snapshot_id, result.run_id);
  });
});

// ── runCrawl — ActionLog receives crawl:start and crawl:complete ──────────────

describe('runCrawl — ActionLog entries', () => {
  it('writes crawl:start with status=pending before crawling', async () => {
    const entries = await captureLog(() => runCrawl(baseReq(), happy()));
    const start = entries.find((e) => e['stage'] === 'crawl:start');
    assert.ok(start, 'Expected crawl:start log entry');
    assert.equal(start['status'],    'pending');
    assert.equal(start['command'],   'crawl');
    assert.equal(start['cms'],       'shopify');
    assert.equal(start['tenant_id'], 'tenant-uuid-001');
    assert.equal(start['site_id'],   'site-uuid-001');
    assert.equal(start['run_id'],    FIXED_UUID);
  });

  it('writes crawl:complete with urls_crawled in metadata after crawling', async () => {
    const entries = await captureLog(() => runCrawl(baseReq(), happy()));
    const complete = entries.find((e) => e['stage'] === 'crawl:complete');
    assert.ok(complete, 'Expected crawl:complete log entry');
    assert.equal(complete['status'],  'ok');
    assert.equal(complete['command'], 'crawl');
    const meta = complete['metadata'] as Record<string, unknown>;
    assert.equal(meta['urls_crawled'], 100);
    assert.equal(meta['status'],       'completed');
  });

  it('crawl:start is written before crawl:complete', async () => {
    const entries = await captureLog(() => runCrawl(baseReq(), happy()));
    const startIdx    = entries.findIndex((e) => e['stage'] === 'crawl:start');
    const completeIdx = entries.findIndex((e) => e['stage'] === 'crawl:complete');
    assert.ok(startIdx    >= 0, 'crawl:start not found');
    assert.ok(completeIdx >= 0, 'crawl:complete not found');
    assert.ok(startIdx < completeIdx, 'crawl:start must precede crawl:complete');
  });

  it('writes crawl:failed (not crawl:complete) when crawler throws', async () => {
    const entries = await captureLog(() =>
      runCrawl(baseReq(), happy({
        runCrawl: async () => { throw new Error('crash'); },
      })),
    );
    const failed   = entries.find((e) => e['stage'] === 'crawl:failed');
    const complete = entries.find((e) => e['stage'] === 'crawl:complete');
    assert.ok(failed,    'Expected crawl:failed entry');
    assert.equal(failed['status'], 'failed');
    assert.equal(complete, undefined, 'crawl:complete must NOT appear when crawler throws');
  });

  it('writes crawl:complete with status=failed when all URLs fail', async () => {
    const entries = await captureLog(() =>
      runCrawl(baseReq(), happy({
        runCrawl: async () => engineResult(0, 20),
      })),
    );
    const complete = entries.find((e) => e['stage'] === 'crawl:complete');
    assert.ok(complete);
    assert.equal(complete['status'], 'failed');
  });
});

// ── runCrawl — urls_crawled matches crawler output ────────────────────────────

describe('runCrawl — urls_crawled matches crawler output count', () => {
  it('echoes urls_crawled from engine result', async () => {
    const result = await runCrawl(baseReq(), happy({
      runCrawl: async () => engineResult(340),
    }));
    assert.equal(result.urls_crawled, 340);
  });

  it('urls_crawled=0 on crawler throw', async () => {
    const result = await runCrawl(baseReq(), happy({
      runCrawl: async () => { throw new Error('oops'); },
    }));
    assert.equal(result.urls_crawled, 0);
  });
});

// ── runCrawl — result shape ───────────────────────────────────────────────────

describe('runCrawl — result fields', () => {
  it('started_at and completed_at are ISO 8601 timestamps', async () => {
    const result = await runCrawl(baseReq(), happy());
    assert.ok(!isNaN(Date.parse(result.started_at)));
    assert.ok(!isNaN(Date.parse(result.completed_at)));
  });

  it('completed_at >= started_at', async () => {
    const result = await runCrawl(baseReq(), happy());
    assert.ok(new Date(result.completed_at) >= new Date(result.started_at));
  });

  it('all required fields present', async () => {
    const result = await runCrawl(baseReq(), happy());
    assert.equal(typeof result.run_id,       'string');
    assert.equal(typeof result.site_id,      'string');
    assert.equal(typeof result.tenant_id,    'string');
    assert.equal(typeof result.urls_crawled, 'number');
    assert.equal(typeof result.snapshot_id,  'string');
    assert.equal(typeof result.started_at,   'string');
    assert.equal(typeof result.completed_at, 'string');
    assert.ok(['completed', 'failed', 'partial'].includes(result.status));
  });
});
