import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getFixes, updateFix, type FixesDeps } from './handler';

function buildDeps(): FixesDeps {
  const db = createServerClient();
  return {
    loadActions: async (siteId) => {
      const { data, error } = await db
        .from('action_queue')
        .select('id, url, issue_type, proposed_fix, execution_status, priority, risk_score, reasoning_block')
        .eq('site_id', siteId)
        .in('execution_status', ['pending_approval', 'approved', 'completed'])
        .order('priority', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    loadSnapshots: async (siteId) => {
      const { data, error } = await db
        .from('tracer_field_snapshots')
        .select('url, field_type, current_value')
        .eq('site_id', siteId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    updateStatus: async (id, siteId, newStatus) => {
      const { error } = await db
        .from('action_queue')
        .update({ execution_status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('site_id', siteId);
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * GET /api/sites/[siteId]/fixes
 * Returns action_queue rows where execution_status IN ('pending_approval','approved','completed').
 */
export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  const result = await getFixes(params.siteId, buildDeps());
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ fixes: result.fixes });
}

/**
 * POST /api/sites/[siteId]/fixes
 * Body: { id: string, action: 'approve' | 'skip' }
 * Updates execution_status on the action_queue row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { siteId: string } },
) {
  try {
    const body = await req.json() as { id: string; action: string };
    const result = await updateFix(params.siteId, body.id, body.action, buildDeps());
    if (!result.ok) {
      const status = result.error === 'id is required' || result.error?.startsWith('action must') ? 400 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, execution_status: result.execution_status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
