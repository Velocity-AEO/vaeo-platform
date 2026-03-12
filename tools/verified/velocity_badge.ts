/**
 * tools/verified/velocity_badge.ts
 *
 * Generates a Velocity Verified Badge and schema for verified sites.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VelocityBadge {
  site_id:          string;
  domain:           string;
  verified_at:      string;
  badge_version:    string;
  embed_snippet:    string;
  verification_url: string;
}

// ── generateBadge ─────────────────────────────────────────────────────────────

export function generateBadge(site_id: string, domain: string): VelocityBadge {
  try {
    const verificationUrl = `https://vaeo.app/verified/${site_id}`;
    const embedSnippet = [
      `<a href="${verificationUrl}" target="_blank" rel="noopener" title="Verified by Velocity AEO">`,
      `  <img src="https://vaeo.app/badge/verified.svg" alt="Velocity AEO Verified" width="120" height="40" />`,
      `</a>`,
    ].join('\n');

    return {
      site_id,
      domain,
      verified_at: new Date().toISOString(),
      badge_version: '1.0.0',
      embed_snippet: embedSnippet,
      verification_url: verificationUrl,
    };
  } catch {
    return {
      site_id: site_id ?? '',
      domain: domain ?? '',
      verified_at: new Date().toISOString(),
      badge_version: '1.0.0',
      embed_snippet: '',
      verification_url: '',
    };
  }
}

// ── generateVerifiedSchema ────────────────────────────────────────────────────

export function generateVerifiedSchema(badge: VelocityBadge): string {
  try {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'url': badge.domain.startsWith('http') ? badge.domain : `https://${badge.domain}`,
      'potentialAction': {
        '@type': 'SearchAction',
        'name': 'Verified by Velocity AEO',
        'target': badge.verification_url,
      },
    };
    return JSON.stringify(schema, null, 2);
  } catch {
    return '{}';
  }
}
