import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  logAppReplacement,
  getAppReplacements,
  getReplacementSummary,
  type AppReplacementDeps,
} from '@tools/apps/app_replacement_library.js';

function buildDeps(): AppReplacementDeps {
  const db = createServerClient();
  return {
    insert: async (table, row) => {
      const { data, error } = await db.from(table).insert(row).select('id').maybeSingle();
      if (error) return null;
      return data as { id: string } | null;
    },
    query: async (table, filters) => {
      let q = db.from(table).select('*');
      for (const [key, val] of Object.entries(filters)) {
        q = q.eq(key, val);
      }
      const { data } = await q.order('removed_at', { ascending: false });
      return (data ?? []) as Record<string, unknown>[];
    },
  };
}

/**
 * GET /api/apps/replacements?site_id=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const siteId = req.nextUrl.searchParams.get('site_id');
    if (!siteId) {
      return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
    }

    const deps = buildDeps();
    const [replacements, summary] = await Promise.all([
      getAppReplacements(siteId, deps),
      getReplacementSummary(siteId, deps),
    ]);

    return NextResponse.json({ replacements, summary }, {
      status: 200,
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * POST /api/apps/replacements
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    if (!body.site_id || !body.tenant_id || !body.app_name || !body.app_category) {
      return NextResponse.json(
        { error: 'site_id, tenant_id, app_name, and app_category are required' },
        { status: 400 },
      );
    }

    const result = await logAppReplacement(
      {
        site_id:             body.site_id as string,
        tenant_id:           body.tenant_id as string,
        app_name:            body.app_name as string,
        app_category:        body.app_category as string as any,
        removed_at:          (body.removed_at as string) ?? new Date().toISOString(),
        replacement:         body.replacement as string | undefined,
        replacement_type:    (body.replacement_type as string as any) ?? 'vaeo_native',
        health_score_before: body.health_score_before as number | undefined,
        health_score_after:  body.health_score_after as number | undefined,
        lcp_before:          body.lcp_before as number | undefined,
        lcp_after:           body.lcp_after as number | undefined,
        notes:               body.notes as string | undefined,
      },
      buildDeps(),
    );

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: 'Failed to log replacement' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
