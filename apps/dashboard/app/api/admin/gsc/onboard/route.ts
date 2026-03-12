import { NextResponse } from 'next/server';

// ── Inline types ──────────────────────────────────────────────────────────────

interface GSCOnboardingResult {
  site_id:  string;
  domain:   string;
  success:  boolean;
  message:  string;
}

// ── POST /api/admin/gsc/onboard ───────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // TODO: check admin session — return 403 if not admin
    const body = await request.json();
    const { site_id, domain, platform } = body ?? {};

    if (!site_id || !domain) {
      return NextResponse.json(
        { error: 'site_id and domain are required' },
        { status: 400 },
      );
    }

    // Stub: simulate successful onboarding
    const result: GSCOnboardingResult = {
      site_id,
      domain,
      success: true,
      message: `GSC onboarding triggered for ${domain} (${platform ?? 'unknown'})`,
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to trigger GSC onboarding' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
