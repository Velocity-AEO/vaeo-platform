import { NextRequest, NextResponse } from 'next/server';
import { runHealthMonitor, defaultMonitorConfig } from '@tools/health/health_monitor';
import type { HealthCheckResult } from '@tools/health/health_check';

// ── Mock deps ─────────────────────────────────────────────────────────────────

function mockChecks(): HealthCheckResult[] {
  const now   = new Date().toISOString();
  const h1ago = new Date(Date.now() - 3600_000).toISOString();
  const h50ago = new Date(Date.now() - 50 * 3600_000).toISOString();
  return [
    { component: 'crawler',          status: 'green',  message: 'Crawler healthy',                latency_ms: 45,  checked_at: now, last_success: h1ago },
    { component: 'ai_generator',     status: 'green',  message: 'AI generator healthy',           latency_ms: 890, checked_at: now, last_success: h1ago },
    { component: 'apply_engine',     status: 'green',  message: 'Apply engine healthy',                            checked_at: now, last_success: h1ago },
    { component: 'validator',        status: 'green',  message: 'Validator healthy',                               checked_at: now, last_success: h1ago },
    { component: 'learning_center',  status: 'yellow', message: 'Learning center cold',                            checked_at: now },
    { component: 'gsc_sync',         status: 'yellow', message: 'GSC sync stale',                                  checked_at: now },
    { component: 'job_queue',        status: 'green',  message: 'Job queue healthy',                               checked_at: now, last_success: h1ago },
    { component: 'shopify_api',      status: 'green',  message: 'Shopify API healthy',            latency_ms: 210, checked_at: now, last_success: h1ago },
    { component: 'stripe_webhook',   status: 'yellow', message: 'No Stripe events received',                       checked_at: now },
    { component: 'schema_validator', status: 'green',  message: 'Schema validator healthy',                        checked_at: now, last_success: h1ago },
    { component: 'sandbox',          status: 'green',  message: 'Sandbox healthy',                                 checked_at: now, last_success: h1ago },
    { component: 'tracer',           status: 'green',  message: 'Tracer healthy',                                  checked_at: now, last_success: h1ago },
  ];
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const cfg = defaultMonitorConfig();
    cfg.store_report = false;

    const { report, notifications } = await runHealthMonitor(cfg, {
      runAllChecks:      async () => mockChecks(),
      sendNotifications: async (r, c) => {
        const { sendNotifications } = await import('@tools/health/notification_engine');
        return sendNotifications(r, c, {
          logNotification: async () => { /* no-op in demo */ },
        });
      },
    });

    return NextResponse.json(
      { report, notifications },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { site_id?: string; run_id?: string };
    const cfg  = defaultMonitorConfig(body.site_id, body.run_id);
    cfg.store_report = false;

    const { report, notifications } = await runHealthMonitor(cfg, {
      runAllChecks:      async () => mockChecks(),
      sendNotifications: async (r, c) => {
        const { sendNotifications } = await import('@tools/health/notification_engine');
        return sendNotifications(r, c, {
          logNotification: async () => { /* no-op in demo */ },
        });
      },
    });

    return NextResponse.json(
      { report, notifications },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
