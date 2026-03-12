import { NextResponse } from 'next/server';

// ── Inline types (avoid Next.js bundler import issues) ───────────────────────

interface ViewportQARecord {
  fix_id:           string;
  site_id:          string;
  url:              string;
  passed:           boolean;
  failed_viewports: string[];
  checked_at:       string;
  screenshots:      Record<string, string>;
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fixId: string }> },
) {
  try {
    const { fixId } = await params;
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') ?? '';

    if (!fixId) {
      return NextResponse.json(
        { error: 'Missing fixId' },
        { status: 400 },
      );
    }

    // In production, load from Supabase:
    // const { data } = await supabase
    //   .from('viewport_qa_records')
    //   .select('*')
    //   .eq('fix_id', fixId)
    //   .eq('site_id', siteId)
    //   .maybeSingle();

    // For now, return "not yet run" stub
    const data: ViewportQARecord | null = null;

    if (data) {
      return NextResponse.json({
        fix_id: fixId,
        site_id: siteId,
        qa_run: true,
        passed: data.passed,
        failed_viewports: data.failed_viewports,
        checked_at: data.checked_at,
        screenshots: data.screenshots,
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json({
      fix_id: fixId,
      site_id: siteId,
      qa_run: false,
      message: 'QA not yet run',
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to load QA status' },
      { status: 500 },
    );
  }
}
