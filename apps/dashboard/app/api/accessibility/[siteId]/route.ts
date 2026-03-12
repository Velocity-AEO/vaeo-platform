import { NextResponse } from 'next/server';
import { buildAccessibilitySiteReport } from '../../../../../../../tools/reports/accessibility_report.js';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;

  // Mock sample pages for the accessibility report
  const samplePages = [
    {
      url: `https://${siteId}/`,
      html: '<html><body><img src="/hero.jpg"><h1>Home</h1><h3>Welcome</h3><button><svg class="icon"></svg></button><a href="/cart"><svg class="cart-icon"></svg></a><input type="text" name="search"></body></html>',
    },
    {
      url: `https://${siteId}/about`,
      html: '<html lang="en"><body><img src="/team.jpg" alt="Team photo"><h1>About</h1><h2>Our Story</h2><button>Learn More</button></body></html>',
    },
    {
      url: `https://${siteId}/contact`,
      html: '<html><body><img src="/map.jpg"><img src="/spacer.gif" alt=""><h1>Contact</h1><h2>Get in Touch</h2><label for="email">Email</label><input type="text" id="email" name="email"><input type="text" name="phone"></body></html>',
    },
  ];

  const report = buildAccessibilitySiteReport(siteId, samplePages);

  return NextResponse.json(report, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
