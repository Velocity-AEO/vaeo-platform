import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Statuses that the command-center UI is allowed to set via this generic PATCH.
// 'approved' is intentionally excluded — only the dashboard UI approval action
// (POST /api/sites/[siteId]/fixes with action='approve') may set that status.
const ALLOWED_STATUSES = new Set([
  'deployed',
  'failed',
  'rolled_back',
  'skipped',
  'pending_approval',
  'regression_detected',
]);

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const body = await req.json() as { execution_status: string };
  const { execution_status } = body;

  if (!execution_status) {
    return NextResponse.json({ error: 'execution_status is required' }, { status: 400 });
  }

  if (!ALLOWED_STATUSES.has(execution_status)) {
    return NextResponse.json(
      { error: `Cannot set execution_status to '${execution_status}' via this endpoint` },
      { status: 400 },
    );
  }

  const db = createServerClient();

  const { error } = await db
    .from('action_queue')
    .update({ execution_status, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
