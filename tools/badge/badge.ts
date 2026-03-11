/**
 * tools/badge/badge.ts
 *
 * Velocity Verified badge system — pure logic, no I/O, fully injectable.
 *
 * Badge states:
 *   verified   — health_score >= 80, no critical issues, run within 7 days
 *   monitoring — health_score >= 55, run within 14 days (but not verified)
 *   at_risk    — health_score < 55 OR run older than 14 days
 *   inactive   — no runs ever
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type BadgeState = 'verified' | 'monitoring' | 'at_risk' | 'inactive';

export interface BadgeSnapshot {
  health_score: number;
  /** Count of open issues classified as critical. */
  critical_issues: number;
  /** ISO 8601 timestamp of the most recent run. */
  last_run_at: string;
}

export interface BadgeDeps {
  /** Returns null if the site has never been scanned (→ inactive). */
  getLatestSnapshot(siteId: string): Promise<BadgeSnapshot | null>;
}

// ── Badge state ───────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getBadgeState(
  siteId: string,
  deps: BadgeDeps,
): Promise<BadgeState> {
  const snap = await deps.getLatestSnapshot(siteId);

  if (!snap) return 'inactive';

  const ageDays = (Date.now() - new Date(snap.last_run_at).getTime()) / DAY_MS;

  if (snap.health_score >= 80 && snap.critical_issues === 0 && ageDays <= 7) {
    return 'verified';
  }

  if (snap.health_score < 55 || ageDays > 14) {
    return 'at_risk';
  }

  return 'monitoring';
}

// ── SVG generation ────────────────────────────────────────────────────────────

interface BadgeConfig {
  label: string;
  bg: string;
  /** SVG elements placed inside the icon zone (x: 0–26, cy: 10). */
  iconSvg: string;
  /** Total badge width in px. */
  w: number;
}

const BADGE_CONFIGS: Record<BadgeState, BadgeConfig> = {
  verified: {
    label:   'Velocity Verified',
    bg:      '#2da44e',
    iconSvg: '<polyline points="7,10 11,14 17,7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    w:       162,
  },
  monitoring: {
    label:   'SEO Monitored',
    bg:      '#0969da',
    iconSvg: '<circle cx="12" cy="10" r="4.5" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="10" r="1.8" fill="#fff"/>',
    w:       140,
  },
  at_risk: {
    label:   'Needs Attention',
    bg:      '#bf8700',
    iconSvg: '<polygon points="12,4 20,16 4,16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><rect x="11" y="7.5" width="2" height="4.5" fill="#fff" rx="0.5"/><rect x="11" y="13.5" width="2" height="2" fill="#fff" rx="0.5"/>',
    w:       148,
  },
  inactive: {
    label:   'Not Connected',
    bg:      '#57606a',
    iconSvg: '<line x1="6" y1="10" x2="10" y2="10" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="10" x2="18" y2="10" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
    w:       136,
  },
};

/** Escape characters unsafe inside SVG attribute values or text content. */
function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}

/**
 * Returns an inline SVG string for the given badge state.
 * siteUrl is included in the accessible label only — no links in the SVG.
 */
export function generateBadgeSvg(state: BadgeState, siteUrl: string): string {
  const { label, bg, iconSvg, w } = BADGE_CONFIGS[state];
  // Icon zone: 0–26px (centred at x=13). Text zone: 26–w.
  const textX = Math.round(26 + (w - 26) / 2);
  const ariaLabel = `${esc(label)} — ${esc(siteUrl)}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${ariaLabel}">`,
    `  <title>${esc(label)}</title>`,
    `  <rect rx="3" width="${w}" height="20" fill="${bg}"/>`,
    `  ${iconSvg}`,
    `  <line x1="25" y1="3" x2="25" y2="17" stroke="#fff" stroke-opacity="0.25" stroke-width="1"/>`,
    `  <text x="${textX}" y="14" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" fill="#fff" text-anchor="middle">${esc(label)}</text>`,
    `</svg>`,
  ].join('\n');
}
