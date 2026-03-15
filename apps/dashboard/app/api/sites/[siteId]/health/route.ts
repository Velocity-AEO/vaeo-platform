import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getHealthData, type SiteHealthDeps, type IssueRow } from './handler';

// ── Real deps (production) ────────────────────────────────────────────────────

function buildRealDeps(): SiteHealthDeps {
  // Use the service role key so RLS is bypassed on server-side queries.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const db = createClient(url, key);

  return {
    async getSite(siteId) {
      const { data, error } = await db
        .from('sites')
        .select('site_id, site_url, cms_type')
        .eq('site_id', siteId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { site_id: string; site_url: string; cms_type: string } | null;
    },

    async getOpenIssues(siteId) {
      const { data, error } = await db
        .from('action_queue')
        .select('id, issue_type, url, risk_score, priority, execution_status')
        .eq('site_id', siteId)
        .in('execution_status', ['queued', 'pending_approval', 'failed']);
      if (error) throw new Error(error.message);
      return (data ?? []) as IssueRow[];
    },

    async getLastUpdated(siteId) {
      const { data } = await db
        .from('action_queue')
        .select('updated_at')
        .eq('site_id', siteId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { updated_at?: string } | null)?.updated_at ?? null;
    },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  const result = await getHealthData(params.siteId, buildRealDeps());

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
