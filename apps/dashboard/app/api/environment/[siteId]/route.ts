import { NextResponse } from 'next/server';
import { scanEnvironment } from '../../../../../../../tools/apps/environment_scanner.js';
import { buildEnvironmentDiffReport } from '../../../../../../../tools/apps/environment_diff_report.js';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;

  // Mock HTML with known app signatures for demo
  const mockHtml = `
    <html>
    <head>
      <script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>
      <script src="https://widget.intercom.io/widget/abc123"></script>
      <script src="https://cdn.hextom.com/free-shipping-bar/v2.js"></script>
      <script src="https://instafeed.net/js/instafeed.min.js"></script>
    </head>
    <body>
      <div id="intercom-container"></div>
      <div class="hextom-fsb"></div>
      <div class="klaviyo-form"></div>
    </body>
    </html>
  `;

  const scan = scanEnvironment(siteId, `https://${siteId}/`, mockHtml);
  const report = buildEnvironmentDiffReport(scan);

  return NextResponse.json(report, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
