import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      shop_domain?: string;
      tenant_id?:   string;
      plan?:        string;
    };

    const { shop_domain, tenant_id, plan } = body;

    if (!shop_domain || !tenant_id) {
      return NextResponse.json(
        { ok: false, error: 'shop_domain and tenant_id are required' },
        { status: 400 },
      );
    }

    const domain  = shop_domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    const siteUrl = `https://${domain}`;

    const supabase = createServerClient();

    // Check existing
    const { data: existing } = await supabase
      .from('sites')
      .select('id, extra_data')
      .eq('site_url', siteUrl)
      .maybeSingle();

    if (existing) {
      const extraData = existing.extra_data as Record<string, unknown> | null;
      const onboarding = extraData?.onboarding as Record<string, unknown> | null;
      return NextResponse.json({
        ok:             true,
        site_id:        existing.id,
        already_exists: true,
        current_step:   onboarding?.current_step ?? 'connect_shopify',
      });
    }

    // Create site
    const now = new Date().toISOString();
    const onboarding = {
      site_id:           '',
      current_step:      'connect_shopify',
      completed_steps:   ['install'],
      shopify_connected: false,
      gsc_connected:     false,
      first_crawl_done:  false,
      issues_found:      0,
      created_at:        now,
      updated_at:        now,
    };

    const { data: inserted, error } = await supabase
      .from('sites')
      .insert([{
        site_url:   siteUrl,
        platform:   'shopify',
        tenant_id,
        extra_data: { onboarding, plan: plan ?? 'free' },
      }])
      .select('id')
      .single();

    if (error || !inserted) {
      return NextResponse.json(
        { ok: false, error: 'Failed to create site' },
        { status: 500 },
      );
    }

    // Update onboarding site_id
    onboarding.site_id = inserted.id as string;
    await supabase
      .from('sites')
      .update({ extra_data: { onboarding, plan: plan ?? 'free' } })
      .eq('id', inserted.id);

    return NextResponse.json({
      ok:           true,
      site_id:      inserted.id,
      current_step: 'connect_shopify',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
