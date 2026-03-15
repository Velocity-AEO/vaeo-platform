import { NextResponse } from 'next/server';
import { runLiveProduction } from '@tools/live/live_run_orchestrator.js';
import { defaultTarget, type LiveRunTarget } from '@tools/live/live_run_config.js';
import type { CrawlResult, DiscoveredPage } from '@tools/live/page_discovery.js';
import type { AggregatedIssue, IssueAggregation } from '@tools/live/issue_aggregator.js';
import type { FixBatch, FixAttempt } from '@tools/live/live_fix_executor.js';
import type { SystemHealthReport } from '@tools/live/live_run_orchestrator.js';

// Simulated crawl data
function mockDiscoverPages(): CrawlResult {
  const pages: DiscoveredPage[] = [
    { url: 'https://demo-store.com/', status_code: 200, depth: 0, page_type: 'homepage', priority: 'high', html_size_bytes: 45000 },
    { url: 'https://demo-store.com/products/classic-tee', status_code: 200, depth: 1, page_type: 'product', priority: 'high', html_size_bytes: 32000 },
    { url: 'https://demo-store.com/products/summer-dress', status_code: 200, depth: 1, page_type: 'product', priority: 'high', html_size_bytes: 28000 },
    { url: 'https://demo-store.com/products/denim-jacket', status_code: 200, depth: 1, page_type: 'product', priority: 'high', html_size_bytes: 35000 },
    { url: 'https://demo-store.com/collections/all', status_code: 200, depth: 1, page_type: 'collection', priority: 'medium', html_size_bytes: 52000 },
    { url: 'https://demo-store.com/collections/new', status_code: 200, depth: 1, page_type: 'collection', priority: 'medium', html_size_bytes: 48000 },
    { url: 'https://demo-store.com/blogs/news/spring-collection', status_code: 200, depth: 2, page_type: 'blog', priority: 'medium', html_size_bytes: 18000 },
    { url: 'https://demo-store.com/blogs/news/sale-announcement', status_code: 200, depth: 2, page_type: 'blog', priority: 'medium', html_size_bytes: 15000 },
    { url: 'https://demo-store.com/pages/about', status_code: 200, depth: 1, page_type: 'page', priority: 'low', html_size_bytes: 12000 },
    { url: 'https://demo-store.com/pages/contact', status_code: 200, depth: 1, page_type: 'page', priority: 'low', html_size_bytes: 8000 },
    { url: 'https://demo-store.com/pages/faq', status_code: 200, depth: 1, page_type: 'page', priority: 'low', html_size_bytes: 14000 },
    { url: 'https://demo-store.com/pages/shipping', status_code: 200, depth: 1, page_type: 'page', priority: 'low', html_size_bytes: 10000 },
  ];
  return {
    site_id: 'demo-store', domain: 'demo-store.com', pages,
    total_discovered: pages.length, crawl_duration_ms: 2340,
    errors: [], crawled_at: new Date().toISOString(),
  };
}

