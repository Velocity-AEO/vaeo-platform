/**
 * tools/notifications/digest_email_template.ts
 *
 * HTML digest email template for agency-quality forwarding.
 * Inline CSS only for email client compatibility.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface DigestLinkGraphHealth {
  total_pages:                number;
  orphaned_count:             number;
  dead_end_count:             number;
  sitemap_discrepancy_count:  number;
  velocity_alerts?: Array<{
    url:     string;
    change:  number;
    gaining: boolean;
  }>;
  opportunities?: Array<{
    priority:   string;
    source_url: string;
    dest_url:   string;
  }>;
  broken_external?: Array<{
    source_url:  string;
    dest_url:    string;
    status_code: number | null;
  }>;
  canonical_conflicts?: {
    high_impact_count: number;
  };
  site_id: string;
}

export interface DigestEmailData {
  site_domain:          string;
  period_label:         string;
  health_score:         number | null;
  health_score_change:  number | null;
  fixes_applied:        number;
  fixes_failed:         number;
  open_issues:          number;
  top_fixes:            Array<{
    issue_type:    string;
    url:           string;
    applied_at:    string;
    impact_label:  string;
  }>;
  biggest_ranking_gain: { keyword: string; change: number } | null;
  gsc_connected:        boolean;
  agency_name:          string | null;
  white_label_color:    string | null;
  unsubscribe_url:      string;
  dashboard_url:        string;
  link_graph_health?:   DigestLinkGraphHealth;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function brandName(data: DigestEmailData): string {
  return data.agency_name || 'VAEO';
}

function primaryColor(data: DigestEmailData): string {
  return data.white_label_color || '#6366f1';
}

function truncateUrl(url: string, max: number = 40): string {
  try {
    if (!url) return '';
    return url.length > max ? url.slice(0, max) + '…' : url;
  } catch {
    return '';
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  return '#dc2626';
}

function escapeHtml(text: string): string {
  try {
    return (text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  } catch {
    return '';
  }
}

// ── buildDigestSubjectLine ───────────────────────────────────────────────────

export function buildDigestSubjectLine(data: DigestEmailData): string {
  try {
    const brand = brandName(data);
    const domain = data.site_domain || 'your site';

    if (data.fixes_applied > 0 && data.health_score_change != null && data.health_score_change > 0) {
      return `${brand} fixed ${data.fixes_applied} issues on ${domain} — score up ${data.health_score_change} points`;
    }
    if (data.fixes_applied > 0) {
      return `${brand} fixed ${data.fixes_applied} SEO issues on ${domain}`;
    }
    if (data.open_issues > 0) {
      return `${data.open_issues} SEO issues found on ${domain} — review needed`;
    }
    return `Your weekly SEO report for ${domain}`;
  } catch {
    return 'Your weekly SEO report';
  }
}

// ── buildDigestEmailHTML ─────────────────────────────────────────────────────

export function buildDigestEmailHTML(data: DigestEmailData): string {
  try {
    const brand = escapeHtml(brandName(data));
    const color = primaryColor(data);
    const domain = escapeHtml(data.site_domain || 'your site');
    const period = escapeHtml(data.period_label || 'Weekly');

    const parts: string[] = [];

    // Doctype + wrapper
    parts.push(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">`);

    // Header bar
    parts.push(`<tr><td style="background:${color};padding:20px 32px;">
<span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${brand}</span>
<span style="color:rgba(255,255,255,0.8);font-size:12px;display:block;margin-top:2px;">SEO Autopilot</span>
</td></tr>`);

    // Hero section
    parts.push(`<tr><td style="padding:28px 32px 16px;">
<h1 style="margin:0;font-size:22px;color:#1e293b;font-weight:700;">${domain}</h1>
<p style="margin:4px 0 0;font-size:14px;color:#64748b;">${period} SEO Report</p>
</td></tr>`);

    // Score card
    if (data.health_score != null) {
      const sc = scoreColor(data.health_score);
      let changeHtml = '';
      if (data.health_score_change != null && data.health_score_change !== 0) {
        if (data.health_score_change > 0) {
          changeHtml = `<span style="color:#16a34a;font-size:14px;font-weight:600;">&uarr; +${data.health_score_change} points this week</span>`;
        } else {
          changeHtml = `<span style="color:#dc2626;font-size:14px;font-weight:600;">&darr; ${data.health_score_change} points this week</span>`;
        }
      }
      parts.push(`<tr><td style="padding:0 32px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;">
<tr><td style="padding:20px 24px;text-align:center;">
<span style="font-size:48px;font-weight:800;color:${sc};line-height:1;">${data.health_score}</span>
<span style="font-size:14px;color:#64748b;display:block;margin-top:4px;">Health Score</span>
${changeHtml ? `<div style="margin-top:8px;">${changeHtml}</div>` : ''}
</td></tr></table>
</td></tr>`);
    }

    // Fixes summary row
    const pillStyle = (bg: string, text: string) =>
      `display:inline-block;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;background:${bg};color:${text};margin-right:8px;`;

    let pillsHtml = `<span style="${pillStyle('#dcfce7', '#166534')}">${data.fixes_applied} Fixed</span>`;
    pillsHtml += `<span style="${pillStyle('#fef9c3', '#854d0e')}">${data.open_issues} Open</span>`;
    if (data.fixes_failed > 0) {
      pillsHtml += `<span style="${pillStyle('#fee2e2', '#991b1b')}">${data.fixes_failed} Failed</span>`;
    }

    parts.push(`<tr><td style="padding:0 32px 24px;">${pillsHtml}</td></tr>`);

    // Top fixes section
    const topFixes = (data.top_fixes ?? []).slice(0, 5);
    if (data.fixes_applied > 0 && topFixes.length > 0) {
      parts.push(`<tr><td style="padding:0 32px 20px;">
<h2 style="margin:0 0 12px;font-size:15px;color:#1e293b;font-weight:600;">What we fixed</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">`);

      topFixes.forEach((fix, i) => {
        const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        parts.push(`<tr style="background:${rowBg};">
<td style="padding:10px 14px;font-size:13px;color:#334155;font-weight:500;">${escapeHtml(fix.issue_type)}</td>
<td style="padding:10px 14px;font-size:12px;color:#64748b;font-family:monospace;">${escapeHtml(truncateUrl(fix.url))}</td>
<td style="padding:10px 14px;font-size:12px;color:#64748b;text-align:right;">${escapeHtml(fix.impact_label)}</td>
</tr>`);
      });

      parts.push(`</table></td></tr>`);
    }

    // Ranking gain callout
    if (data.biggest_ranking_gain) {
      const keyword = escapeHtml(data.biggest_ranking_gain.keyword);
      const change = data.biggest_ranking_gain.change;
      parts.push(`<tr><td style="padding:0 32px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;">
<tr><td style="padding:16px 20px;font-size:14px;color:#1e40af;">
&#128273; <strong>${keyword}</strong> moved up ${change} position${change === 1 ? '' : 's'} this week
</td></tr></table>
</td></tr>`);
    }

    // Link graph health section
    const lg = data.link_graph_health;
    if (lg && (lg.total_pages > 0 || lg.orphaned_count > 0)) {
      const linksUrl = escapeHtml(`${data.dashboard_url || '#'}/links`.replace('/undefined/', '/'));
      parts.push(`<tr><td style="padding:0 32px 20px;">
<h2 style="margin:0 0 12px;font-size:15px;color:#1e293b;font-weight:600;">Link Graph Health</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 6px;font-size:13px;color:#334155;">&#128440; ${lg.total_pages} pages mapped</p>
<p style="margin:0 0 6px;font-size:13px;color:${lg.orphaned_count > 0 ? '#dc2626' : '#64748b'};">${lg.orphaned_count > 0 ? '&#9888;&#65039;' : '&#9989;'} ${lg.orphaned_count} orphaned</p>
<p style="margin:0 0 6px;font-size:13px;color:${lg.dead_end_count > 0 ? '#ea580c' : '#64748b'};">${lg.dead_end_count > 0 ? '&#9888;&#65039;' : '&#9989;'} ${lg.dead_end_count} dead ends</p>
<p style="margin:0;font-size:13px;color:${lg.sitemap_discrepancy_count > 0 ? '#ca8a04' : '#64748b'};">${lg.sitemap_discrepancy_count > 0 ? '&#9888;&#65039;' : '&#9989;'} ${lg.sitemap_discrepancy_count} sitemap gaps</p>
</td></tr></table>`);

      // Velocity block
      const velGaining = (lg.velocity_alerts ?? []).filter((v) => v.gaining).slice(0, 3);
      const velLosing  = (lg.velocity_alerts ?? []).filter((v) => !v.gaining).slice(0, 3);
      if (velGaining.length > 0 || velLosing.length > 0) {
        parts.push(`<h3 style="margin:12px 0 8px;font-size:13px;color:#475569;font-weight:600;">Link Authority Changes This Week</h3>`);
        for (const v of velGaining) {
          parts.push(`<p style="margin:0 0 4px;font-size:12px;color:#16a34a;">&uarr; ${escapeHtml(truncateUrl(v.url))} +${v.change} links</p>`);
        }
        for (const v of velLosing) {
          parts.push(`<p style="margin:0 0 4px;font-size:12px;color:#dc2626;">&darr; ${escapeHtml(truncateUrl(v.url))} ${v.change} links</p>`);
        }
      }

      // Opportunities block
      const topOpps = (lg.opportunities ?? []).slice(0, 3);
      if (topOpps.length > 0) {
        parts.push(`<h3 style="margin:12px 0 8px;font-size:13px;color:#475569;font-weight:600;">Top Link Opportunities</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;overflow:hidden;border:1px solid #e2e8f0;">`);
        topOpps.forEach((opp, i) => {
          const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
          parts.push(`<tr style="background:${rowBg};"><td style="padding:8px 12px;font-size:12px;color:#64748b;">${escapeHtml(opp.priority)}</td><td style="padding:8px 12px;font-size:11px;color:#94a3b8;font-family:monospace;">${escapeHtml(truncateUrl(opp.source_url))}</td><td style="padding:8px 12px;font-size:11px;color:#94a3b8;font-family:monospace;">${escapeHtml(truncateUrl(opp.dest_url))}</td></tr>`);
        });
        parts.push(`</table>`);
      }

      // Broken external block
      const brokenExt = (lg.broken_external ?? []).slice(0, 3);
      if (brokenExt.length > 0) {
        parts.push(`<p style="margin:12px 0 8px;font-size:13px;color:#dc2626;font-weight:600;">&#9888;&#65039; ${lg.broken_external?.length ?? brokenExt.length} broken external links detected</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;overflow:hidden;border:1px solid #fecaca;">`);
        brokenExt.forEach((b, i) => {
          const rowBg = i % 2 === 0 ? '#fff5f5' : '#ffffff';
          parts.push(`<tr style="background:${rowBg};"><td style="padding:8px 12px;font-size:11px;color:#94a3b8;font-family:monospace;">${escapeHtml(truncateUrl(b.source_url))}</td><td style="padding:8px 12px;font-size:11px;color:#dc2626;font-family:monospace;">${escapeHtml(truncateUrl(b.dest_url))}</td><td style="padding:8px 12px;font-size:11px;color:#dc2626;">${b.status_code ?? 'error'}</td></tr>`);
        });
        parts.push(`</table>`);
      }

      // Canonical conflicts block
      if ((lg.canonical_conflicts?.high_impact_count ?? 0) > 0) {
        parts.push(`<p style="margin:12px 0 0;font-size:13px;color:#dc2626;font-weight:600;">&#9888;&#65039; ${lg.canonical_conflicts!.high_impact_count} canonical conflicts detected</p>
<p style="margin:4px 0 0;font-size:12px;color:#64748b;">These links are sending equity to non-canonical URLs</p>`);
      }

      parts.push(`<p style="margin:12px 0 0;"><a href="${linksUrl}" style="font-size:13px;color:${color};text-decoration:none;font-weight:600;">View Full Link Graph &rarr;</a></p>
</td></tr>`);
    }

    // CTA button
    const dashUrl = escapeHtml(data.dashboard_url || '#');
    parts.push(`<tr><td style="padding:0 32px 28px;text-align:center;">
<a href="${dashUrl}" style="display:inline-block;padding:12px 32px;background:${color};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">View Full Report</a>
</td></tr>`);

    // Footer
    const unsubUrl = escapeHtml(data.unsubscribe_url || '#');
    parts.push(`<tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
<p style="margin:0;font-size:12px;color:#94a3b8;">Powered by ${brand}</p>
<p style="margin:6px 0 0;font-size:11px;color:#94a3b8;">You received this because you have SEO autopilot enabled for ${domain}.</p>
<p style="margin:6px 0 0;"><a href="${unsubUrl}" style="font-size:11px;color:#94a3b8;text-decoration:underline;">Unsubscribe</a></p>
</td></tr>`);

    // Close
    parts.push(`</table></td></tr></table></body></html>`);

    return parts.join('\n');
  } catch {
    return `<html><body><p>SEO report for ${data?.site_domain ?? 'your site'}</p></body></html>`;
  }
}

// ── buildDigestEmailText ─────────────────────────────────────────────────────

export function buildDigestEmailText(data: DigestEmailData): string {
  try {
    const brand = brandName(data);
    const domain = data.site_domain || 'your site';
    const period = data.period_label || 'Weekly';
    const lines: string[] = [];

    lines.push(`${brand} — SEO Autopilot`);
    lines.push(`${period} SEO Report for ${domain}`);
    lines.push('');

    if (data.health_score != null) {
      lines.push(`Health Score: ${data.health_score}/100`);
      if (data.health_score_change != null && data.health_score_change !== 0) {
        const dir = data.health_score_change > 0 ? '+' : '';
        lines.push(`Change: ${dir}${data.health_score_change} points this week`);
      }
      lines.push('');
    }

    lines.push(`Fixed: ${data.fixes_applied}`);
    lines.push(`Open issues: ${data.open_issues}`);
    if (data.fixes_failed > 0) {
      lines.push(`Failed: ${data.fixes_failed}`);
    }
    lines.push('');

    const topFixes = (data.top_fixes ?? []).slice(0, 5);
    if (topFixes.length > 0) {
      lines.push('What we fixed:');
      for (const fix of topFixes) {
        lines.push(`  - ${fix.issue_type}: ${truncateUrl(fix.url)} (${fix.impact_label})`);
      }
      lines.push('');
    }

    if (data.biggest_ranking_gain) {
      lines.push(`Ranking gain: "${data.biggest_ranking_gain.keyword}" moved up ${data.biggest_ranking_gain.change} positions`);
      lines.push('');
    }

    const lg = data.link_graph_health;
    if (lg && (lg.total_pages > 0 || lg.orphaned_count > 0)) {
      lines.push('Link Graph Health:');
      lines.push(`  ${lg.total_pages} pages mapped`);
      if (lg.orphaned_count > 0) lines.push(`  ${lg.orphaned_count} orphaned pages`);
      if (lg.dead_end_count > 0) lines.push(`  ${lg.dead_end_count} dead ends`);
      if (lg.sitemap_discrepancy_count > 0) lines.push(`  ${lg.sitemap_discrepancy_count} sitemap gaps`);
      const brokenExt = lg.broken_external ?? [];
      if (brokenExt.length > 0) lines.push(`  ${brokenExt.length} broken external links`);
      if ((lg.canonical_conflicts?.high_impact_count ?? 0) > 0) {
        lines.push(`  ${lg.canonical_conflicts!.high_impact_count} canonical conflicts`);
      }
      lines.push(`  View link graph: ${data.dashboard_url || ''}/links`);
      lines.push('');
    }

    lines.push(`View full report: ${data.dashboard_url || ''}`);
    lines.push('');
    lines.push(`Powered by ${brand}`);
    lines.push(`You received this because you have SEO autopilot enabled for ${domain}.`);
    lines.push(`Unsubscribe: ${data.unsubscribe_url || ''}`);

    return lines.join('\n');
  } catch {
    return `SEO report for ${data?.site_domain ?? 'your site'}`;
  }
}
