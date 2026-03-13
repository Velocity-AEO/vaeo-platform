import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  crawlWPMultisite,
  buildSubsiteCrawlConfig,
  mergeMultisiteIssues,
  type WPMultisiteCrawlConfig,
  type WPMultisiteCrawlResult,
} from './wp_multisite_crawler.js';
import type { WPCrawlResult } from './wp_crawler.js';
import type { WPMultisiteConfig } from './wp_multisite_detector.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMultisiteConfig(overrides?: Partial<WPMultisiteConfig>): WPMultisiteConfig {
  return {
    is_multisite:   true,
    multisite_type: 'subdomain',
    main_site_url:  'https://main.com',
    subsites: [
      { site_id: 1, url: 'https://main.com', name: 'Main', is_main: true },
      { site_id: 2, url: 'https://blog.main.com', name: 'Blog', is_main: false },
      { site_id: 3, url: 'https://shop.main.com', name: 'Shop', is_main: false },
    ],
    subsite_count: 3,
    detected_at:   new Date().toISOString(),
    ...overrides,
  };
}

function makeCrawlConfig(overrides?: Partial<WPMultisiteCrawlConfig>): WPMultisiteCrawlConfig {
  return {
    main_site_url:      'https://main.com',
    username:           'admin',
    app_password:       'pass123',
    multisite_config:   makeMultisiteConfig(),
    crawl_subsites:     true,
    max_subsites:       10,
    subsite_page_limit: 50,
    ...overrides,
  };
}

function mockCrawlResult(domain: string, pages: number): WPCrawlResult {
  return {
    site_id:                    `ms_${domain}`,
    domain,
    crawled_at:                 new Date().toISOString(),
    total_pages:                pages,
    pages:                      Array.from({ length: pages }, (_, i) => ({
      url:              `https://${domain}/page-${i}`,
      post_id:          i + 1,
      post_type:        'page' as const,
      title:            `Page ${i}`,
      has_schema:       i % 2 === 0,
      image_count:      1,
      word_count:       100,
      status:           'publish',
    })),
    woocommerce_products:       0,
    errors:                     [],
    noindex_pages_skipped:      0,
    redirect_chains_resolved:   0,
    circular_redirects_skipped: 0,
    max_hops_exceeded_skipped:  0,
    protected_pages_skipped:    0,
  };
}

// ── crawlWPMultisite ────────────────────────────────────────────────────────

describe('crawlWPMultisite', () => {
  it('crawls main site', async () => {
    const result = await crawlWPMultisite(makeCrawlConfig(), {
      crawlFn: async () => mockCrawlResult('main.com', 5),
    });
    assert.equal(result.main_site_result.total_pages, 5);
  });

  it('crawls subsites when crawl_subsites=true', async () => {
    const calls: string[] = [];
    const result = await crawlWPMultisite(makeCrawlConfig(), {
      crawlFn: async (config) => {
        calls.push(config.wp_url);
        return mockCrawlResult(config.domain, 3);
      },
    });
    assert.ok(calls.length >= 3); // main + 2 subsites
    assert.equal(result.subsite_results.length, 2);
  });

  it('skips subsites when crawl_subsites=false', async () => {
    const result = await crawlWPMultisite(
      makeCrawlConfig({ crawl_subsites: false }),
      { crawlFn: async () => mockCrawlResult('main.com', 5) },
    );
    assert.equal(result.subsite_results.length, 0);
    assert.equal(result.sites_skipped, 2);
  });

  it('respects max_subsites', async () => {
    const result = await crawlWPMultisite(
      makeCrawlConfig({ max_subsites: 1 }),
      { crawlFn: async (config) => mockCrawlResult(config.domain, 3) },
    );
    assert.equal(result.subsite_results.length, 1);
    assert.equal(result.sites_skipped, 1);
  });

  it('calculates total_pages_crawled', async () => {
    const result = await crawlWPMultisite(makeCrawlConfig(), {
      crawlFn: async () => mockCrawlResult('x.com', 4),
    });
    // main (4) + 2 subsites (4 each) = 12
    assert.equal(result.total_pages_crawled, 12);
  });

  it('returns partial on subsite error', async () => {
    let callCount = 0;
    const result = await crawlWPMultisite(makeCrawlConfig(), {
      crawlFn: async (config) => {
        callCount++;
        if (callCount === 2) throw new Error('subsite down');
        return mockCrawlResult(config.domain, 3);
      },
    });
    assert.ok(result.sites_crawled >= 1);
  });

  it('sites_crawled includes main', async () => {
    const result = await crawlWPMultisite(makeCrawlConfig(), {
      crawlFn: async () => mockCrawlResult('x.com', 1),
    });
    assert.ok(result.sites_crawled >= 1);
  });

  it('never throws on null config', async () => {
    await assert.doesNotReject(() => crawlWPMultisite(null as any));
  });
});

