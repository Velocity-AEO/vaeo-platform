import { NextResponse } from 'next/server';
import { generateValueReport, exportReportAsText } from '../../../../../../../tools/value/value_report.js';
import type { SiteStats, RankingSnapshot, KeywordRanking } from '../../../../../../../tools/value/value_calculator.js';
import type { FixHistoryEntry } from '../../../../../../../tools/value/before_after.js';
import type { FixHistoryPage } from '../../../../../../../tools/value/value_report.js';

// ── Mock data ────────────────────────────────────────────────────────────────

function mockStats(): SiteStats {
  return {
    fixes_applied: 24,
    issues_resolved: 31,
    schema_coverage_pct: 82,
    health_score_delta: 19,
  };
}

function mockRankings(site_id: string): RankingSnapshot {
  const keywords: KeywordRanking[] = [
    { keyword: 'organic cotton tee', position_before: 28, position_after: 7, position_delta: 21, impressions: 1200, clicks_before: 8, clicks_after: 65 },
    { keyword: 'sustainable fashion', position_before: 45, position_after: 12, position_delta: 33, impressions: 3200, clicks_before: 3, clicks_after: 42 },
    { keyword: 'eco friendly clothing', position_before: 18, position_after: 6, position_delta: 12, impressions: 2400, clicks_before: 25, clicks_after: 110 },
    { keyword: 'hemp t-shirt', position_before: 35, position_after: 9, position_delta: 26, impressions: 600, clicks_before: 2, clicks_after: 18 },
    { keyword: 'recycled polyester jacket', position_before: 22, position_after: 8, position_delta: 14, impressions: 900, clicks_before: 10, clicks_after: 45 },
    { keyword: 'bamboo fabric dress', position_before: 50, position_after: 15, position_delta: 35, impressions: 400, clicks_before: 1, clicks_after: 8 },
    { keyword: 'vegan leather bag', position_before: 14, position_after: 5, position_delta: 9, impressions: 1800, clicks_before: 40, clicks_after: 120 },
    { keyword: 'ethical fashion brand', position_before: 30, position_after: 11, position_delta: 19, impressions: 2100, clicks_before: 5, clicks_after: 35 },
  ];
  return { site_id, keywords, taken_at: new Date().toISOString() };
}

function mockHistory(): FixHistoryPage {
  const entries: FixHistoryEntry[] = [
    { url: 'https://demo-store.com/', fix_type: 'title_missing', fix_label: 'Missing Title', field_name: 'title', before_value: '', after_value: 'Sustainable Fashion — Eco-Friendly Clothing | Demo Store', applied_at: new Date().toISOString() },
    { url: 'https://demo-store.com/products/organic-tee', fix_type: 'meta_description_missing', fix_label: 'Missing Meta Description', field_name: 'meta_description', before_value: '', after_value: 'Shop our organic cotton t-shirt collection. Made from 100% GOTS-certified organic cotton. Free shipping on orders over $50. Sustainable fashion for everyday wear.', applied_at: new Date().toISOString() },
    { url: 'https://demo-store.com/products/hemp-shirt', fix_type: 'image_alt_missing', fix_label: 'Missing Image Alt', field_name: 'alt', before_value: '', after_value: 'Hemp t-shirt in natural beige, front view on model', applied_at: new Date().toISOString() },
    { url: 'https://demo-store.com/products/recycled-jacket', fix_type: 'schema_missing', fix_label: 'Missing Product Schema', field_name: 'jsonld', before_value: '', after_value: '{"@type":"Product","name":"Recycled Polyester Jacket","brand":"Demo Store"}', applied_at: new Date().toISOString() },
    { url: 'https://demo-store.com/collections/all', fix_type: 'title_missing', fix_label: 'Missing Title', field_name: 'title', before_value: 'All', after_value: 'All Products — Sustainable Clothing Collection | Demo Store', applied_at: new Date().toISOString() },
    { url: 'https://demo-store.com/pages/about', fix_type: 'meta_description_missing', fix_label: 'Missing Meta Description', field_name: 'meta_description', before_value: 'About us', after_value: 'Learn about our mission to make sustainable fashion accessible. We source ethical materials and partner with fair-trade factories to create clothing you can feel good about.', applied_at: new Date().toISOString() },
    { url: 'https://demo-store.com/products/bamboo-dress', fix_type: 'image_alt_missing', fix_label: 'Missing Image Alt', field_name: 'alt', before_value: 'img', after_value: 'Bamboo fabric summer dress in sage green, displayed on wooden hanger', applied_at: new Date().toISOString() },
  ];
  return { entries, total: entries.length };
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const domain = `${siteId}.myshopify.com`;
  const url = new URL(request.url);
  const format = url.searchParams.get('format');

  const report = generateValueReport(
    siteId,
    domain,
    mockStats(),
    mockRankings(siteId),
    mockHistory(),
  );

  if (format === 'text') {
    const text = exportReportAsText(report);
    return new Response(text, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(report, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
