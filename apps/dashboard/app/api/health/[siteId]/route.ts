import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculateHealthScore } from '@/lib/scoring';

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  const { siteId } = params;

  try {
    const db = createServerClient();

    const { data, error } = await db
      .from('action_queue')
      .select('issue_type')
      .eq('site_id', siteId)
      .in('execution_status', ['queued', 'pending_approval', 'failed']);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const score = calculateHealthScore(data ?? []);
    return NextResponse.json({ score });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
