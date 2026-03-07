import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const db = createServerClient();

  const { data: rows, error } = await db
    .from('action_queue')
    .select('*')
    .in('execution_status', ['queued', 'deployed', 'failed', 'rolled_back'])
    .order('priority', { ascending: true })
    .order('risk_score', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json([]);

  // Enrich with site_url
  const allIds  = rows.map((r) => r.site_id as string).filter(Boolean);
  const siteIds = allIds.filter((id, i) => allIds.indexOf(id) === i);

  const { data: sites } = await db
    .from('sites')
    .select('site_id, site_url')
    .in('site_id', siteIds);

  const siteMap = new Map(
    (sites ?? []).map((s) => [s.site_id as string, s.site_url as string]),
  );

  const enriched = rows.map((r) => ({
    ...r,
    site_url: siteMap.get(r.site_id as string) ?? (r.site_id as string),
  }));

  return NextResponse.json(enriched);
}
