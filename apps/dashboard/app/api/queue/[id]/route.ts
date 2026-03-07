import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const body = await req.json() as { execution_status: string };
  const { execution_status } = body;

  if (!execution_status) {
    return NextResponse.json({ error: 'execution_status is required' }, { status: 400 });
  }

  const db = createServerClient();
  const { error } = await db
    .from('action_queue')
    .update({ execution_status, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
