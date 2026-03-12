import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { Tenant } from '../../../../lib/types.js';
import {
  getPlanLimits,
  type PlanTier,
  type PlanLimits,
} from '../../../../../../../tools/billing/plan_definitions.js';
import {
  computeBillingState,
  PLAN_PRICES,
} from '../../../../../../../tools/billing/billing_state.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface UsageRecord {
  sites_used:        number;
  crawls_this_month: number;
  fixes_this_month:  number;
}

interface SubscriptionResponse {
  tier:                string;
  billing_status:      string;
  current_period_end:  string | null;
  limits:              PlanLimits;
  usage:               UsageRecord;
  state:               ReturnType<typeof computeBillingState>;
  plan_details:        (typeof PLAN_PRICES)[string] | undefined;
  available_plans:     typeof PLAN_PRICES;
}

// ── Hardcoded tenant (same as other billing routes) ──────────────────────────

const HARDCODED_TENANT = '00000000-0000-0000-0000-000000000001';

// ── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/billing/subscription
 * Returns current subscription status, plan limits, usage, and billing state.
 */
export async function GET() {
  try {
    const db = createServerClient();

    // Load tenant
    const { data: tenant, error: tenantErr } = await db
      .from('tenants')
      .select('*')
      .eq('id', HARDCODED_TENANT)
      .maybeSingle();

    if (tenantErr) {
      return NextResponse.json({ error: tenantErr.message }, { status: 500 });
    }
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const t = tenant as Tenant;
    const tier = (t.plan ?? 'starter') as PlanTier;
    const limits = getPlanLimits(tier);

    // Count sites
    const { count: sitesCount } = await db
      .from('sites')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', HARDCODED_TENANT);

    // Count crawls this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count: crawlsCount } = await db
      .from('runs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', HARDCODED_TENANT)
      .gte('created_at', monthStart.toISOString());

    // Count fixes this month
    const { count: fixesCount } = await db
      .from('action_queue')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', HARDCODED_TENANT)
      .in('execution_status', ['deployed', 'completed'])
      .gte('updated_at', monthStart.toISOString());

    const sitesUsed  = sitesCount  ?? 0;
    const crawlsUsed = crawlsCount ?? 0;
    const fixesUsed  = fixesCount  ?? 0;

    const billingStatus = t.billing_status ?? 'active';
    const periodEnd = (t as Record<string, unknown>).billing_period_end as string | undefined;

    const state = computeBillingState(
      HARDCODED_TENANT,
      tier,
      billingStatus,
      { sites: sitesUsed, crawls: crawlsUsed, fixes: fixesUsed },
      { sites: limits.max_sites, crawls: limits.max_crawls_per_month, fixes: limits.max_fixes_per_month },
      periodEnd,
    );

    const response: SubscriptionResponse = {
      tier,
      billing_status:     billingStatus,
      current_period_end: periodEnd ?? null,
      limits,
      usage: {
        sites_used:        sitesUsed,
        crawls_this_month: crawlsUsed,
        fixes_this_month:  fixesUsed,
      },
      state,
      plan_details:    PLAN_PRICES[tier],
      available_plans: PLAN_PRICES,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
