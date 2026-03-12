import { NextRequest, NextResponse } from 'next/server';
import type { HeavyweightRun } from '@/../tools/heavyweight/case_study_generator';
import type { PerformanceAnalysis, AppImpactAnalysis } from '@/../tools/heavyweight/performance_analyzer';
import type { RegressionCheckResult } from '@/../tools/heavyweight/regression_guard';

// Mock data for demo — replace with DB lookup in production
function getMockRun(siteId: string): HeavyweightRun & {
  regression_check: RegressionCheckResult;
  recommendation: string;
  safe_to_deploy: boolean;
} {
  return {
    run_id:            `hw_${siteId}_1`,
    site_id:           siteId,
    url:               `https://${siteId}`,
    status:            'complete',
    score_before:      { performance: 34, seo: 68, accessibility: 75, best_practices: 85, lcp_ms: 11200, cls: 0.25 },
    score_after:       { performance: 71, seo: 92, accessibility: 88, best_practices: 95, lcp_ms: 3400, cls: 0.05 },
    detected_apps:     ['Hotjar', 'Intercom', 'Klaviyo'],
    fix_types_applied: ['title_missing', 'meta_description_missing', 'image_alt_missing', 'canonical_missing'],
    comparison:        { performance_delta: 37, seo_delta: 24, lcp_delta_ms: 7800, cls_delta: -0.2, grade_before: 'F', grade_after: 'B' },
    duration_ms:       52000,
    started_at:        new Date(Date.now() - 65000).toISOString(),
    completed_at:      new Date().toISOString(),
    regression_check: {
      passed:      true,
      violations:  [],
      rules_run:   6,
      checked_at:  new Date().toISOString(),
    },
    recommendation: 'Safe to deploy. All regression checks passed. Performance improved +37 points.',
    safe_to_deploy: true,
  };
}

function getMockAnalysis(siteId: string): PerformanceAnalysis {
  const apps: AppImpactAnalysis[] = [
    {
      app_id: 'hotjar', app_name: 'Hotjar',
      load_cost_ms: 1200, main_thread_cost_ms: 500, network_requests: 14,
      performance_impact: 'critical', affects_lcp: false, affects_cls: true,
      replaceable_by_vaeo: false, monthly_cost_usd: 0,
      recommendation: 'Defer to after user interaction',
    },
    {
      app_id: 'intercom', app_name: 'Intercom',
      load_cost_ms: 1100, main_thread_cost_ms: 350, network_requests: 16,
      performance_impact: 'critical', affects_lcp: true, affects_cls: true,
      replaceable_by_vaeo: false, monthly_cost_usd: 39,
      recommendation: 'Defer to after user interaction',
    },
    {
      app_id: 'klaviyo', app_name: 'Klaviyo',
      load_cost_ms: 900, main_thread_cost_ms: 250, network_requests: 12,
      performance_impact: 'high', affects_lcp: true, affects_cls: false,
      replaceable_by_vaeo: true, monthly_cost_usd: 20,
      recommendation: 'Replace with VAEO email capture',
    },
  ];
  return {
    site_id:                      siteId,
    url:                          `https://${siteId}`,
    total_third_party_load_ms:    3200,
    total_main_thread_ms:         1100,
    total_network_requests:       42,
    app_impacts:                  apps,
    top_offenders:                apps.filter((a) => a.performance_impact === 'critical'),
    vaeo_fixable_savings_ms:      3200,
    vaeo_replaceable_savings_ms:  900,
    vaeo_replaceable_savings_usd: 20,
    baseline_score:               34,
    projected_score_after_replacements: 43,
    analysis_summary:             'Found 3 apps adding 3200ms to load time.',
    analyzed_at:                  new Date().toISOString(),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { siteId: string } },
) {
  const { siteId } = params;
  try {
    const run      = getMockRun(siteId);
    const analysis = getMockAnalysis(siteId);
    return NextResponse.json(
      { run, analysis },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
