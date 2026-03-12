/**
 * apps/dashboard/app/api/fixes/[fixId]/screenshots/route.ts
 *
 * GET handler for fetching before/after viewport screenshots for a fix.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildStripItems } from '@/lib/screenshot_strip_logic';

// ── Deps (injectable for testing) ────────────────────────────────────────────

interface ScreenshotRouteDeps {
  loadCapturePair?: (fix_id: string, site_id: string) => Promise<any | null>;
  getScreenshotUrl?: (key: string) => string | null;
}

const defaultLoadCapturePair = async (
  _fix_id: string,
  _site_id: string,
): Promise<any | null> => {
  // In production this would load from Supabase storage / DB.
  // Returns null (not found) by default until wired to real storage.
  return null;
};

const defaultGetScreenshotUrl = (key: string): string | null => {
  // In production this would return a signed Supabase storage URL.
  if (!key) return null;
  return `/storage/screenshots/${key}`;
};

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { fixId: string } },
) {
  try {
    const fix_id = params.fixId;
    const site_id = request.nextUrl.searchParams.get('siteId') ?? '';

    if (!fix_id || !site_id) {
      return NextResponse.json(
        { error: 'fix_id and siteId are required' },
        { status: 400 },
      );
    }

    const deps: ScreenshotRouteDeps = (request as any).__deps ?? {};
    const loadPair = deps.loadCapturePair ?? defaultLoadCapturePair;
    const getUrl = deps.getScreenshotUrl ?? defaultGetScreenshotUrl;

    const pair = await loadPair(fix_id, site_id);

    if (!pair) {
      return NextResponse.json(
        { error: 'No screenshots found for this fix' },
        { status: 404 },
      );
    }

    const items = buildStripItems(pair, getUrl);
    const all_clean = items.length > 0 && items.every((i) => i.clean);

    const body = {
      fix_id,
      url: pair.url ?? '',
      viewports: items.map((i) => ({
        name: i.name,
        width: i.width,
        before_url: i.before_url,
        after_url: i.after_url,
        clean: i.clean,
      })),
      all_clean,
    };

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
