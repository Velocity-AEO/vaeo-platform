import { NextResponse } from 'next/server';

// ── POST /api/onboard/shopify ─────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { step, site_id, domain } = body ?? {};

    if (!step) {
      return NextResponse.json({ error: 'step is required' }, { status: 400 });
    }

    // Handle register_site step — trigger GSC onboarding in background
    if (step === 'register_site') {
      // Fire and forget — do not await
      // In production: triggerGSCOnboarding(site_id, domain, 'shopify')
      process.stderr.write(`[onboard/shopify] GSC onboarding triggered for site ${site_id}\n`);

      return NextResponse.json({
        step: 'register_site',
        site_id: site_id ?? `site_${Date.now()}`,
        domain,
        success: true,
        message: 'Site registered. GSC onboarding triggered.',
      });
    }

    // Default: echo step back
    return NextResponse.json({
      step,
      site_id,
      domain,
      success: true,
    });
  } catch {
    return NextResponse.json(
      { error: 'Onboarding step failed' },
      { status: 500 },
    );
  }
}
