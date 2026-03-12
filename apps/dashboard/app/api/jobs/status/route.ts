/**
 * GET /api/jobs/status
 *
 * Returns live job status for a tenant.
 * Query params: tenant_id (required), limit (default 20)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenant_id');
  const limit    = Number(req.nextUrl.searchParams.get('limit') ?? '20');

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
  }

  const db = createServerClient();

  try {
    // Queued jobs
    const { data: queued } = await db
      .from('jobs')
      .select('id, site_id, tenant_id, priority, status, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'queued')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    // Running jobs
    const { data: running } = await db
      .from('jobs')
      .select('id, site_id, tenant_id, priority, status, created_at, started_at, pages_crawled, issues_found')
      .eq('tenant_id', tenantId)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(limit);

    // Recent completed/failed
    const { data: recent } = await db
      .from('jobs')
      .select('id, site_id, tenant_id, priority, status, created_at, started_at, completed_at, pages_crawled, issues_found, error')
      .eq('tenant_id', tenantId)
      .in('status', ['done', 'failed'])
      .order('completed_at', { ascending: false })
      .limit(limit);

    // Summary counts
    const { count: queuedCount }  = await db.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'queued');
    const { count: runningCount } = await db.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'running');
    const { count: doneCount }    = await db.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'done');
    const { count: failedCount }  = await db.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'failed');

    return NextResponse.json({
      queue:   queued  ?? [],
      running: running ?? [],
      recent:  recent  ?? [],
      summary: {
        queued:  queuedCount  ?? 0,
        running: runningCount ?? 0,
        done:    doneCount    ?? 0,
        failed:  failedCount  ?? 0,
      },
    }, {
      headers: { 'Cache-Control': 'private, max-age=5' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
