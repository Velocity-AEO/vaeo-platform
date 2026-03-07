import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function GET(
  _req: Request,
  { params }: { params: { runId: string } },
) {
  const db = createServerClient();
  const { data, error } = await db
    .from('action_queue')
    .select('*')
    .eq('run_id', params.runId)
    .eq('tenant_id', TENANT_ID)
    .order('priority', { ascending: true })
    .order('risk_score', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
