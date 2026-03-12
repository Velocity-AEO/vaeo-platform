/**
 * GET  /api/schedule
 *   Returns schedule status for all sites (site_id, has_pending, next_run_at, last_run_at, last_status).
 *
 * POST /api/schedule
 *   Body: { site_ids?: string[]; scheduled_at?: string; priority?: number }
 *   Schedules crawl_site jobs for all sites (or specified site_ids).
 *   Returns { total, scheduled, failed, results[] }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { scheduleAllSites, getScheduleStatus } from '../../../../../tools/jobs/scheduler.js';

export async function GET() {
  const db = createServerClient();

  try {
    // Get all active sites
    const { data: sites, error } = await db
      .from('sites')
      .select('site_id, site_url')
      .order('site_id', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const statuses = await Promise.all(
      (sites ?? []).map((s) => getScheduleStatus(s.site_id as string, db)),
    );

    return NextResponse.json(statuses);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const db = createServerClient();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* empty body is ok */ }

  const siteIds    = body['site_ids']   as string[] | undefined;
  const scheduledAt = body['scheduled_at'] as string | undefined;
  const priority   = typeof body['priority'] === 'number' ? body['priority'] : undefined;

  try {
    if (siteIds && siteIds.length > 0) {
      // Schedule only specified sites
      const { scheduleAllSites: _sa, ...rest } = await import('../../../../../tools/jobs/scheduler.js');
      const { scheduleSiteCrawl } = rest;

      // Get site URLs for specified IDs
      const { data: sites, error } = await db
        .from('sites')
        .select('site_id, site_url')
        .in('site_id', siteIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const results = await Promise.all(
        (sites ?? []).map((s) =>
          scheduleSiteCrawl(s.site_id as string, s.site_url as string, db, {
            scheduled_at: scheduledAt,
            priority,
          }),
        ),
      );

      const scheduled = results.filter((r) => r.ok).length;
      const failed    = results.filter((r) => !r.ok).length;
      return NextResponse.json({ total: results.length, scheduled, failed, results });
    }

    // Schedule all sites
    const result = await scheduleAllSites(db, { scheduled_at: scheduledAt, priority });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
