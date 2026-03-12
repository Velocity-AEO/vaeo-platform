import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  try {
    const { siteId } = await params;

    if (!siteId) {
      return NextResponse.json({ connected: false, site_id: '', error: 'Missing site_id' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: site } = await supabase
      .from('sites')
      .select('extra_data')
      .eq('id', siteId)
      .single();

    if (!site) {
      return NextResponse.json({ connected: false, site_id: siteId });
    }

    const extraData = site.extra_data as Record<string, unknown> | null;
    const gscToken  = extraData?.gsc_token as { expires_at?: string; created_at?: string } | undefined;

    if (!gscToken?.expires_at) {
      return NextResponse.json({ connected: false, site_id: siteId });
    }

    // Check if token is still valid (with 5-minute buffer)
    const expiresAt = new Date(gscToken.expires_at).getTime();
    const buffer    = 5 * 60 * 1000;
    const connected = Date.now() < expiresAt - buffer;

    return NextResponse.json({
      connected,
      site_id:       siteId,
      last_connected: gscToken.created_at ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  }
}
