import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      site_id?: string;
      step?:    string;
      data?:    Record<string, unknown>;
    };

    const { site_id, step, data } = body;

    if (!site_id || !step) {
      return NextResponse.json(
        { ok: false, error: 'site_id and step are required' },
        { status: 400 },
      );
    }

    const supabase = createServerClient();

    // Read current state
    const { data: site } = await supabase
      .from('sites')
      .select('extra_data')
      .eq('id', site_id)
      .single();

    if (!site) {
      return NextResponse.json({ ok: false, error: 'Site not found' }, { status: 404 });
    }

    const extraData  = (site.extra_data as Record<string, unknown>) ?? {};
    const onboarding = (extraData.onboarding as Record<string, unknown>) ?? {
      site_id:           site_id,
      current_step:      'install',
      completed_steps:   [],
      shopify_connected: false,
      gsc_connected:     false,
      first_crawl_done:  false,
      issues_found:      0,
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    };

    // Mark step complete
    const completed = (onboarding.completed_steps as string[]) ?? [];
    if (!completed.includes(step)) {
      completed.push(step);
    }
    onboarding.completed_steps = completed;

    // Apply data overrides
    if (data) {
      Object.assign(onboarding, data);
    }

    // Advance current_step
    const STEP_ORDER = ['install', 'connect_shopify', 'connect_gsc', 'first_crawl', 'review_issues', 'complete'];
    let nextStep = 'complete';
    for (const s of STEP_ORDER) {
      if (!completed.includes(s)) { nextStep = s; break; }
    }
    onboarding.current_step = nextStep;
    onboarding.updated_at   = new Date().toISOString();

    extraData.onboarding = onboarding;
    await supabase
      .from('sites')
      .update({ extra_data: extraData })
      .eq('id', site_id);

    return NextResponse.json({ ok: true, onboarding });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
