import { NextResponse } from 'next/server';

// ── GET handler (stub — real data wiring is Sprint P) ────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;

    return NextResponse.json({
      site_id: siteId,
      total_fixes_with_qa: 0,
      passed: 0,
      failed: 0,
      pass_rate: 0,
      most_failed_viewport: null,
      last_qa_at: null,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to load QA summary' },
      { status: 500 },
    );
  }
}
