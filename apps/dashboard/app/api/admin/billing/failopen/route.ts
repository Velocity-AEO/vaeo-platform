/**
 * apps/dashboard/app/api/admin/billing/failopen/route.ts
 *
 * GET  /api/admin/billing/failopen — list unreconciled fail-open entries
 * POST /api/admin/billing/failopen — mark entry as reconciled
 */

import { NextRequest, NextResponse } from 'next/server';

interface FailOpenLogDeps {
  loadUnreconciledFn?: () => Promise<any[]>;
  reconcileFn?:        (log_id: string) => Promise<any>;
}

const defaultDeps: FailOpenLogDeps = {
  loadUnreconciledFn: async () => [],
  reconcileFn:        async () => null,
};

export async function GET(
  _req: NextRequest,
) {
  try {
    const load = defaultDeps.loadUnreconciledFn!;
    const entries = await load();
    return NextResponse.json(entries, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
) {
  try {
    const body = await req.json();
    const log_id = body?.log_id;
    if (!log_id) {
      return NextResponse.json({ error: 'Missing log_id' }, { status: 400 });
    }

    const reconcile = defaultDeps.reconcileFn!;
    const updated = await reconcile(log_id);
    if (!updated) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
