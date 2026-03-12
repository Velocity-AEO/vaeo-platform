import { NextResponse } from 'next/server';

// ── Inline types ──────────────────────────────────────────────────────────────

interface GSCAccountPool {
  accounts: Array<{
    account_id:     string;
    email:          string;
    property_count: number;
    max_properties: number;
  }>;
  total_used:     number;
  total_capacity: number;
}

function buildStubPool(): GSCAccountPool {
  return {
    accounts: [
      { account_id: 'acc_1', email: 'gsc1@vaeo.io', property_count: 12, max_properties: 25 },
      { account_id: 'acc_2', email: 'gsc2@vaeo.io', property_count: 8, max_properties: 25 },
      { account_id: 'acc_3', email: 'gsc3@vaeo.io', property_count: 3, max_properties: 25 },
    ],
    total_used: 23,
    total_capacity: 75,
  };
}

// ── GET /api/admin/gsc/pool ───────────────────────────────────────────────────

export async function GET() {
  try {
    // TODO: check admin session
    const pool = buildStubPool();
    return NextResponse.json(pool, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { accounts: [], total_used: 0, total_capacity: 0 },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