// ── buildSubsiteCrawlConfig ─────────────────────────────────────────────────

describe('buildSubsiteCrawlConfig', () => {
  it('uses parent credentials', () => {
    const config = buildSubsiteCrawlConfig('https://blog.main.com', makeCrawlConfig());
    assert.equal(config.username, 'admin');
    assert.equal(config.app_password, 'pass123');
  });

  it('sets wp_url to subsite url', () => {
    const config = buildSubsiteCrawlConfig('https://blog.main.com', makeCrawlConfig());
    assert.equal(config.wp_url, 'https://blog.main.com');
  });

  it('sets domain from subsite url', () => {
    const config = buildSubsiteCrawlConfig('https://blog.main.com', makeCrawlConfig());
    assert.equal(config.domain, 'blog.main.com');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildSubsiteCrawlConfig(null as any, null as any));
  });
});

// ── mergeMultisiteIssues ────────────────────────────────────────────────────

describe('mergeMultisiteIssues', () => {
  it('combines all issues from main and subsites', () => {
    const result: WPMultisiteCrawlResult = {
      main_site_result: mockCrawlResult('main.com', 2),
      subsite_results: [
        { subsite_url: 'https://blog.main.com', subsite_name: 'Blog', crawl_result: mockCrawlResult('blog.main.com', 2) },
      ],
      total_pages_crawled: 4,
      total_issues_found:  0,
      sites_crawled:       2,
      sites_skipped:       0,
    };
    const issues = mergeMultisiteIssues(result);
    assert.ok(issues.length > 0);
  });

  it('deduplicates by url+issue_type', () => {
    const crawl = mockCrawlResult('main.com', 1);
    // Same page in both main and subsite — should dedup
    const result: WPMultisiteCrawlResult = {
      main_site_result: crawl,
      subsite_results: [
        { subsite_url: 'https://main.com', subsite_name: 'Main', crawl_result: crawl },
      ],
      total_pages_crawled: 2,
      total_issues_found:  0,
      sites_crawled:       2,
      sites_skipped:       0,
    };
    const issues = mergeMultisiteIssues(result);
    const urls = issues.map(i => i.url);
    const unique = new Set(urls.map(u => u + '|' + issues.find(i => i.url === u)?.issue_type));
    assert.equal(issues.length, unique.size);
  });

  it('tags source_site_url', () => {
    const result: WPMultisiteCrawlResult = {
      main_site_result: mockCrawlResult('main.com', 1),
      subsite_results: [
        { subsite_url: 'https://blog.main.com', subsite_name: 'Blog', crawl_result: mockCrawlResult('blog.main.com', 1) },
      ],
      total_pages_crawled: 2,
      total_issues_found:  0,
      sites_crawled:       2,
      sites_skipped:       0,
    };
    const issues = mergeMultisiteIssues(result);
    const subsiteIssues = issues.filter(i => i.source_site_url === 'https://blog.main.com');
    assert.ok(subsiteIssues.length > 0);
  });

  it('handles empty result', () => {
    const result: WPMultisiteCrawlResult = {
      main_site_result: mockCrawlResult('main.com', 0),
      subsite_results:     [],
      total_pages_crawled: 0,
      total_issues_found:  0,
      sites_crawled:       1,
      sites_skipped:       0,
    };
    const issues = mergeMultisiteIssues(result);
    assert.deepEqual(issues, []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => mergeMultisiteIssues(null as any));
  });
});
