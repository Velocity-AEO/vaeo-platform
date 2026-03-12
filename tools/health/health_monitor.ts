/**
 * tools/health/health_monitor.ts
 *
 * Health monitor orchestrator — wires checks, report, notifications, storage.
 * Never throws.
 */

import { randomUUID } from 'node:crypto';
import {
  buildHealthReport,
  type HealthCheckResult,
  type SystemHealthReport,
} from './health_check.js';
import {
  runAllChecks,
} from './component_checkers.js';
import {
  sendNotifications,
  shouldNotify,
  defaultNotificationConfig,
  type NotificationConfig,
  type HealthNotification,
} from './notification_engine.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthMonitorConfig {
  site_id?:              string;
  run_id?:               string;
  notification_config:   NotificationConfig;
  store_report:          boolean;
}

export interface HealthMonitorResult {
  report:        SystemHealthReport;
  notifications: HealthNotification[];
  stored:        boolean;
}

// ── defaultMonitorConfig ──────────────────────────────────────────────────────

export function defaultMonitorConfig(
  site_id?: string,
  run_id?:  string,
): HealthMonitorConfig {
  try {
    return {
      site_id,
      run_id,
      notification_config: defaultNotificationConfig(),
      store_report:        true,
    };
  } catch {
    return {
      notification_config: defaultNotificationConfig(),
      store_report:        true,
    };
  }
}

// ── runHealthMonitor ──────────────────────────────────────────────────────────

export async function runHealthMonitor(
  config: HealthMonitorConfig,
  deps?: {
    runAllChecks?:      () => Promise<HealthCheckResult[]>;
    sendNotifications?: (
      report: SystemHealthReport,
      cfg:    NotificationConfig,
    ) => Promise<HealthNotification[]>;
    storeReport?:       (report: SystemHealthReport) => Promise<void>;
  },
): Promise<HealthMonitorResult> {
  const report_id  = randomUUID();
  const started_at = Date.now();

  let results:       HealthCheckResult[]  = [];
  let report:        SystemHealthReport   | null = null;
  let notifications: HealthNotification[] = [];
  let stored                              = false;

  // Step 1: Run checks
  try {
    results = deps?.runAllChecks
      ? await deps.runAllChecks()
      : await runAllChecks();
  } catch (err) {
    results = [{
      component:  'health_monitor_internal',
      status:     'red',
      message:    'runAllChecks threw unexpectedly',
      error:      err instanceof Error ? err.message : String(err),
      checked_at: new Date().toISOString(),
    }];
  }

  // Step 2: Build report
  try {
    report = buildHealthReport(
      results,
      report_id,
      started_at,
      config?.site_id,
      config?.run_id,
    );
  } catch (err) {
    // Fallback minimal report
    report = {
      report_id,
      overall_status: 'red',
      components:     results,
      green_count:    0,
      yellow_count:   0,
      red_count:      1,
      generated_at:   new Date().toISOString(),
      duration_ms:    Date.now() - started_at,
      summary:        'Health report build failed.',
    };
    report.components.push({
      component:  'health_monitor_internal',
      status:     'red',
      message:    'buildHealthReport failed',
      error:      err instanceof Error ? err.message : String(err),
      checked_at: new Date().toISOString(),
    });
  }

  // Step 3: Send notifications (only when shouldNotify)
  const notifConfig = config?.notification_config ?? defaultNotificationConfig();
  try {
    if (shouldNotify(report, notifConfig)) {
      const notifFn = deps?.sendNotifications ?? sendNotifications;
      notifications = await notifFn(report, notifConfig);
    }
  } catch (err) {
    report.components.push({
      component:  'health_monitor_internal',
      status:     'red',
      message:    'sendNotifications failed',
      error:      err instanceof Error ? err.message : String(err),
      checked_at: new Date().toISOString(),
    });
  }

  // Step 4: Store report
  if (config?.store_report && deps?.storeReport) {
    try {
      await deps.storeReport(report);
      stored = true;
    } catch (err) {
      report.components.push({
        component:  'health_monitor_internal',
        status:     'red',
        message:    'storeReport failed',
        error:      err instanceof Error ? err.message : String(err),
        checked_at: new Date().toISOString(),
      });
    }
  }

  return { report, notifications, stored };
}
