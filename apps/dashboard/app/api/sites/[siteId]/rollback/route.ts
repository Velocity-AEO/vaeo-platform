/**
 * apps/dashboard/app/api/sites/[siteId]/rollback/route.ts
 *
 * POST /api/sites/{siteId}/rollback
 *   Body: { fix_id?: string }
 *   If fix_id: roll back that specific fix.
 *   If no fix_id: roll back the last fix for the site.
 *
 * Uses per-fix-type rollback windows from the matrix.
 */

import { NextRequest, NextResponse } from 'next/server';
import { rollbackFix, rollbackLastFix, type RollbackTarget } from '../../../../../../tools/rollback/rollback_engine.js';
import { buildRollbackRecord, getRollbackBlockReason } from '../../../../../../tools/rollback/rollback_history.js';
import {
  isWithinRollbackWindow,
  getRollbackWindowHours,
  getRollbackWindowLabel,
  calculateRollbackDeadline,
} from '../../../../../../tools/rollback/rollback_window_matrix.js';

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { siteId } = await ctx.params;
    const body = await req.json().catch(() => ({})) as { fix_id?: string };
    const fix_id = body.fix_id ?? null;

    // Lazy-import Supabase to avoid build issues in test environments
    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    let target: RollbackTarget | null = null;

    if (fix_id) {
      // Load specific fix
      const { data, error } = await (db as any)
        .from('action_queue')
        .select('*')
        .eq('id', fix_id)
        .eq('site_id', siteId)
        .limit(1)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Fix not found' }, {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        });
      }

      target = {
        fix_id:         data.id,
        site_id:        data.site_id,
        url:            data.url ?? '',
        platform:       data.platform ?? 'shopify',
        signal_type:    data.signal_type ?? data.fix_type ?? '',
        original_value: data.original_value ?? null,
        applied_value:  data.applied_value ?? data.proposed_value ?? '',
        applied_at:     data.applied_at ?? data.updated_at ?? new Date().toISOString(),
      };
    } else {
      // Load last fix for the site
      const { data, error } = await (db as any)
        .from('action_queue')
        .select('*')
        .eq('site_id', siteId)
        .eq('status', 'applied')
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json({ error: 'No applied fix found for this site' }, {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        });
      }

      target = {
        fix_id:         data.id,
        site_id:        data.site_id,
        url:            data.url ?? '',
        platform:       data.platform ?? 'shopify',
        signal_type:    data.signal_type ?? data.fix_type ?? '',
        original_value: data.original_value ?? null,
        applied_value:  data.applied_value ?? data.proposed_value ?? '',
        applied_at:     data.applied_at ?? data.updated_at ?? new Date().toISOString(),
      };
    }

    // Check rollback eligibility using per-type window
    const issue_type = target.signal_type;
    const window_hours = getRollbackWindowHours(issue_type);

    // Check original value
    if (target.original_value === null) {
      return NextResponse.json({ error: 'No original value recorded for this fix' }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Check per-type window
    if (!isWithinRollbackWindow(target.applied_at, issue_type)) {
      return NextResponse.json({
        error:        'Rollback window expired',
        window_label: getRollbackWindowLabel(issue_type),
        deadline:     calculateRollbackDeadline(target.applied_at, issue_type),
      }, {
        status: 409,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Execute rollback
    const result = await rollbackFix(target);

    // Save rollback record
    const record = buildRollbackRecord(result, target, 'client');
    await (db as any).from('rollback_history').insert(record).catch(() => {
      // non-fatal
    });

    return NextResponse.json(
      { result, record },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
