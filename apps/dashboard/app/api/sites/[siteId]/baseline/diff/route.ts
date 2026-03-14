/**
 * apps/dashboard/app/api/sites/[siteId]/baseline/diff/route.ts
 *
 * GET /api/sites/:siteId/baseline/diff
 * Returns field-level diffs between this week's and last week's baselines.
 * Sorted: critical → high → medium → low → none.
 * Requires auth. Cache-Control: no-store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { diffBaselines, calculateBaselineSeverity } from '@tools/sandbox/baseline_snapshot.js';

type Ctx = { params: Promise<{ siteId: string }> };

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, none: 4,
};

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const headers = { 'Cache-Control': 'no-store' };

  try {
    const { siteId } = await ctx.params;

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400, headers });
    }

    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    // Auth check
    const { data: { user } } = await (db as any).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    // Site ownership check
    const { data: site } = await (db as any)
      .from('sites')
      .select('site_id')
      .eq('site_id', siteId)
      .maybeSingle();

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404, headers });
    }

    // Load current week baselines
    const today      = new Date();
    const weekAgo    = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const currentDate  = today.toISOString().slice(0, 10);
    const previousDate = weekAgo.toISOString().slice(0, 10);

    let currentRows: any[]  = [];
    let previousRows: any[] = [];

    try {
      const { data: curr } = await (db as any)
        .from('site_baselines')
        .select('*')
        .eq('site_id', siteId)
        .gte('snapshot_date', weekAgo.toISOString().slice(0, 10))
        .order('snapshot_date', { ascending: false });
      currentRows = curr ?? [];

      const { data: prev } = await (db as any)
        .from('site_baselines')
        .select('*')
        .eq('site_id', siteId)
        .gte('snapshot_date', twoWeeksAgo.toISOString().slice(0, 10))
        .lt('snapshot_date', weekAgo.toISOString().slice(0, 10))
        .order('snapshot_date', { ascending: false });
      previousRows = prev ?? [];
    } catch {
      // DB failure — return empty
    }

    // Build previous lookup by URL
    const previousByUrl = new Map<string, any>();
    for (const row of previousRows) {
      if (!previousByUrl.has(row.url)) {
        previousByUrl.set(row.url, row);
      }
    }

    // Diff each current snapshot against its previous
    const diffs: any[] = [];
    const seenUrls = new Set<string>();

    for (const curr of currentRows) {
      if (seenUrls.has(curr.url)) continue;
      seenUrls.add(curr.url);

      const prev = previousByUrl.get(curr.url);
      if (!prev) continue;

      try {
        const diff = diffBaselines(curr, prev);
        diffs.push({
          ...diff,
          current_snapshot_date: curr.snapshot_date,
          previous_snapshot_date: prev.snapshot_date,
        });
      } catch {
        // non-fatal
      }
    }

    // Sort: critical first
    diffs.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4));

    const last_captured = currentRows[0]?.captured_at ?? null;

    return NextResponse.json({
      diffs,
      total:            diffs.length,
      degraded_count:   diffs.filter(d => d.net_change === 'worse').length,
      critical_count:   diffs.filter(d => d.severity === 'critical').length,
      high_count:       diffs.filter(d => d.severity === 'high').length,
      last_captured,
    }, { headers });
  } catch {
    return NextResponse.json(
      { diffs: [], total: 0, degraded_count: 0, critical_count: 0, high_count: 0, last_captured: null },
      { headers },
    );
  }
}
