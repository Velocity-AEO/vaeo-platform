import { NextRequest, NextResponse } from 'next/server';
import { generateCaseStudy } from '@/../tools/heavyweight/case_study_generator';
import { formatCaseStudyAsMarkdown } from '@/../tools/heavyweight/case_study_storage';
import type { CaseStudyInput, HeavyweightRun } from '@/../tools/heavyweight/case_study_generator';
import type { PerformanceAnalysis } from '@/../tools/heavyweight/performance_analyzer';
import type { FixValidationResult } from '@/../tools/heavyweight/fix_validator';

// Mock data for demo — replace with DB lookup in production
function getMockRun(siteId: string): HeavyweightRun {
  return {
    run_id: `run_${siteId}_1`,
    site_id: siteId,
    url: `https://${siteId}`,
    status: 'complete',
    score_before: { performance: 34, seo: 68, accessibility: 75, best_practices: 85, lcp_ms: 11200, cls: 0.25 },
    score_after: { performance: 71, seo: 92, accessibility: 88, best_practices: 95, lcp_ms: 3400, cls: 0.05 },
    detected_apps: ['Hotjar', 'Intercom', 'Klaviyo'],
    fix_types_applied: ['title_missing', 'meta_description_missing', 'image_alt_missing', 'canonical_missing'],
    comparison: { performance_delta: 37, seo_delta: 24, lcp_delta_ms: 7800, cls_delta: -0.2, grade_before: 'F', grade_after: 'B' },
    duration_ms: 52000,
    started_at: new Date(Date.now() - 60000).toISOString(),
    completed_at: new Date().toISOString(),
  };
}

function getMockAnalysis(siteId: string): PerformanceAnalysis {
  return {
    site_id: siteId,
    url: `https://${siteId}`,
    total_third_party_load_ms: 3200,
    total_main_thread_ms: 1100,
    total_network_requests: 42,
    app_impacts: [
      { app_id: 'hotjar', app_name: 'Hotjar', load_cost_ms: 1200, main_thread_cost_ms: 500, network_requests: 14, performance_impact: 'critical', affects_lcp: false, affects_cls: true, replaceable_by_vaeo: false, monthly_cost_usd: 0, recommendation: 'Defer loading' },
      { app_id: 'intercom', app_name: 'Intercom', load_cost_ms: 1100, main_thread_cost_ms: 350, network_requests: 16, performance_impact: 'critical', affects_lcp: true, affects_cls: true, replaceable_by_vaeo: false, monthly_cost_usd: 39, recommendation: 'Defer loading' },
      { app_id: 'klaviyo', app_name: 'Klaviyo', load_cost_ms: 900, main_thread_cost_ms: 250, network_requests: 12, performance_impact: 'high', affects_lcp: true, affects_cls: false, replaceable_by_vaeo: true, monthly_cost_usd: 20, recommendation: 'Replace with VAEO' },
    ],
    top_offenders: [
      { app_id: 'hotjar', app_name: 'Hotjar', load_cost_ms: 1200, main_thread_cost_ms: 500, network_requests: 14, performance_impact: 'critical', affects_lcp: false, affects_cls: true, replaceable_by_vaeo: false, monthly_cost_usd: 0, recommendation: 'Defer loading' },
      { app_id: 'intercom', app_name: 'Intercom', load_cost_ms: 1100, main_thread_cost_ms: 350, network_requests: 16, performance_impact: 'critical', affects_lcp: true, affects_cls: true, replaceable_by_vaeo: false, monthly_cost_usd: 39, recommendation: 'Defer loading' },
    ],
    vaeo_fixable_savings_ms: 3200,
    vaeo_replaceable_savings_ms: 900,
    vaeo_replaceable_savings_usd: 20,
    baseline_score: 34,
    projected_score_after_replacements: 43,
    analysis_summary: 'Found 3 apps adding 3200ms.',
    analyzed_at: new Date().toISOString(),
  };
}

function getMockValidation(siteId: string): FixValidationResult {
  return {
    site_id: siteId,
    url: `https://${siteId}`,
    fix_types: ['title_missing', 'meta_description_missing', 'image_alt_missing', 'canonical_missing'],
    html_before: '<html></html>',
    html_after: '<html><head><title>Fixed</title></head></html>',
    fixes_applied: [
      { fix_type: 'title_missing', success: true, change_description: 'Inserted <title> tag', lines_changed: 1 },
      { fix_type: 'meta_description_missing', success: true, change_description: 'Inserted meta description', lines_changed: 1 },
      { fix_type: 'image_alt_missing', success: true, change_description: 'Added alt attributes', lines_changed: 3 },
      { fix_type: 'canonical_missing', success: true, change_description: 'Inserted canonical link', lines_changed: 1 },
    ],
    simulation_applied: true,
    production_condition_warnings: [],
    validated_at: new Date().toISOString(),
    ready_for_scoring: true,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;

  if (!siteId) {
    return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  }

  const run = getMockRun(siteId);
  const analysis = getMockAnalysis(siteId);
  const validation = getMockValidation(siteId);

  const input: CaseStudyInput = {
    site_id: siteId,
    site_domain: siteId,
    run,
    performance_analysis: analysis,
    fix_validation: validation,
  };

  const caseStudy = generateCaseStudy(input);
  const markdown = formatCaseStudyAsMarkdown(caseStudy);

  return NextResponse.json({
    case_study: caseStudy,
    markdown,
    run_summary: {
      status: run.status,
      duration_ms: run.duration_ms,
      apps_detected: run.detected_apps.length,
      fixes_applied: run.fix_types_applied.length,
    },
  });
}
