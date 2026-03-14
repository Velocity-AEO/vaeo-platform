/**
 * GET /api/sites/[siteId]/onboarding/progress
 *
 * Returns the onboarding progress for a site.
 * Used by OnboardingProgressTracker for auto-refresh polling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadOnboardingProgress } from '@tools/onboarding/onboarding_progress.js';

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { siteId } = await context.params;

    if (!siteId) {
      return NextResponse.json({ error: 'missing site_id' }, { status: 400 });
    }

    const platform = request.nextUrl.searchParams.get('platform') === 'wordpress'
      ? 'wordpress' as const
      : 'shopify' as const;

    const progress = await loadOnboardingProgress(siteId, platform);

    return NextResponse.json(progress, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'failed to load onboarding progress' }, { status: 500 });
  }
}
