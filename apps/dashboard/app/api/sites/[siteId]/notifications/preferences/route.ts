/**
 * apps/dashboard/app/api/sites/[siteId]/notifications/preferences/route.ts
 *
 * GET + PATCH for notification preferences per site.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  buildDefaultPreferences,
  mergePreferences,
  type NotificationPreferences,
} from '@tools/notifications/notification_preferences';

// ── Deps ─────────────────────────────────────────────────────────────────────

interface PrefsRouteDeps {
  loadPrefsFn?: (site_id: string, user_id: string) => Promise<NotificationPreferences | null>;
  savePrefsFn?: (prefs: NotificationPreferences) => Promise<void>;
  getUserId?:   () => string | null;
}

const defaultLoadPrefs = async (
  _site_id: string,
  _user_id: string,
): Promise<NotificationPreferences | null> => null;

const defaultSavePrefs = async (_prefs: NotificationPreferences): Promise<void> => {};

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { siteId: string } },
) {
  try {
    const site_id = params.siteId;
    const deps: PrefsRouteDeps = (request as any).__deps ?? {};
    const getUserId = deps.getUserId ?? (() => 'anonymous');
    const user_id = getUserId() ?? 'anonymous';
    const loadPrefs = deps.loadPrefsFn ?? defaultLoadPrefs;

    const existing = await loadPrefs(site_id, user_id);
    const prefs = existing ?? buildDefaultPreferences(site_id, user_id);

    return NextResponse.json(prefs, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { siteId: string } },
) {
  try {
    const site_id = params.siteId;
    const deps: PrefsRouteDeps = (request as any).__deps ?? {};
    const getUserId = deps.getUserId ?? (() => 'anonymous');
    const user_id = getUserId() ?? 'anonymous';
    const loadPrefs = deps.loadPrefsFn ?? defaultLoadPrefs;
    const savePrefs = deps.savePrefsFn ?? defaultSavePrefs;

    const body = await request.json() as Partial<NotificationPreferences>;
    const existing = await loadPrefs(site_id, user_id);
    const base = existing ?? buildDefaultPreferences(site_id, user_id);
    const updated = mergePreferences(base, body);

    await savePrefs(updated);

    return NextResponse.json(updated, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
