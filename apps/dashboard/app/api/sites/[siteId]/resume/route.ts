/**
 * app/api/sites/[siteId]/resume/route.ts
 *
 * POST /api/sites/[siteId]/resume
 * Clears the pipeline suspension for a site (admin/agency only).
 * Never throws — returns JSON result.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  try {
    const { siteId } = await params;

    if (!siteId) {
      return NextResponse.json({ ok: false, error: 'siteId is required' }, { status: 400 });
    }

    const db = createServerClient();

    const { error } = await (db as any)
      .from('sites')
      .update({
        pipeline_suspended:         false,
        pipeline_suspended_at:      null,
        pipeline_resume_at:         null,
        pipeline_suspension_reason: null,
        consecutive_failures:       0,
      })
      .eq('site_id', siteId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
