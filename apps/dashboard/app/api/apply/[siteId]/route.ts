/**
 * POST /api/apply/[siteId]
 *
 * Apply approved fixes for a site.
 * Auth: x-tenant-id header required.
 * Body: { item_ids: string[] }
 * Calls applyFix for each, returns summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@supabase/supabase-js';
import { applyFix, type ApplyResult, type ApprovedItem, type ApplyDeps } from '@tools/apply/apply_engine.js';
import { applyFix as shopifyApplyFix } from '../../../../../../packages/adapters/shopify/src/index.js';
import { checkBillingGate } from '@tools/billing/billing_gate.js';
import type { UsageDb } from '@tools/billing/usage_tracker.js';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient(url, key, { auth: { persistSession: false } });
}

function buildDeps(siteId: string): ApplyDeps {
  const db = getDb();
  return {
    async loadItem(itemId: string, sid: string): Promise<ApprovedItem | null> {
      const { data, error } = await db
        .from('action_queue')
        .select('id, run_id, tenant_id, site_id, issue_type, url, risk_score, priority, proposed_fix, execution_status')
        .eq('id', itemId)
        .eq('site_id', sid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as ApprovedItem | null;
    },

    async loadCredentials(sid: string) {
      const { data: cred } = await db
        .from('site_credentials')
        .select('credential_val')
        .eq('site_id', sid)
        .eq('credential_key', 'shopify_access_token')
        .maybeSingle();
      if (!cred?.credential_val) return null;

      const { data: site } = await db
        .from('sites')
        .select('site_url')
        .eq('site_id', sid)
        .maybeSingle();
      if (!site?.site_url) return null;

      return {
        access_token: cred.credential_val as string,
        store_url:    site.site_url as string,
      };
    },

    async shopifyApplyFix(request) {
      return shopifyApplyFix(request);
    },

    async markDeployed(itemId: string) {
      const { error } = await db
        .from('action_queue')
        .update({ execution_status: 'deployed', updated_at: new Date().toISOString() })
        .eq('id', itemId);
      if (error) throw new Error(error.message);
    },

    async markFailed(itemId: string, errorMsg: string) {
      const { error } = await db
        .from('action_queue')
        .update({ execution_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', itemId);
      if (error) throw new Error(error.message);
    },

    writeLog() {
      // In the API route context, we rely on the Shopify adapter's stderr logging
    },
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await params;

  // Auth check
  const tenantId = request.headers.get('x-tenant-id');
  if (!tenantId) {
    return NextResponse.json({ error: 'x-tenant-id header is required' }, { status: 401 });
  }

  // Validate site ownership
  const db = getDb();
  const { data: site } = await db
    .from('sites')
    .select('site_id')
    .eq('site_id', siteId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!site) {
    return NextResponse.json({ error: 'Site not found or access denied' }, { status: 404 });
  }

  // ── Billing gate: check apply_fix limit ──
  {
    const currentPeriod = () => {
      const now = new Date();
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const billingDb: UsageDb = {
      countSites:  async (tid) => { const { count } = await db.from('sites').select('id', { count: 'exact', head: true }).eq('tenant_id', tid); return count ?? 0; },
      countCrawls: async (tid) => { const start = `${currentPeriod()}-01T00:00:00Z`; const { count } = await db.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).gte('created_at', start); return count ?? 0; },
      countFixes:  async (tid) => { const start = `${currentPeriod()}-01T00:00:00Z`; const { count } = await db.from('action_queue').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('execution_status', 'deployed').gte('updated_at', start); return count ?? 0; },
      getTenantPlan: async (tid) => { const { data: t } = await db.from('tenants').select('plan_tier, billing_status').eq('id', tid).maybeSingle(); if (!t) return null; return { tier: (t.plan_tier as string) ?? 'starter', billing_status: (t.billing_status as string) ?? 'active' } as { tier: 'starter' | 'pro' | 'agency' | 'enterprise'; billing_status: 'active' | 'past_due' | 'canceled' | 'trialing' }; },
    };
    const gate = await checkBillingGate(tenantId, 'apply_fix', billingDb);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason, upgrade_required: gate.upgrade_required }, { status: 403 });
    }
  }

  // Parse body
  let body: { item_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const itemIds = body.item_ids;
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({ error: 'item_ids must be a non-empty array' }, { status: 400 });
  }

  if (itemIds.length > 50) {
    return NextResponse.json({ error: 'Maximum 50 items per request' }, { status: 400 });
  }

  // Load items
  const deps = buildDeps(siteId);
  const items: ApprovedItem[] = [];
  for (const id of itemIds) {
    const item = await deps.loadItem(id, siteId);
    if (!item) {
      return NextResponse.json({ error: `Item not found: ${id}` }, { status: 404 });
    }
    if (item.execution_status !== 'approved') {
      return NextResponse.json(
        { error: `Item ${id} is not approved (status: ${item.execution_status})` },
        { status: 400 },
      );
    }
    items.push(item);
  }

  // Apply each item
  const results: ApplyResult[] = [];
  let applied = 0;
  let failed  = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const result = await applyFix(item, deps);
      results.push(result);
      if (result.success) {
        applied++;
      } else {
        failed++;
        if (result.error) errors.push(`${item.id}: ${result.error}`);
      }
    } catch (err) {
      Sentry.captureException(err, { extra: { siteId, itemId: item.id } });
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${item.id}: ${message}`);
      results.push({ success: false, item_id: item.id, error: message });
    }
  }

  return NextResponse.json({ applied, failed, errors, results });
}
