/**
 * tools/health/health_monitor.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultMonitorConfig,
  runHealthMonitor,
  type HealthMonitorConfig,
} from './health_monitor.ts';
import type { HealthCheckResult, SystemHealthReport } from './health_check.ts';
import type { NotificationConfig, HealthNotification } from './notification_engine.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function greenChecks(): HealthCheckResult[] {
  return [
    'crawler', 'ai_generator', 'apply_engine', 'validator',
    'learning_center', 'gsc_sync', 'job_queue', 'shopify_api',
    'stripe_webhook', 'schema_validator', 'sandbox', 'tracer',
  ].map((c) => ({
    component: c, status: 'green' as const, message: 'healthy',
    checked_at: new Date().toISOString(),
  }));
}

function redChecks(failing: string[]): HealthCheckResult[] {
  return greenChecks().map((r) =>
    failing.includes(r.component)
      ? { ...r, status: 'red' as const, message: 'failing' }
      : r,
  );
}

function yellowChecks(slow: string[]): HealthCheckResult[] {
  return greenChecks().map((r) =>
    slow.includes(r.component)
      ? { ...r, status: 'yellow' as const, message: 'slow' }
      : r,
  );
}

const mockNotify = async (_r: SystemHealthReport, _c: NotificationConfig): Promise<HealthNotification[]> => [];
const mockStore  = async (_r: SystemHealthReport): Promise<void> => {};

// ── defaultMonitorConfig ──────────────────────────────────────────────────────

describe('defaultMonitorConfig', () => {
  it('store_report is true', () => {
    assert.equal(defaultMonitorConfig().store_report, true);
  });

  it('sets site_id when provided', () => {
    assert.equal(defaultMonitorConfig('site-1').site_id, 'site-1');
  });

  it('sets run_id when provided', () => {
    assert.equal(defaultMonitorConfig(undefined, 'run-1').run_id, 'run-1');
  });

  it('notification_config has alert_on_red=true', () => {
    assert.equal(defaultMonitorConfig().notification_config.alert_on_red, true);
  });
});

// ── runHealthMonitor — happy path ─────────────────────────────────────────────

describe('runHealthMonitor — happy path', () => {
  it('returns a SystemHealthReport', async () => {
    const cfg = defaultMonitorConfig();
    const { report } = await runHealthMonitor(cfg, {
      runAllChecks:      async () => greenChecks(),
      sendNotifications: mockNotify,
      storeReport:       mockStore,
    });
    assert.ok(report.report_id.length > 0);
    assert.equal(report.overall_status, 'green');
  });

  it('green counts are correct', async () => {
    const cfg = defaultMonitorConfig();
    const { report } = await runHealthMonitor(cfg, {
      runAllChecks:      async () => greenChecks(),
      sendNotifications: mockNotify,
    });
    assert.equal(report.green_count, 12);
    assert.equal(report.red_count, 0);
  });

  it('report has correct component count', async () => {
    const cfg = defaultMonitorConfig();
    const { report } = await runHealthMonitor(cfg, {
      runAllChecks:      async () => greenChecks(),
      sendNotifications: mockNotify,
    });
    assert.equal(report.components.length, 12);
  });

  it('stored=true when storeReport dep provided and store_report=true', async () => {
    const cfg = defaultMonitorConfig();
    const { stored } = await runHealthMonitor(cfg, {
      runAllChecks:      async () => greenChecks(),
      sendNotifications: mockNotify,
      storeReport:       mockStore,
    });
    assert.equal(stored, true);
  });

  it('stored=false when no storeReport dep', async () => {
    const cfg = defaultMonitorConfig();
    const { stored } = await runHealthMonitor(cfg, {
      runAllChecks:      async () => greenChecks(),
      sendNotifications: mockNotify,
    });
    assert.equal(stored, false);
  });
});

// ── runHealthMonitor — red triggers notification ───────────────────────────────

describe('runHealthMonitor — red triggers notification', () => {
  it('calls sendNotifications when red component', async () => {
    let notifyCalled = false;
    const cfg: HealthMonitorConfig = {
      ...defaultMonitorConfig(),
      notification_config: { channels: ['log'], alert_on_red: true, alert_on_yellow: false, yellow_threshold: 3 },
    };
    await runHealthMonitor(cfg, {
      runAllChecks: async () => redChecks(['crawler']),
      sendNotifications: async (report, ncfg) => {
        notifyCalled = true;
        return [];
      },
    });
    assert.equal(notifyCalled, true);
  });

  it('report has red_count=1 when one red component', async () => {
    const cfg = defaultMonitorConfig();
    const { report } = await runHealthMonitor(cfg, {
      runAllChecks:      async () => redChecks(['gsc_sync']),
      sendNotifications: mockNotify,
    });
    assert.equal(report.red_count, 1);
    assert.equal(report.overall_status, 'red');
  });
});

// ── runHealthMonitor — yellow below threshold ─────────────────────────────────

describe('runHealthMonitor — yellow below threshold', () => {
  it('does not call sendNotifications when yellow below threshold and alert_on_yellow=false', async () => {
    let notifyCalled = false;
    const cfg: HealthMonitorConfig = {
      ...defaultMonitorConfig(),
      notification_config: {
        channels:        ['log'],
        alert_on_red:    false,
        alert_on_yellow: false,
        yellow_threshold: 3,
      },
    };
    await runHealthMonitor(cfg, {
      runAllChecks: async () => yellowChecks(['gsc_sync']),
      sendNotifications: async () => { notifyCalled = true; return []; },
    });
    assert.equal(notifyCalled, false);
  });

  it('yellow_count is accurate', async () => {
    const cfg = defaultMonitorConfig();
    const { report } = await runHealthMonitor(cfg, {
      runAllChecks:      async () => yellowChecks(['gsc_sync', 'tracer']),
      sendNotifications: mockNotify,
    });
    assert.equal(report.yellow_count, 2);
    assert.equal(report.overall_status, 'yellow');
  });
});

// ── runHealthMonitor — error handling ─────────────────────────────────────────

describe('runHealthMonitor — error handling', () => {
  it('never throws when runAllChecks throws', async () => {
    const cfg = defaultMonitorConfig();
    await assert.doesNotReject(() =>
      runHealthMonitor(cfg, {
        runAllChecks:      async () => { throw new Error('checks exploded'); },
        sendNotifications: mockNotify,
      }),
    );
  });

  it('never throws when storeReport throws', async () => {
    const cfg = defaultMonitorConfig();
    await assert.doesNotReject(() =>
      runHealthMonitor(cfg, {
        runAllChecks:      async () => greenChecks(),
        sendNotifications: mockNotify,
        storeReport:       async () => { throw new Error('db down'); },
      }),
    );
  });

  it('never throws when sendNotifications throws', async () => {
    const cfg = defaultMonitorConfig();
    await assert.doesNotReject(() =>
      runHealthMonitor(cfg, {
        runAllChecks:      async () => greenChecks(),
        sendNotifications: async () => { throw new Error('smtp down'); },
      }),
    );
  });

  it('returns report even when runAllChecks throws', async () => {
    const cfg = defaultMonitorConfig();
    const { report } = await runHealthMonitor(cfg, {
      runAllChecks:      async () => { throw new Error('fail'); },
      sendNotifications: mockNotify,
    });
    assert.ok(report.report_id.length > 0);
  });
});
