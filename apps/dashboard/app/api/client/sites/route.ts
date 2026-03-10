import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getTenantIdFromRequest } from '@/lib/auth';
import { getClientSites, type ClientSitesDeps } from './handler';

function buildDeps(): ClientSitesDeps {
  const db = createServerClient();
  return {
    loadSites: async (tenantId) => {
      const { data, error } = await db
        .from('sites')
        .select('site_id, site_url, cms_type, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    loadAllIssues: async (tenantId) => {
      const { data, error } = await db
        .from('action_queue')
        .select('site_id, issue_type, execution_status')
        .eq('tenant_id', tenantId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    loadLastScans: async (tenantId) => {
      const { data, error } = await db
        .from('action_log')
        .select('site_id, ts')
        .eq('tenant_id', tenantId)
        .eq('stage', 'crawl:complete')
        .order('ts', { ascending: false });
      if (error) throw new Error(error.message);
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        if (!map.has(row.site_id)) map.set(row.site_id, row.ts);
      }
      return map;
    },
  };
}

/**
 * GET /api/client/sites
 * Returns all sites for the authenticated tenant with health scores.
 */
export async function GET(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const result = await getClientSites(tenantId, buildDeps());
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ sites: result.sites });
}
