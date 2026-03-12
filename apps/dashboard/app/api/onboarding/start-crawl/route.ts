import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json() as { site_id?: string };
    const { site_id } = body;

    if (!site_id) {
      return NextResponse.json(
        { ok: false, error: 'site_id is required' },
        { status: 400 },
      );
    }

    const supabase = createServerClient();

    // Enqueue crawl job
    const { data: job, error } = await supabase
      .from('job_queue')
      .insert([{
        type:     'crawl_site',
        site_id,
        priority: 1,
        status:   'pending',
        payload:  { source: 'onboarding', first_crawl: true },
      }])
      .select('id')
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: 'Failed to enqueue crawl job' },
        { status: 500 },
      );
    }

    // Update onboarding step
    const { data: site } = await supabase
      .from('sites')
      .select('extra_data')
      .eq('id', site_id)
      .single();

    if (site) {
      const extraData  = (site.extra_data as Record<string, unknown>) ?? {};
      const onboarding = (extraData.onboarding as Record<string, unknown>) ?? {};
      const completed  = (onboarding.completed_steps as string[]) ?? [];
      if (!completed.includes('first_crawl')) completed.push('first_crawl');
      onboarding.completed_steps = completed;
      onboarding.first_crawl_done = true;
      onboarding.current_step = 'review_issues';
      onboarding.updated_at = new Date().toISOString();
      extraData.onboarding = onboarding;
      await supabase.from('sites').update({ extra_data: extraData }).eq('id', site_id);
    }

    return NextResponse.json({ ok: true, job_id: job?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
