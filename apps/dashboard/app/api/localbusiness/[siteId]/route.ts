/**
 * GET /api/localbusiness/[siteId]
 *   Returns LocalBusinessSiteReport for a given site.
 *   Uses mock sample pages representative of local business pages.
 *   Cache-Control: max-age=300
 */

import { NextResponse } from 'next/server';
import {
  buildLocalBusinessSiteReport,
  type LocalBusinessSiteReport,
} from '@tools/reports/localbusiness_report.js';

// ── Sample pages (representative local business HTML) ─────────────────────────

const SAMPLE_PAGES = [
  {
    url:  'https://example.com/',
    html: `<html><head>
<title>Best Auto Dealer | Example City</title>
<meta property="og:site_name" content="Best Auto Dealer"/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"AutoDealer","name":"Best Auto Dealer","telephone":"(555) 100-2000","address":{"@type":"PostalAddress","streetAddress":"100 Auto Drive","addressLocality":"Example City","addressRegion":"TX","postalCode":"75000","addressCountry":"US"},"openingHours":["Mo-Fr 09:00-18:00","Sa 10:00-16:00"],"geo":{"@type":"GeoCoordinates","latitude":"32.78","longitude":"-96.80"},"priceRange":"$$","sameAs":["https://www.yelp.com/biz/best-auto-dealer","https://www.facebook.com/bestauto"]}</script>
</head><body><h1>Welcome to Best Auto Dealer</h1><p>Call us at (555) 100-2000</p></body></html>`,
  },
  {
    url:  'https://example.com/contact',
    html: `<html><head><title>Contact Us</title></head>
<body>
<h2>Find Us</h2>
<address>200 Main Street, Example City, TX 75001</address>
<p>Phone: (555) 200-3000</p>
<p>Business Hours: Monday–Friday 9am–6pm, Saturday 10am–4pm</p>
</body></html>`,
  },
  {
    url:  'https://example.com/about',
    html: `<html><head>
<title>About Our Dealership</title>
<meta name="description" content="Family-owned auto dealer serving Example City since 1995."/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"AutoDealer","name":"Best Auto Dealer","telephone":"(555) 100-2000","address":{"@type":"PostalAddress","streetAddress":"100 Auto Drive","addressLocality":"Example City","addressRegion":"TX","postalCode":"75000"}}</script>
</head><body><p>Call (555) 100-2000 today.</p><p>Hours of Operation: Mon–Fri 9am–6pm</p></body></html>`,
  },
];

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  try {
    const report: LocalBusinessSiteReport = buildLocalBusinessSiteReport(
      params.siteId,
      SAMPLE_PAGES,
    );

    return NextResponse.json(report, {
      status:  200,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
