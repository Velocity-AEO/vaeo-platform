import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/supabase';
import { scheduleWeeklyDigests, type SchedulerDeps, type TenantSite } from '@tools/email/scheduler.js';
import type { DigestDeps, ActionRow, HealthSnapshotRow } from '@tools/email/digest.js';

// ── CRON_SECRET verification ─────────────────────────────────────────────────

function verifyCronSecret(req: Request): boolean {
  const secret = process.env['CRON_SECRET'];
  if (!secret?.trim()) return false;
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret.trim()}`;
}

// ── Real deps ────────────────────────────────────────────────────────────────

function buildRealSchedulerDeps(): SchedulerDeps {
  const db = createServerClient();

  return {
    async getActiveTenantSites(): Promise<TenantSite[]> {
      // Join sites with tenant owner emails.
      // sites.status = 'active', tenants must have an owner_email.
      const { data, error } = await db
        .from('sites')
        .select('site_id, tenant_id')
        .eq('status', 'active');
      if (error) throw new Error(`sites query failed: ${error.message}`);
      if (!data || data.length === 0) return [];

      // Fetch owner emails for each tenant
      const tenantIds = [...new Set(data.map((s: { tenant_id: string }) => s.tenant_id))];
      const { data: tenants, error: tErr } = await db
        .from('tenants')
        .select('id, owner_email')
        .in('id', tenantIds);
      if (tErr) throw new Error(`tenants query failed: ${tErr.message}`);

      const emailMap = new Map(
        (tenants ?? []).map((t: { id: string; owner_email: string }) => [t.id, t.owner_email]),
      );

      return data
        .filter((s: { tenant_id: string }) => emailMap.has(s.tenant_id))
        .map((s: { site_id: string; tenant_id: string }) => ({
          site_id:     s.site_id,
          tenant_id:   s.tenant_id,
          owner_email: emailMap.get(s.tenant_id)!,
        }));
    },

    buildDigestDeps(siteId: string, tenantId: string): DigestDeps {
      return {
        async getSiteUrl() {
          const { data } = await db
            .from('sites')
            .select('site_url')
            .eq('site_id', siteId)
            .eq('tenant_id', tenantId)
            .maybeSingle();
          return (data as { site_url: string } | null)?.site_url ?? null;
        },

        async getRecentActions(_sid, _tid, since) {
          const { data, error } = await db
            .from('action_queue')
            .select('id, issue_type, url, execution_status, updated_at')
            .eq('site_id', siteId)
            .eq('tenant_id', tenantId)
            .gte('updated_at', since);
          if (error) throw new Error(error.message);
          return (data ?? []) as ActionRow[];
        },

        async getOpenIssueCount() {
          const { count, error } = await db
            .from('action_queue')
            .select('id', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .eq('tenant_id', tenantId)
            .in('execution_status', ['queued', 'pending_approval', 'failed']);
          if (error) throw new Error(error.message);
          return count ?? 0;
        },

        async getHealthScoreBefore() {
          const { data } = await db
            .from('health_snapshots')
            .select('score, grade, recorded_at')
            .eq('site_id', siteId)
            .lte('recorded_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('recorded_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return data as HealthSnapshotRow | null;
        },

        async getHealthScoreNow() {
          const { data } = await db
            .from('health_snapshots')
            .select('score, grade, recorded_at')
            .eq('site_id', siteId)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return data as HealthSnapshotRow | null;
        },
      };
    },
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await scheduleWeeklyDigests(buildRealSchedulerDeps());
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
