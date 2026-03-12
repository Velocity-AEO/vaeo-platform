/**
 * POST /api/digest
 *   Body: { tenant_id: string; force?: boolean }
 *   Triggers digest send for the given tenant.
 *   force=true bypasses schedule check.
 *   Returns: DigestSendResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendDigestForTenant } from '../../../../../tools/email/digest_sender.js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const tenant_id = typeof body['tenant_id'] === 'string' ? body['tenant_id'].trim() : '';

    if (!tenant_id) {
      return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    const db = createServerClient();
    const result = await sendDigestForTenant(tenant_id, db);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
