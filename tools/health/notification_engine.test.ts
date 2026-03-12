/**
 * tools/health/notification_engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultNotificationConfig,
  shouldNotify,
  buildNotification,
  sendNotifications,
  type NotificationConfig,
  type HealthNotification,
} from './notification_engine.ts';
import type { SystemHealthReport, HealthCheckResult } from './health_check.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<SystemHealthReport> = {}): SystemHealthReport {
  return {
    report_id:      'r1',
    overall_status: 'green',
    components:     [],
    green_count:    5,
    yellow_count:   0,
    red_count:      0,
    generated_at:   new Date().toISOString(),
    duration_ms:    50,
    summary:        'All 5 components healthy.',
    ...overrides,
  };
}

function makeResult(component: string, status: 'green' | 'yellow' | 'red'): HealthCheckResult {
  return { component, status, message: 'ok', checked_at: new Date().toISOString() };
}

// ── defaultNotificationConfig ─────────────────────────────────────────────────

describe('defaultNotificationConfig', () => {
  it('returns channels log and dashboard', () => {
    const c = defaultNotificationConfig();
    assert.ok(c.channels.includes('log'));
    assert.ok(c.channels.includes('dashboard'));
  });

  it('alert_on_red is true', () => {
    assert.equal(defaultNotificationConfig().alert_on_red, true);
  });

  it('alert_on_yellow is false', () => {
    assert.equal(defaultNotificationConfig().alert_on_yellow, false);
  });

  it('yellow_threshold is 3', () => {
    assert.equal(defaultNotificationConfig().yellow_threshold, 3);
  });
});

// ── shouldNotify ──────────────────────────────────────────────────────────────

describe('shouldNotify', () => {
  it('false when all green and no yellow threshold', () => {
    const cfg = defaultNotificationConfig();
    const report = makeReport({ overall_status: 'green', red_count: 0, yellow_count: 0 });
    assert.equal(shouldNotify(report, cfg), false);
  });

  it('true when red and alert_on_red=true', () => {
    const cfg = defaultNotificationConfig();
    const report = makeReport({ overall_status: 'red', red_count: 1 });
    assert.equal(shouldNotify(report, cfg), true);
  });

  it('false when red but alert_on_red=false', () => {
    const cfg: NotificationConfig = { ...defaultNotificationConfig(), alert_on_red: false };
    const report = makeReport({ overall_status: 'red', red_count: 1 });
    assert.equal(shouldNotify(report, cfg), false);
  });

  it('true when yellow meets threshold and alert_on_yellow=true', () => {
    const cfg: NotificationConfig = { ...defaultNotificationConfig(), alert_on_yellow: true, yellow_threshold: 2 };
    const report = makeReport({ yellow_count: 3 });
    assert.equal(shouldNotify(report, cfg), true);
  });

  it('false when yellow below threshold', () => {
    const cfg: NotificationConfig = { ...defaultNotificationConfig(), alert_on_yellow: true, yellow_threshold: 3 };
    const report = makeReport({ yellow_count: 2 });
    assert.equal(shouldNotify(report, cfg), false);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() =>
      shouldNotify(null as unknown as SystemHealthReport, null as unknown as NotificationConfig),
    );
  });
});

// ── buildNotification ─────────────────────────────────────────────────────────

describe('buildNotification', () => {
  it('subject contains ALERT for red status', () => {
    const report = makeReport({
      overall_status: 'red', red_count: 2,
      components: [makeResult('crawler', 'red'), makeResult('gsc_sync', 'red')],
    });
    const n = buildNotification(report, 'email', defaultNotificationConfig());
    assert.ok(n.subject.includes('ALERT'));
    assert.ok(n.subject.includes('2'));
  });

  it('subject contains Warning for yellow status', () => {
    const report = makeReport({
      overall_status: 'yellow', yellow_count: 1,
      components: [makeResult('learning_center', 'yellow')],
    });
    const n = buildNotification(report, 'slack', defaultNotificationConfig());
    assert.ok(n.subject.includes('Warning'));
  });

  it('subject contains operational for green status', () => {
    const n = buildNotification(makeReport(), 'log', defaultNotificationConfig());
    assert.ok(n.subject.includes('operational'));
  });

  it('sets red_components correctly', () => {
    const report = makeReport({
      overall_status: 'red', red_count: 1,
      components: [makeResult('crawler', 'red'), makeResult('sandbox', 'green')],
    });
    const n = buildNotification(report, 'dashboard', defaultNotificationConfig());
    assert.ok(n.red_components.includes('crawler'));
    assert.equal(n.red_components.length, 1);
  });

  it('sets yellow_components correctly', () => {
    const report = makeReport({
      overall_status: 'yellow', yellow_count: 2,
      components: [makeResult('gsc_sync', 'yellow'), makeResult('tracer', 'yellow')],
    });
    const n = buildNotification(report, 'log', defaultNotificationConfig());
    assert.ok(n.yellow_components.includes('gsc_sync'));
    assert.ok(n.yellow_components.includes('tracer'));
  });

  it('delivered is false by default', () => {
    const n = buildNotification(makeReport(), 'log', defaultNotificationConfig());
    assert.equal(n.delivered, false);
  });

  it('has a valid notification_id', () => {
    const n = buildNotification(makeReport(), 'log', defaultNotificationConfig());
    assert.ok(typeof n.notification_id === 'string' && n.notification_id.length > 0);
  });
});

// ── sendNotifications ─────────────────────────────────────────────────────────

describe('sendNotifications', () => {
  it('returns empty array when shouldNotify=false', async () => {
    const report = makeReport({ red_count: 0, yellow_count: 0 });
    const result = await sendNotifications(report, defaultNotificationConfig());
    assert.equal(result.length, 0);
  });

  it('sends to log channel when configured', async () => {
    const report = makeReport({ overall_status: 'red', red_count: 1 });
    const cfg: NotificationConfig = { ...defaultNotificationConfig(), channels: ['log'] };
    let received: HealthNotification | null = null;
    const result = await sendNotifications(report, cfg, {
      logNotification: async (n) => { received = n; },
    });
    assert.equal(result.length, 1);
    assert.ok(received !== null);
    assert.equal(result[0].delivered, true);
  });

  it('sends to email channel when configured', async () => {
    const report = makeReport({ overall_status: 'red', red_count: 1 });
    const cfg: NotificationConfig = { ...defaultNotificationConfig(), channels: ['email'] };
    let called = false;
    await sendNotifications(report, cfg, { sendEmail: async () => { called = true; } });
    assert.equal(called, true);
  });

  it('sets delivered=false and error when channel throws', async () => {
    const report = makeReport({ overall_status: 'red', red_count: 1 });
    const cfg: NotificationConfig = { ...defaultNotificationConfig(), channels: ['email'] };
    const result = await sendNotifications(report, cfg, {
      sendEmail: async () => { throw new Error('smtp failed'); },
    });
    assert.equal(result[0].delivered, false);
    assert.ok(result[0].error?.includes('smtp failed'));
  });

  it('sends to multiple channels', async () => {
    const report = makeReport({ overall_status: 'red', red_count: 1 });
    const cfg: NotificationConfig = { ...defaultNotificationConfig(), channels: ['log', 'dashboard'] };
    let logCalled = false, dashCalled = false;
    await sendNotifications(report, cfg, {
      logNotification: async () => { logCalled = true; },
      sendDashboard:   async () => { dashCalled = true; },
    });
    assert.equal(logCalled, true);
    assert.equal(dashCalled, true);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      sendNotifications(
        null as unknown as SystemHealthReport,
        null as unknown as NotificationConfig,
      ),
    );
  });
});
