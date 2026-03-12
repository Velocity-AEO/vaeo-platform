/**
 * POST /api/jobs/orchestrate
 *
 * Triggers multi-site job orchestration for a tenant.
 * Body: { tenant_id, site_ids, priority? }
 * Checks billing gate for multi_site_jobs feature.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkBillingGate } from '../../../../../../tools/billing/billing_gate.js';
import type { UsageDb } from '../../../../../../tools/billing/usage_tracker.js';
import { orchestrateJobs, type JobPriority, type OrchestratorDb } from '../../../../../../tools/jobs/job_orchestrator.js';

function buildBillingDb(supabase: ReturnType<typeof createServerClient>): UsageDb {
  const currentPeriod = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  return {
    countSites:  async (tid) => { const { count } = await supabase.from('sites').select('id', { count: 'exact', head: true }).eq('tenant_id', tid); return count ?? 0; },
    countCrawls: async (tid) => { const start = `${currentPeriod()}-01T00:00:00Z`; const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).gte('created_at', start); return count ?? 0; },
    countFixes:  async (tid) => { const start = `${currentPeriod()}-01T00:00:00Z`; const { count } = await supabase.from('action_queue').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('execution_status', 'deployed').gte('updated_at', start); return count ?? 0; },
    getTenantPlan: async (tid) => { const { data } = await supabase.from('tenants').select('plan_tier, billing_status').eq('id', tid).maybeSingle(); if (!data) return null; return { tier: (data.plan_tier as string) ?? 'starter', billing_status: (data.billing_status as string) ?? 'active' } as { tier: 'starter' | 'pro' | 'agency' | 'enterprise'; billing_status: 'active' | 'past_due' | 'canceled' | 'trialing' }; },
  };
}

function buildOrchestratorDb(supabase: ReturnType<typeof createServerClient>): OrchestratorDb {
  return {
    insertJob: async (job) => {
      await supabase.from('jobs').insert([{
        id:         job.job_id,
        site_id:    job.site_id,
        tenant_id:  job.tenant_id,
        priority:   job.priority === 'high' ? 1 : job.priority === 'normal' ? 5 : 10,
        status:     job.status,
        job_type:   'crawl_site',
        created_at: new Date().toISOString(),
      }]);
    },
    updateJob: async (job_id, updates) => {
      const patch: Record<string, unknown> = {};
      if (updates.status)        patch.status       = updates.status;
      if (updates.started_at)    patch.started_at   = updates.started_at;
      if (updates.completed_at)  patch.completed_at = updates.completed_at;
      if (updates.error)         patch.error        = updates.error;
      if (updates.pages_crawled !== undefined) patch.pages_crawled = updates.pages_crawled;
      if (updates.issues_found !== undefined)  patch.issues_found  = updates.issues_found;
      await supabase.from('jobs').update(patch).eq('id', job_id);
    },
    getJobs: async (tenant_id) => {
      const { data } = await supabase.from('jobs').select('*').eq('tenant_id', tenant_id).order('created_at', { ascending: false }).limit(100);
      return (data ?? []).map((r) => ({
        job_id:       r.id as string,
        site_id:      r.site_id as string,
        tenant_id:    r.tenant_id as string,
        priority:     (r.priority === 1 ? 'high' : r.priority === 5 ? 'normal' : 'low') as JobPriority,
        status:       r.status as 'queued' | 'running' | 'done' | 'failed',
        started_at:   r.started_at as string | undefined,
        completed_at: r.completed_at as string | undefined,
        error:        r.error as string | undefined,
        pages_crawled: r.pages_crawled as number | undefined,
        issues_found:  r.issues_found as number | undefined,
      }));
    },
    cancelQueued: async (tenant_id) => {
      const { data } = await supabase.from('jobs').update({ status: 'failed', error: 'cancelled by user' }).eq('tenant_id', tenant_id).eq('status', 'queued').select('id');
      return data?.length ?? 0;
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      tenant_id?: string;
      site_ids?:  string[];
      priority?:  JobPriority;
    };

    const { tenant_id, site_ids, priority = 'normal' } = body;

    if (!tenant_id || !Array.isArray(site_ids) || site_ids.length === 0) {
      return NextResponse.json(
        { error: 'tenant_id and non-empty site_ids[] are required' },
        { status: 400 },
      );
    }

    const supabase = createServerClient();

    // Billing gate: check multi_site_jobs
    const billingDb = buildBillingDb(supabase);
    const gate = await checkBillingGate(tenant_id, 'multi_site_jobs', billingDb);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: gate.reason, upgrade_required: gate.upgrade_required },
        { status: 403 },
      );
    }

    const orchDb = buildOrchestratorDb(supabase);
    const result = await orchestrateJobs(tenant_id, site_ids, priority, orchDb);

    return NextResponse.json({
      total:     result.total_jobs,
      completed: result.completed,
      failed:    result.failed,
      skipped:   result.skipped,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
