/**
 * GET /api/digest/preview?tenant_id=<id>
 *   Returns TenantDigestData for the last 7 days without sending.
 *   Useful for previewing what the digest will contain.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { buildTenantDigest, type DigestPeriod } from '@tools/email/digest_aggregator.js';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenant_id = searchParams.get('tenant_id')?.trim() ?? '';

    if (!tenant_id) {
      return NextResponse.json({ error: 'tenant_id query param is required' }, { status: 400 });
    }

    const now  = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const period: DigestPeriod = { from, to: now.toISOString(), days: 7 };

    const db   = createServerClient();
    const data = await buildTenantDigest(tenant_id, period, db);

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