function mockAggregateIssues(
  site_id: string, run_id: string, pages: DiscoveredPage[], fix_types: string[],
): IssueAggregation {
  const issues: AggregatedIssue[] = [
    { issue_id: 'iss_1', site_id, url: pages[0]?.url ?? '', fix_type: 'title_missing', severity: 'critical', title: 'Missing page title', description: 'Homepage has no title', auto_fixable: true, confidence: 0.95, detected_at: new Date().toISOString() },
    { issue_id: 'iss_2', site_id, url: pages[1]?.url ?? '', fix_type: 'meta_description_missing', severity: 'high', title: 'Missing meta description', description: 'Product page has no meta description', auto_fixable: true, confidence: 0.92, detected_at: new Date().toISOString() },
    { issue_id: 'iss_3', site_id, url: pages[2]?.url ?? '', fix_type: 'meta_description_missing', severity: 'high', title: 'Missing meta description', description: 'Product page has no meta description', auto_fixable: true, confidence: 0.92, detected_at: new Date().toISOString() },
    { issue_id: 'iss_4', site_id, url: pages[3]?.url ?? '', fix_type: 'image_alt_missing', severity: 'medium', title: 'Image missing alt text', description: 'Product image lacks alt text', auto_fixable: true, confidence: 0.88, detected_at: new Date().toISOString() },
    { issue_id: 'iss_5', site_id, url: pages[4]?.url ?? '', fix_type: 'schema_missing', severity: 'high', title: 'Missing structured data', description: 'Collection page has no schema', auto_fixable: true, confidence: 0.90, detected_at: new Date().toISOString() },
    { issue_id: 'iss_6', site_id, url: pages[5]?.url ?? '', fix_type: 'schema_missing', severity: 'high', title: 'Missing structured data', description: 'Collection page has no schema', auto_fixable: true, confidence: 0.90, detected_at: new Date().toISOString() },
    { issue_id: 'iss_7', site_id, url: pages[0]?.url ?? '', fix_type: 'canonical_missing', severity: 'medium', title: 'Missing canonical URL', description: 'Homepage has no canonical tag', auto_fixable: true, confidence: 0.85, detected_at: new Date().toISOString() },
    { issue_id: 'iss_8', site_id, url: pages[1]?.url ?? '', fix_type: 'canonical_missing', severity: 'medium', title: 'Missing canonical URL', description: 'Product page has no canonical tag', auto_fixable: true, confidence: 0.85, detected_at: new Date().toISOString() },
    { issue_id: 'iss_9', site_id, url: pages[0]?.url ?? '', fix_type: 'lang_missing', severity: 'low', title: 'Missing lang attribute', description: 'HTML element has no lang attribute', auto_fixable: true, confidence: 0.80, detected_at: new Date().toISOString() },
    { issue_id: 'iss_10', site_id, url: pages[6]?.url ?? '', fix_type: 'image_alt_missing', severity: 'medium', title: 'Image missing alt text', description: 'Blog post image lacks alt text', auto_fixable: true, confidence: 0.75, detected_at: new Date().toISOString() },
    { issue_id: 'iss_11', site_id, url: pages[7]?.url ?? '', fix_type: 'meta_description_missing', severity: 'high', title: 'Missing meta description', description: 'Blog post has no meta description', auto_fixable: true, confidence: 0.92, detected_at: new Date().toISOString() },
    { issue_id: 'iss_12', site_id, url: pages[2]?.url ?? '', fix_type: 'image_alt_missing', severity: 'medium', title: 'Image missing alt text', description: 'Product image lacks alt text', auto_fixable: true, confidence: 0.88, detected_at: new Date().toISOString() },
    { issue_id: 'iss_13', site_id, url: pages[8]?.url ?? '', fix_type: 'title_missing', severity: 'critical', title: 'Missing page title', description: 'About page has no title', auto_fixable: true, confidence: 0.95, detected_at: new Date().toISOString() },
    { issue_id: 'iss_14', site_id, url: pages[3]?.url ?? '', fix_type: 'schema_missing', severity: 'high', title: 'Missing structured data', description: 'Product page has no schema', auto_fixable: true, confidence: 0.90, detected_at: new Date().toISOString() },
    { issue_id: 'iss_15', site_id, url: pages[9]?.url ?? '', fix_type: 'lang_missing', severity: 'low', title: 'Missing lang attribute', description: 'Contact page has no lang', auto_fixable: true, confidence: 0.80, detected_at: new Date().toISOString() },
    { issue_id: 'iss_16', site_id, url: pages[4]?.url ?? '', fix_type: 'canonical_missing', severity: 'medium', title: 'Missing canonical URL', description: 'Collection has no canonical', auto_fixable: true, confidence: 0.85, detected_at: new Date().toISOString() },
    { issue_id: 'iss_17', site_id, url: pages[10]?.url ?? '', fix_type: 'meta_description_missing', severity: 'high', title: 'Missing meta description', description: 'FAQ page has no meta description', auto_fixable: true, confidence: 0.92, detected_at: new Date().toISOString() },
    { issue_id: 'iss_18', site_id, url: pages[11]?.url ?? '', fix_type: 'image_alt_missing', severity: 'medium', title: 'Image missing alt text', description: 'Shipping page image lacks alt', auto_fixable: true, confidence: 0.75, detected_at: new Date().toISOString() },
  ];
  return {
    site_id, run_id, total_issues: issues.length,
    by_severity: { critical: 2, high: 7, medium: 6, low: 3 },
    by_fix_type: { title_missing: 2, meta_description_missing: 4, image_alt_missing: 4, schema_missing: 3, canonical_missing: 3, lang_missing: 2 },
    auto_fixable_count: 14, requires_review_count: 4,
    issues, aggregated_at: new Date().toISOString(),
  };
}

async function mockExecuteFixBatch(
  issues: AggregatedIssue[], site_id: string, run_id: string, dry_run: boolean,
): Promise<FixBatch> {
  const attempts: FixAttempt[] = issues.slice(0, 14).map((issue, i) => {
    const success = i < 12;
    return {
      attempt_id: `att_${i}`, issue,
      started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      success, html_before: '<html></html>', html_after: '<html><title>Fixed</title></html>',
      sandbox_passed: success, deployed: success && !dry_run, dry_run,
      error: success ? undefined : 'Sandbox regression detected',
      timed_out: false, elapsed_ms: 120 + i * 10,
      debug_events: [`[apply] ${issue.fix_type}`, `[sandbox] passed=${success}`],
    };
  });
  return {
    batch_id: 'bat_demo', run_id, site_id, attempts,
    success_count: 12, failure_count: 2, sandbox_pass_count: 12,
    deploy_count: dry_run ? 0 : 12, executed_at: new Date().toISOString(), dry_run,
  };
}

let lastResult: Awaited<ReturnType<typeof runLiveProduction>> | null = null;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const target: LiveRunTarget = {
    ...defaultTarget(
      body.site_id ?? 'demo-store',
      body.domain ?? 'demo-store.com',
      body.platform ?? 'shopify',
    ),
    dry_run: body.dry_run ?? false,
    max_pages: body.max_pages ?? 50,
  };

  const result = await runLiveProduction(target, {
    discoverPages: async () => mockDiscoverPages(),
    aggregateIssues: mockAggregateIssues,
    executeFixBatch: mockExecuteFixBatch,
    runHealthMonitor: async () => ({
      report_id: 'health_demo',
      overall_status: 'green' as const,
      checked_at: new Date().toISOString(),
    }),
  });

  lastResult = result;

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  if (!lastResult) {
    return NextResponse.json({ error: 'No run executed yet' }, { status: 404 });
  }
  return NextResponse.json(lastResult, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
