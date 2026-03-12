import { NextRequest, NextResponse } from 'next/server';
import { runQASuite, runQAForSite } from '@/../tools/qa/qa_runner';

export async function GET() {
  const report = await runQASuite();
  return NextResponse.json(report, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const site_id = body?.site_id as string | undefined;
    const report = site_id
      ? await runQAForSite(site_id)
      : await runQASuite();
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    const report = await runQASuite();
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
