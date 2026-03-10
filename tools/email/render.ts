/**
 * tools/email/render.ts
 *
 * Renders a DigestReport into a plain, table-based HTML email string.
 * Mobile-responsive, dark-on-white, compatible with all major email clients
 * (no flex, no grid, no CSS variables).
 *
 * Also exports a subject line generator.
 */

import type { DigestReport } from './digest.js';

// ── Subject line ──────────────────────────────────────────────────────────────

export function digestSubject(report: DigestReport): string {
  if (report.health_after > report.health_before) {
    return `Your SEO score improved from ${report.grade_before} to ${report.grade_after} this week — Velocity AEO`;
  }
  if (report.health_after < report.health_before) {
    return `Your SEO score dropped from ${report.grade_before} to ${report.grade_after} this week — Velocity AEO`;
  }
  return `Your weekly SEO digest — Grade ${report.grade_after} — Velocity AEO`;
}

// ── HTML renderer ─────────────────────────────────────────────────────────────

export function renderDigestEmail(report: DigestReport): string {
  const scoreDelta  = report.health_after - report.health_before;
  const deltaSign   = scoreDelta > 0 ? '+' : '';
  const deltaColor  = scoreDelta > 0 ? '#16a34a' : scoreDelta < 0 ? '#dc2626' : '#6b7280';
  const gradeColor  = gradeToColor(report.grade_after);

  const dashboardUrl = `https://app.velocityaeo.com/sites/${report.site_id}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(digestSubject(report))}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:24px 16px;">

<!-- Inner card -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;max-width:600px;width:100%;">

<!-- Header -->
<tr>
<td style="padding:32px 32px 16px 32px;text-align:center;">
  <span style="font-size:14px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Weekly SEO Digest</span>
  <br>
  <span style="font-size:13px;color:#a1a1aa;">${esc(report.site_url)}</span>
</td>
</tr>

<!-- Score Hero -->
<tr>
<td style="padding:8px 32px 24px 32px;text-align:center;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="45%" style="text-align:center;vertical-align:middle;">
      <span style="font-size:48px;font-weight:700;color:#a1a1aa;">${report.grade_before}</span>
      <br>
      <span style="font-size:14px;color:#a1a1aa;">Last week</span>
      <br>
      <span style="font-size:13px;color:#a1a1aa;">${report.health_before}/100</span>
    </td>
    <td width="10%" style="text-align:center;vertical-align:middle;">
      <span style="font-size:24px;color:#a1a1aa;">&rarr;</span>
    </td>
    <td width="45%" style="text-align:center;vertical-align:middle;">
      <span style="font-size:48px;font-weight:700;color:${gradeColor};">${report.grade_after}</span>
      <br>
      <span style="font-size:14px;color:#18181b;">This week</span>
      <br>
      <span style="font-size:13px;color:${deltaColor};font-weight:600;">${report.health_after}/100 (${deltaSign}${scoreDelta})</span>
    </td>
  </tr>
  </table>
</td>
</tr>

<!-- Divider -->
<tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #e4e4e7;margin:0;"></td></tr>

<!-- Fixes Applied -->
<tr>
<td style="padding:24px 32px 8px 32px;">
  <span style="font-size:16px;font-weight:600;color:#18181b;">Fixes Applied This Week</span>
</td>
</tr>
<tr>
<td style="padding:0 32px 24px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:6px;">
  <tr style="background-color:#fafafa;">
    <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e4e4e7;">Metric</td>
    <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e4e4e7;text-align:right;">Count</td>
  </tr>
  <tr>
    <td style="padding:12px 16px;font-size:14px;color:#18181b;border-bottom:1px solid #f4f4f5;">Fixes deployed</td>
    <td style="padding:12px 16px;font-size:14px;color:#18181b;text-align:right;font-weight:600;border-bottom:1px solid #f4f4f5;">${report.fixes_applied}</td>
  </tr>
  <tr>
    <td style="padding:12px 16px;font-size:14px;color:#18181b;border-bottom:1px solid #f4f4f5;">Issues resolved</td>
    <td style="padding:12px 16px;font-size:14px;color:#18181b;text-align:right;font-weight:600;border-bottom:1px solid #f4f4f5;">${report.issues_resolved}</td>
  </tr>
  <tr>
    <td style="padding:12px 16px;font-size:14px;color:#18181b;">Issues remaining</td>
    <td style="padding:12px 16px;font-size:14px;color:${report.issues_remaining > 0 ? '#dc2626' : '#16a34a'};text-align:right;font-weight:600;">${report.issues_remaining}</td>
  </tr>
  </table>
</td>
</tr>

<!-- Top Win -->
<tr>
<td style="padding:0 32px 8px 32px;">
  <span style="font-size:16px;font-weight:600;color:#18181b;">Top Win</span>
</td>
</tr>
<tr>
<td style="padding:0 32px 24px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;">
  <tr>
    <td style="padding:16px;font-size:14px;color:#166534;">
      ${esc(report.top_win)}
    </td>
  </tr>
  </table>
</td>
</tr>

<!-- What's Next -->
<tr>
<td style="padding:0 32px 8px 32px;">
  <span style="font-size:16px;font-weight:600;color:#18181b;">What&rsquo;s Next</span>
</td>
</tr>
<tr>
<td style="padding:0 32px 24px 32px;">
  <span style="font-size:14px;color:#52525b;">
    ${report.issues_remaining > 0
      ? `You have <strong>${report.issues_remaining}</strong> remaining issue${report.issues_remaining === 1 ? '' : 's'} to address. Review and approve fixes in your dashboard.`
      : 'All clear! No outstanding SEO issues detected.'}
  </span>
</td>
</tr>

<!-- CTA Button -->
<tr>
<td style="padding:0 32px 32px 32px;text-align:center;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
  <tr>
    <td style="border-radius:6px;background-color:#2563eb;">
      <a href="${esc(dashboardUrl)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
        View full report
      </a>
    </td>
  </tr>
  </table>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:16px 32px 24px 32px;text-align:center;border-top:1px solid #e4e4e7;">
  <span style="font-size:12px;color:#a1a1aa;">
    Sent by <a href="https://velocityaeo.com" style="color:#a1a1aa;">Velocity AEO</a>
    &middot; You received this because you have an active site on Velocity AEO.
  </span>
</td>
</tr>

</table>
<!-- /Inner card -->

</td></tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function gradeToColor(grade: string): string {
  switch (grade) {
    case 'A': return '#16a34a';
    case 'B': return '#2563eb';
    case 'C': return '#ca8a04';
    case 'D': return '#ea580c';
    default:  return '#dc2626';
  }
}
