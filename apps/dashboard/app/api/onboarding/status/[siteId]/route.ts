import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  try {
    const { siteId } = await params;
    if (!siteId) {
      return NextResponse.json({ error: 'Missing site_id' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: site } = await supabase
      .from('sites')
      .select('extra_data')
      .eq('id', siteId)
      .single();

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const extraData = site.extra_data as Record<string, unknown> | null;
    const onboarding = extraData?.onboarding ?? null;

    if (!onboarding) {
      return NextResponse.json({ error: 'No onboarding data' }, { status: 404 });
    }

    return NextResponse.json(onboarding);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
