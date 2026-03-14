/**
 * apps/dashboard/app/api/agency/[agencyId]/roster/route.ts
 *
 * GET  /api/agency/{agencyId}/roster — return full roster
 * POST /api/agency/{agencyId}/roster — add site to roster
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildRosterEntry } from '@tools/agency/agency_roster.js';
import { canAddClientSite, getAgencyCapacityMessage } from '@tools/agency/agency_account.js';

interface RouteContext {
  params: Promise<{ agencyId: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { agencyId } = await ctx.params;
    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    const { data, error } = await (db as any)
      .from('agency_roster')
      .select('*')
      .eq('agency_id', agencyId)
      .order('added_at', { ascending: false });

    if (error) {
      return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { agencyId } = await ctx.params;
    const body = await req.json().catch(() => ({})) as {
      site_id?:      string;
      domain?:       string;
      platform?:     'shopify' | 'wordpress';
      client_name?:  string;
      client_email?: string;
    };

    const { site_id, domain, platform = 'shopify', client_name, client_email } = body;

    if (!site_id || !domain) {
      return NextResponse.json({ error: 'site_id and domain are required' }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    // Load agency to check capacity
    const { data: agency, error: agencyErr } = await (db as any)
      .from('agency_accounts')
      .select('*')
      .eq('agency_id', agencyId)
      .single();

    if (agencyErr || !agency) {
      return NextResponse.json({ error: 'Agency not found' }, {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (!canAddClientSite(agency)) {
      return NextResponse.json(
        { error: getAgencyCapacityMessage(agency) },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const entry = buildRosterEntry(agencyId, site_id, domain, platform, client_name, client_email);

    const { data: rosterData, error: rosterErr } = await (db as any)
      .from('agency_roster')
      .insert(entry)
      .select()
      .single();

    if (rosterErr) {
      return NextResponse.json({ error: rosterErr.message }, {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Increment active_client_sites
    await (db as any)
      .from('agency_accounts')
      .update({ active_client_sites: (agency.active_client_sites ?? 0) + 1 })
      .eq('agency_id', agencyId)
      .catch(() => { /* non-fatal */ });

    return NextResponse.json(rosterData ?? entry, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
