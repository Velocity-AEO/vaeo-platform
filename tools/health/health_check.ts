/**
 * tools/health/health_check.ts
 *
 * Health check interfaces, component registry, and report builder.
 * Never throws.
 */

import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ComponentStatus = 'green' | 'yellow' | 'red';

export interface HealthCheckResult {
  component:     string;
  status:        ComponentStatus;
  message:       string;
  latency_ms?:   number;
  last_success?: string;
  error?:        string;
  checked_at:    string;
}

export interface SystemHealthReport {
  report_id:      string;
  site_id?:       string;
  run_id?:        string;
  overall_status: ComponentStatus;
  components:     HealthCheckResult[];
  green_count:    number;
  yellow_count:   number;
  red_count:      number;
  generated_at:   string;
  duration_ms:    number;
  summary:        string;
}

// ── Component registry ────────────────────────────────────────────────────────

export const COMPONENT_REGISTRY: string[] = [
  'crawler',
  'ai_generator',
  'apply_engine',
  'validator',
  'learning_center',
  'gsc_sync',
  'job_queue',
  'shopify_api',
  'stripe_webhook',
  'schema_validator',
  'sandbox',
  'tracer',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function deriveOverallStatus(results: HealthCheckResult[]): ComponentStatus {
  try {
    if (!results?.length) return 'green';
    if (results.some((r) => r.status === 'red'))    return 'red';
    if (results.some((r) => r.status === 'yellow')) return 'yellow';
    return 'green';
  } catch {
    return 'green';
  }
}

function buildSummary(
  results: HealthCheckResult[],
  green: number,
  yellow: number,
  red: number,
): string {
  try {
    if (red > 0) {
      const names = results
        .filter((r) => r.status === 'red')
        .map((r) => r.component)
        .join(', ');
      return `${red} component(s) failing: ${names}`;
    }
    if (yellow > 0) {
      return `${green} components healthy, ${yellow} need attention.`;
    }
    return `All ${green} components healthy.`;
  } catch {
    return 'Health status unavailable.';
  }
}

// ── buildHealthReport ─────────────────────────────────────────────────────────

export function buildHealthReport(
  results:    HealthCheckResult[],
  report_id:  string,
  started_at: number,
  site_id?:   string,
  run_id?:    string,
): SystemHealthReport {
  try {
    const safe       = results ?? [];
    const green      = safe.filter((r) => r.status === 'green').length;
    const yellow     = safe.filter((r) => r.status === 'yellow').length;
    const red        = safe.filter((r) => r.status === 'red').length;
    const overall    = deriveOverallStatus(safe);
    const now        = new Date().toISOString();
    const duration   = Math.max(0, Date.now() - (started_at ?? Date.now()));

    const report: SystemHealthReport = {
      report_id:      report_id ?? randomUUID(),
      overall_status: overall,
      components:     safe,
      green_count:    green,
      yellow_count:   yellow,
      red_count:      red,
      generated_at:   now,
      duration_ms:    duration,
      summary:        buildSummary(safe, green, yellow, red),
    };

    if (site_id !== undefined) report.site_id = site_id;
    if (run_id  !== undefined) report.run_id  = run_id;

    return report;
  } catch {
    return {
      report_id:      report_id ?? 'error',
      overall_status: 'red',
      components:     results ?? [],
      green_count:    0,
      yellow_count:   0,
      red_count:      0,
      generated_at:   new Date().toISOString(),
      duration_ms:    0,
      summary:        'Health report generation failed.',
    };
  }
}
