import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getVerification, type VerifyDeps } from './handler';

function buildDeps(): VerifyDeps {
  const db = createServerClient();
  return {
    loadSite: async (siteId) => {
      const { data, error } = await db
        .from('sites')
        .select('site_id, site_url')
        .eq('site_id', siteId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    loadIssues: async (siteId) => {
      const { data, error } = await db
        .from('action_queue')
        .select('issue_type, execution_status')
        .eq('site_id', siteId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    loadLastRun: async (siteId) => {
      const { data, error } = await db
        .from('action_log')
        .select('ts')
        .eq('site_id', siteId)
        .eq('stage', 'crawl:complete')
        .order('ts', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.ts ?? null;
    },
  };
}

/**
 * GET /api/verify/[siteId]
 * Public endpoint — no auth required.
 * Returns summary verification data for the site.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const result = await getVerification(siteId, buildDeps());

  if (!result.ok) {
    const status = result.error === 'Site not found' ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result.data, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
