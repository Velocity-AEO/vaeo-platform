/**
 * GET  /api/schedule/:siteId
 *   Returns schedule status for a specific site.
 *
 * POST /api/schedule/:siteId
 *   Body: { scheduled_at?: string; priority?: number; max_urls?: number }
 *   Schedules a crawl_site job for the given site.
 *   Returns { ok, site_id, job_id?, error? }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { scheduleSiteCrawl, getScheduleStatus } from '../../../../../../tools/jobs/scheduler.js';
import { checkBillingGate } from '../../../../../../tools/billing/billing_gate.js';
import type { UsageDb } from '../../../../../../tools/billing/usage_tracker.js';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const db = createServerClient();

  try {
    const status = await getScheduleStatus(siteId, db);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const db = createServerClient();

  // Look up site_url
  const { data: site, error: siteErr } = await db
    .from('sites')
    .select('site_id, site_url')
    .eq('site_id', siteId)
    .maybeSingle();

  if (siteErr || !site) {
    return NextResponse.json({ error: `Site not found: ${siteId}` }, { status: 404 });
  }

  // ── Billing gate: check start_crawl limit ──
  const tenantId = req.headers.get('x-tenant-id') ?? (site as Record<string, unknown>)['tenant_id'] as string | undefined;
  if (tenantId) {
    const currentPeriod = () => {
      const now = new Date();
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const billingDb: UsageDb = {
      countSites:  async (tid) => { const { count } = await db.from('sites').select('id', { count: 'exact', head: true }).eq('tenant_id', tid); return count ?? 0; },
      countCrawls: async (tid) => { const start = `${currentPeriod()}-01T00:00:00Z`; const { count } = await db.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).gte('created_at', start); return count ?? 0; },
      countFixes:  async (tid) => { const start = `${currentPeriod()}-01T00:00:00Z`; const { count } = await db.from('action_queue').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('execution_status', 'deployed').gte('updated_at', start); return count ?? 0; },
      getTenantPlan: async (tid) => { const { data } = await db.from('tenants').select('plan_tier, billing_status').eq('id', tid).maybeSingle(); if (!data) return null; return { tier: (data.plan_tier as string) ?? 'starter', billing_status: (data.billing_status as string) ?? 'active' } as { tier: 'starter' | 'pro' | 'agency' | 'enterprise'; billing_status: 'active' | 'past_due' | 'canceled' | 'trialing' }; },
    };
    const gate = await checkBillingGate(tenantId, 'start_crawl', billingDb);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason, upgrade_required: gate.upgrade_required }, { status: 403 });
    }
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* empty body is ok */ }

  const scheduledAt = body['scheduled_at'] as string | undefined;
  const priority    = typeof body['priority'] === 'number' ? body['priority'] : undefined;
  const maxUrls     = typeof body['max_urls'] === 'number' ? body['max_urls'] : undefined;

  try {
    const result = await scheduleSiteCrawl(
      site.site_id as string,
      site.site_url as string,
      db,
      {
        scheduled_at: scheduledAt,
        priority,
        payload:      maxUrls ? { max_urls: maxUrls } : undefined,
      },
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
