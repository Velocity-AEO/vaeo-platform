import { NextResponse } from 'next/server';
import { simulateFingerprints } from '../../../../../../../tools/copyright/fingerprint.js';
import { simulateScrapeMatches } from '../../../../../../../tools/copyright/scrape_detector.js';
import { simulateCopyrightReport } from '../../../../../../../tools/copyright/copyright_report.js';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const domain = `${siteId}.myshopify.com`;

  const fingerprints = simulateFingerprints(siteId, domain, 10);
  const scrapeMatches = simulateScrapeMatches(siteId, domain, 12);
  const report = simulateCopyrightReport(siteId, domain);

  return NextResponse.json({
    report,
    fingerprints,
    scrapeMatches,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
