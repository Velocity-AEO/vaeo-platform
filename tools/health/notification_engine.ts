/**
 * tools/health/notification_engine.ts
 *
 * Health notification builder and sender. Never throws.
 */

import { randomUUID } from 'node:crypto';
import type { ComponentStatus, SystemHealthReport } from './health_check.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationChannel = 'email' | 'slack' | 'dashboard' | 'log';

export interface HealthNotification {
  notification_id:   string;
  report_id:         string;
  channel:           NotificationChannel;
  severity:          ComponentStatus;
  subject:           string;
  body:              string;
  red_components:    string[];
  yellow_components: string[];
  sent_at:           string;
  delivered:         boolean;
  error?:            string;
}

export interface NotificationConfig {
  channels:          NotificationChannel[];
  alert_on_red:      boolean;
  alert_on_yellow:   boolean;
  yellow_threshold:  number;
  site_id?:          string;
}

// ── defaultNotificationConfig ─────────────────────────────────────────────────

export function defaultNotificationConfig(): NotificationConfig {
  try {
    return {
      channels:         ['log', 'dashboard'],
      alert_on_red:     true,
      alert_on_yellow:  false,
      yellow_threshold: 3,
    };
  } catch {
    return {
      channels:         ['log'],
      alert_on_red:     true,
      alert_on_yellow:  false,
      yellow_threshold: 3,
    };
  }
}

// ── shouldNotify ──────────────────────────────────────────────────────────────

export function shouldNotify(
  report: SystemHealthReport,
  config: NotificationConfig,
): boolean {
  try {
    if (!report || !config) return false;
    if (config.alert_on_red && report.red_count > 0) return true;
    if (config.alert_on_yellow && report.yellow_count >= config.yellow_threshold) return true;
    return false;
  } catch {
    return false;
  }
}

// ── buildNotification ─────────────────────────────────────────────────────────

export function buildNotification(
  report:  SystemHealthReport,
  channel: NotificationChannel,
  config:  NotificationConfig,
): HealthNotification {
  try {
    const reds    = report.components?.filter((c) => c.status === 'red').map((c) => c.component)   ?? [];
    const yellows = report.components?.filter((c) => c.status === 'yellow').map((c) => c.component) ?? [];

    let subject: string;
    if (report.overall_status === 'red') {
      subject = `VAEO ALERT: ${report.red_count} component(s) failing`;
    } else if (report.overall_status === 'yellow') {
      subject = `VAEO Warning: ${report.yellow_count} components need attention`;
    } else {
      subject = 'VAEO Health: All systems operational';
    }

    const parts: string[] = [report.summary];
    if (reds.length > 0)    parts.push(`Failing: ${reds.join(', ')}`);
    if (yellows.length > 0) parts.push(`Attention needed: ${yellows.join(', ')}`);
    if (config.site_id)     parts.push(`Site: ${config.site_id}`);
    parts.push(`Report ID: ${report.report_id}`);

    return {
      notification_id:   randomUUID(),
      report_id:         report.report_id,
      channel,
      severity:          report.overall_status,
      subject,
      body:              parts.join('\n'),
      red_components:    reds,
      yellow_components: yellows,
      sent_at:           new Date().toISOString(),
      delivered:         false,
    };
  } catch {
    return {
      notification_id:   randomUUID(),
      report_id:         report?.report_id ?? 'unknown',
      channel,
      severity:          'red',
      subject:           'VAEO ALERT: Health notification error',
      body:              'Failed to build notification.',
      red_components:    [],
      yellow_components: [],
      sent_at:           new Date().toISOString(),
      delivered:         false,
      error:             'buildNotification failed',
    };
  }
}

// ── sendNotifications ─────────────────────────────────────────────────────────

export async function sendNotifications(
  report:  SystemHealthReport,
  config:  NotificationConfig,
  deps?: {
    sendEmail?:        (n: HealthNotification) => Promise<void>;
    sendSlack?:        (n: HealthNotification) => Promise<void>;
    sendDashboard?:    (n: HealthNotification) => Promise<void>;
    logNotification?:  (n: HealthNotification) => Promise<void>;
  },
): Promise<HealthNotification[]> {
  try {
    if (!shouldNotify(report, config)) return [];

    const sent: HealthNotification[] = [];
    const channels = config.channels ?? [];

    for (const channel of channels) {
      const notification = buildNotification(report, channel, config);
      try {
        if (channel === 'email'     && deps?.sendEmail)     { await deps.sendEmail(notification);     notification.delivered = true; }
        if (channel === 'slack'     && deps?.sendSlack)     { await deps.sendSlack(notification);     notification.delivered = true; }
        if (channel === 'dashboard' && deps?.sendDashboard) { await deps.sendDashboard(notification); notification.delivered = true; }
        if (channel === 'log'       && deps?.logNotification) { await deps.logNotification(notification); notification.delivered = true; }
      } catch (err) {
        notification.error     = err instanceof Error ? err.message : String(err);
        notification.delivered = false;
      }
      sent.push(notification);
    }

    return sent;
  } catch {
    return [];
  }
}
