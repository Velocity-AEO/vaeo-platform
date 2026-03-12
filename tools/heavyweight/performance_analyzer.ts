// tools/heavyweight/performance_analyzer.ts — Performance impact analyzer
// Analyzes which third-party apps are hurting page performance
// and what VAEO can do about it. Never throws.

import type { ScriptStub } from './script_stub_library.js';
import type { LighthouseScore } from './fix_validator.js';
import type { EnvironmentScan, DetectedApp } from '../apps/environment_scanner.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AppImpactAnalysis {
  app_id: string;
  app_name: string;
  load_cost_ms: number;
  main_thread_cost_ms: number;
  network_requests: number;
  performance_impact: 'critical' | 'high' | 'medium' | 'low';
  affects_lcp: boolean;
  affects_cls: boolean;
  replaceable_by_vaeo: boolean;
  monthly_cost_usd: number;
  recommendation: string;
}

export interface PerformanceAnalysis {
  site_id: string;
  url: string;
  total_third_party_load_ms: number;
  total_main_thread_ms: number;
  total_network_requests: number;
  app_impacts: AppImpactAnalysis[];
  top_offenders: AppImpactAnalysis[];
  vaeo_fixable_savings_ms: number;
  vaeo_replaceable_savings_ms: number;
  vaeo_replaceable_savings_usd: number;
  baseline_score: number;
  projected_score_after_replacements: number;
  analysis_summary: string;
  analyzed_at: string;
}

// ── Impact classification ────────────────────────────────────────────────────

function classifyImpact(loadMs: number, fpImpact?: string): 'critical' | 'high' | 'medium' | 'low' {
  if (fpImpact === 'critical' || loadMs >= 1000) return 'critical';
  if (fpImpact === 'high' || loadMs >= 500) return 'high';
  if (fpImpact === 'medium' || loadMs >= 200) return 'medium';
  return 'low';
}

// ── Main analyzer ────────────────────────────────────────────────────────────

export function analyzePerformanceImpact(
  site_id: string,
  url: string,
  scan: EnvironmentScan,
  score_before: LighthouseScore,
  stubs: ScriptStub[],
): PerformanceAnalysis {
  const stubMap = new Map<string, ScriptStub>();
  for (const stub of stubs) {
    stubMap.set(stub.app_id, stub);
  }

  const appImpacts: AppImpactAnalysis[] = [];

  for (const detected of scan.detected_apps) {
    const fp = detected.fingerprint;
    const stub = stubMap.get(fp.app_id);

    const loadCost = stub?.simulated_load_ms ?? 0;
    const mainThreadCost = stub?.simulated_main_thread_ms ?? 0;
    const networkRequests = stub?.simulated_network_requests ?? 0;
    const affectsLcp = stub?.affects_lcp ?? false;
    const affectsCls = stub?.affects_cls ?? false;

    const impact = classifyImpact(loadCost, fp.performance_impact);
    const monthlyCost = fp.monthly_cost_usd ?? 0;
    const replaceable = fp.replaceable_by_vaeo;

    let recommendation: string;
    if (replaceable) {
      recommendation = `Replace with VAEO native component to save ${loadCost}ms and $${monthlyCost}/mo`;
    } else {
      recommendation = `Consider lazy-loading or deferring ${fp.name} initialization`;
    }

    appImpacts.push({
      app_id: fp.app_id,
      app_name: fp.name,
      load_cost_ms: loadCost,
      main_thread_cost_ms: mainThreadCost,
      network_requests: networkRequests,
      performance_impact: impact,
      affects_lcp: affectsLcp,
      affects_cls: affectsCls,
      replaceable_by_vaeo: replaceable,
      monthly_cost_usd: monthlyCost,
      recommendation,
    });
  }

  // Sort by load cost descending
  const sorted = [...appImpacts].sort((a, b) => b.load_cost_ms - a.load_cost_ms);
  const topOffenders = sorted.slice(0, 5);

  const totalLoad = appImpacts.reduce((s, a) => s + a.load_cost_ms, 0);
  const totalMainThread = appImpacts.reduce((s, a) => s + a.main_thread_cost_ms, 0);
  const totalNetwork = appImpacts.reduce((s, a) => s + a.network_requests, 0);

  // Apps that have stubs (fixable via simulation)
  const fixableApps = appImpacts.filter((a) => stubMap.has(a.app_id));
  const vaeoFixableSavings = fixableApps.reduce((s, a) => s + a.load_cost_ms, 0);

  // Apps that are replaceable
  const replaceableApps = appImpacts.filter((a) => a.replaceable_by_vaeo);
  const vaeoReplaceableSavings = replaceableApps.reduce((s, a) => s + a.load_cost_ms, 0);
  const vaeoReplaceableSavingsUsd = replaceableApps.reduce((s, a) => s + a.monthly_cost_usd, 0);

  // Projected score
  const scoreBoost = Math.min(30, Math.floor(vaeoReplaceableSavings / 100));
  const projectedScore = Math.min(100, score_before.performance + scoreBoost);

  const delta = projectedScore - score_before.performance;
  const summary = `Found ${appImpacts.length} third-party apps adding ${totalLoad}ms to page load. ` +
    `VAEO can replace ${replaceableApps.length} apps, saving ${vaeoReplaceableSavings}ms and ` +
    `$${vaeoReplaceableSavingsUsd}/month. Projected performance score improvement: +${delta} points.`;

  return {
    site_id,
    url,
    total_third_party_load_ms: totalLoad,
    total_main_thread_ms: totalMainThread,
    total_network_requests: totalNetwork,
    app_impacts: appImpacts,
    top_offenders: topOffenders,
    vaeo_fixable_savings_ms: vaeoFixableSavings,
    vaeo_replaceable_savings_ms: vaeoReplaceableSavings,
    vaeo_replaceable_savings_usd: vaeoReplaceableSavingsUsd,
    baseline_score: score_before.performance,
    projected_score_after_replacements: projectedScore,
    analysis_summary: summary,
    analyzed_at: new Date().toISOString(),
  };
}
