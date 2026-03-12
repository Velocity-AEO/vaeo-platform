/**
 * apps/dashboard/app/api/agency/[agencyId]/route.ts
 *
 * GET  /api/agency/{agencyId} — load agency account
 * PATCH /api/agency/{agencyId} — update agency (name, plan)
 */

import { NextRequest, NextResponse } from 'next/server';
import { upgradeAgencyPlan, type AgencyPlan } from '../../../../../../tools/agency/agency_account.js';

interface RouteContext {
  params: Promise<{ agencyId: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { agencyId } = await ctx.params;
    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    const { data, error } = await (db as any)
      .from('agency_accounts')
      .select('*')
      .eq('agency_id', agencyId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Agency not found' }, {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { agencyId } = await ctx.params;
    const body = await req.json().catch(() => ({})) as { agency_name?: string; plan?: AgencyPlan };

    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    // Load current agency
    const { data: current, error: loadErr } = await (db as any)
      .from('agency_accounts')
      .select('*')
      .eq('agency_id', agencyId)
      .single();

    if (loadErr || !current) {
      return NextResponse.json({ error: 'Agency not found' }, {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    let updated = { ...current };

    if (body.agency_name) updated.agency_name = body.agency_name;
    if (body.plan)        updated = upgradeAgencyPlan(updated, body.plan);

    const { data, error } = await (db as any)
      .from('agency_accounts')
      .update(updated)
      .eq('agency_id', agencyId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json(data ?? updated, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
