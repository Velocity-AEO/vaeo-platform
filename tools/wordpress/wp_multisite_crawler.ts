/**
 * tools/wordpress/wp_multisite_crawler.ts
 *
 * Crawler adapter for WordPress multisite installs.
 * Crawls main site and subsites with shared credentials.
 * Never throws at outer level.
 */

import type { WPConnectionConfig } from './wp_connection.js';
import type { WPCrawlResult, WPPage } from './wp_crawler.js';
import type { WPMultisiteConfig } from './wp_multisite_detector.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WPMultisiteCrawlConfig {
  main_site_url:      string;
  username:           string;
  app_password:       string;
  multisite_config:   WPMultisiteConfig;
  crawl_subsites:     boolean;
  max_subsites:       number;
  subsite_page_limit: number;
}

export interface SubsiteCrawlResult {
  subsite_url:   string;
  subsite_name:  string;
  crawl_result:  WPCrawlResult;
}

export interface WPMultisiteCrawlResult {
  main_site_result:    WPCrawlResult;
  subsite_results:     SubsiteCrawlResult[];
  total_pages_crawled: number;
  total_issues_found:  number;
  sites_crawled:       number;
  sites_skipped:       number;
}

export interface WPIssue {
  url:             string;
  issue_type:      string;
  severity:        string;
  source_site_url?: string;
}

export interface MultisiteCrawlDeps {
  crawlFn?: (config: WPConnectionConfig) => Promise<WPCrawlResult>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyResult(): WPCrawlResult {
  return {
    site_id:                    '',
    domain:                     '',
    crawled_at:                 new Date().toISOString(),
    total_pages:                0,
    pages:                      [],
    woocommerce_products:       0,
    errors:                     [],
    noindex_pages_skipped:      0,
    redirect_chains_resolved:   0,
    circular_redirects_skipped: 0,
    max_hops_exceeded_skipped:  0,
    protected_pages_skipped:    0,
  };
}

function defaultCrawlFn(_config: WPConnectionConfig): Promise<WPCrawlResult> {
  return Promise.resolve(emptyResult());
}

// ── buildSubsiteCrawlConfig ─────────────────────────────────────────────────

export function buildSubsiteCrawlConfig(
  subsite_url: string,
  parent_config: WPMultisiteCrawlConfig,
): WPConnectionConfig {
  try {
    const url = (subsite_url ?? '').replace(/\/$/, '');
    let domain = '';
    try { domain = new URL(url).hostname; } catch { domain = url; }

    return {
      site_id:      `ms_${domain}`,
      domain,
      wp_url:       url,
      username:     parent_config?.username ?? '',
      app_password: parent_config?.app_password ?? '',
      platform:     'wordpress',
    };
  } catch {
    return {
      site_id:      '',
      domain:       '',
      wp_url:       subsite_url ?? '',
      username:     parent_config?.username ?? '',
      app_password: parent_config?.app_password ?? '',
      platform:     'wordpress',
    };
  }
}

// ── crawlWPMultisite ────────────────────────────────────────────────────────

export async function crawlWPMultisite(
  config: WPMultisiteCrawlConfig,
  deps?: MultisiteCrawlDeps,
): Promise<WPMultisiteCrawlResult> {
  const crawlFn = deps?.crawlFn ?? defaultCrawlFn;

  const emptyMultiResult: WPMultisiteCrawlResult = {
    main_site_result:    emptyResult(),
    subsite_results:     [],
    total_pages_crawled: 0,
    total_issues_found:  0,
    sites_crawled:       0,
    sites_skipped:       0,
  };

  try {
    // Crawl main site
    let domain = '';
    try { domain = new URL(config.main_site_url).hostname; } catch { domain = config.main_site_url; }

    const mainConfig: WPConnectionConfig = {
      site_id:      `ms_main_${domain}`,
      domain,
      wp_url:       config.main_site_url,
      username:     config.username,
      app_password: config.app_password,
      platform:     'wordpress',
    };

    let mainResult: WPCrawlResult;
    try {
      mainResult = await crawlFn(mainConfig);
    } catch {
      mainResult = emptyResult();
    }

    let sites_crawled = 1;
    let sites_skipped = 0;
    const subsite_results: SubsiteCrawlResult[] = [];

    // Crawl subsites
    if (config.crawl_subsites && config.multisite_config?.subsites) {
      const subsites = config.multisite_config.subsites
        .filter(s => !s.is_main)
        .slice(0, config.max_subsites > 0 ? config.max_subsites : Infinity);

      const skippedCount = Math.max(0,
        config.multisite_config.subsites.filter(s => !s.is_main).length - subsites.length,
      );
      sites_skipped = skippedCount;

      for (const subsite of subsites) {
        try {
          const subConfig = buildSubsiteCrawlConfig(subsite.url, config);
          const subResult = await crawlFn(subConfig);
          subsite_results.push({
            subsite_url:  subsite.url,
            subsite_name: subsite.name,
            crawl_result: subResult,
          });
          sites_crawled++;
        } catch {
          sites_skipped++;
        }
      }
    } else if (config.multisite_config?.subsites) {
      sites_skipped = config.multisite_config.subsites.filter(s => !s.is_main).length;
    }

    const total_pages_crawled = mainResult.total_pages +
      subsite_results.reduce((s, r) => s + r.crawl_result.total_pages, 0);

    return {
      main_site_result: mainResult,
      subsite_results,
      total_pages_crawled,
      total_issues_found: 0,
      sites_crawled,
      sites_skipped,
    };
  } catch {
    return emptyMultiResult;
  }
}

// ── mergeMultisiteIssues ────────────────────────────────────────────────────

export function mergeMultisiteIssues(
  result: WPMultisiteCrawlResult,
): WPIssue[] {
  try {
    const issues: WPIssue[] = [];
    const seen = new Set<string>();

    // Main site issues — derive from pages missing meta/schema
    const mainUrl = result?.main_site_result?.domain ?? 'main';
    for (const page of (result?.main_site_result?.pages ?? [])) {
      if (!page.meta_description) {
        const key = `${page.url}|META_DESC_MISSING`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.push({
            url:             page.url,
            issue_type:      'META_DESC_MISSING',
            severity:        'medium',
            source_site_url: mainUrl,
          });
        }
      }
      if (!page.has_schema) {
        const key = `${page.url}|SCHEMA_MISSING`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.push({
            url:             page.url,
            issue_type:      'SCHEMA_MISSING',
            severity:        'high',
            source_site_url: mainUrl,
          });
        }
      }
    }

    // Subsite issues
    for (const sub of (result?.subsite_results ?? [])) {
      const sourceUrl = sub.subsite_url ?? sub.subsite_name;
      for (const page of (sub.crawl_result?.pages ?? [])) {
        if (!page.meta_description) {
          const key = `${page.url}|META_DESC_MISSING`;
          if (!seen.has(key)) {
            seen.add(key);
            issues.push({
              url:             page.url,
              issue_type:      'META_DESC_MISSING',
              severity:        'medium',
              source_site_url: sourceUrl,
            });
          }
        }
        if (!page.has_schema) {
          const key = `${page.url}|SCHEMA_MISSING`;
          if (!seen.has(key)) {
            seen.add(key);
            issues.push({
              url:             page.url,
              issue_type:      'SCHEMA_MISSING',
              severity:        'high',
              source_site_url: sourceUrl,
            });
          }
        }
      }
    }

    return issues;
  } catch {
    return [];
  }
}
