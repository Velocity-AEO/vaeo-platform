import { NextResponse } from 'next/server';

// ── Inline badge generation (avoid Next.js bundler import issues) ────────────

interface VelocityBadge {
  site_id:          string;
  domain:           string;
  verified_at:      string;
  badge_version:    string;
  embed_snippet:    string;
  verification_url: string;
  schema_jsonld:    string;
}

function generateBadge(site_id: string, domain: string): VelocityBadge {
  const verificationUrl = `https://vaeo.app/verified/${site_id}`;
  const embedSnippet = [
    `<a href="${verificationUrl}" target="_blank" rel="noopener" title="Verified by Velocity AEO">`,
    `  <img src="https://vaeo.app/badge/verified.svg" alt="Velocity AEO Verified" width="120" height="40" />`,
    `</a>`,
  ].join('\n');

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'url': `https://${domain}`,
    'potentialAction': {
      '@type': 'SearchAction',
      'name': 'Verified by Velocity AEO',
      'target': verificationUrl,
    },
  }, null, 2);

  return {
    site_id,
    domain,
    verified_at: new Date().toISOString(),
    badge_version: '1.0.0',
    embed_snippet: embedSnippet,
    verification_url: verificationUrl,
    schema_jsonld: schema,
  };
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;

    if (!siteId) {
      return NextResponse.json(
        { error: 'Missing siteId' },
        { status: 400 },
      );
    }

    // In production, verify site exists in Supabase
    // For now, generate badge for any valid siteId
    const domain = `${siteId}.myshopify.com`;
    const badge = generateBadge(siteId, domain);

    return NextResponse.json(badge, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to generate badge' },
      { status: 500 },
    );
  }
}
