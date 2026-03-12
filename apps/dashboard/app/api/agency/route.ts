/**
 * apps/dashboard/app/api/agency/route.ts
 *
 * POST /api/agency — create a new agency account
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildAgencyAccount, type AgencyPlan } from '../../../../../tools/agency/agency_account.js';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({})) as { agency_name?: string; plan?: AgencyPlan };
    const { agency_name, plan = 'starter' } = body;

    if (!agency_name) {
      return NextResponse.json({ error: 'agency_name is required' }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const { createServerClient } = await import('@/lib/supabase');
    const db = createServerClient();

    // Get current user id from session
    const { data: { user } } = await (db as any).auth.getUser();
    const owner_user_id = user?.id ?? 'unknown';

    const agency = buildAgencyAccount(agency_name, owner_user_id, plan);

    const { data, error } = await (db as any)
      .from('agency_accounts')
      .insert(agency)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json(data ?? agency, {
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
