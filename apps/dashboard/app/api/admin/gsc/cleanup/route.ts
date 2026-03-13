/**
 * apps/dashboard/app/api/admin/gsc/cleanup/route.ts
 *
 * POST /api/admin/gsc/cleanup — trigger GSC tag cleanup manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { runTagCleanupJob } from '../../../../../../tools/gsc/gsc_tag_cleanup.js';

export async function POST(
  _req: NextRequest,
) {
  try {
    const result = await runTagCleanupJob();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
