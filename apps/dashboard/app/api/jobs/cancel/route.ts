/**
 * POST /api/jobs/cancel
 *
 * Cancels all queued jobs for a tenant.
 * Body: { tenant_id: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { tenant_id?: string };
    const { tenant_id } = body;

    if (!tenant_id) {
      return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Cancel all queued jobs — do not touch running jobs
    const { data } = await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error:  'cancelled by user',
        completed_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenant_id)
      .eq('status', 'queued')
      .select('id');

    return NextResponse.json({ cancelled: data?.length ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
