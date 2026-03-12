/**
 * apps/dashboard/lib/page_layout_audit.ts
 *
 * Testable audit utilities for verifying mobile-responsive layout compliance.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuditSeverity = 'pass' | 'warn' | 'fail';

export interface AuditResult {
  rule:     string;
  severity: AuditSeverity;
  message:  string;
}

export interface LayoutAuditReport {
  page:      string;
  results:   AuditResult[];
  pass_count: number;
  warn_count: number;
  fail_count: number;
  score:     number;       // 0-100
}

// ── Rule checkers ─────────────────────────────────────────────────────────────

export function checkTapTarget(height_px: number): AuditResult {
  try {
    const h = height_px ?? 0;
    if (h >= 44) return { rule: 'tap-target', severity: 'pass', message: `Tap target ${h}px meets 44px minimum` };
    if (h >= 36) return { rule: 'tap-target', severity: 'warn', message: `Tap target ${h}px is close but below 44px` };
    return { rule: 'tap-target', severity: 'fail', message: `Tap target ${h}px is below 44px minimum` };
  } catch {
    return { rule: 'tap-target', severity: 'fail', message: 'Unable to check tap target' };
  }
}

export function checkHorizontalOverflow(content_width: number, viewport_width: number): AuditResult {
  try {
    const cw = content_width ?? 0;
    const vw = viewport_width ?? 375;
    if (cw <= vw) return { rule: 'no-h-scroll', severity: 'pass', message: `Content ${cw}px fits viewport ${vw}px` };
    return { rule: 'no-h-scroll', severity: 'fail', message: `Content ${cw}px overflows viewport ${vw}px` };
  } catch {
    return { rule: 'no-h-scroll', severity: 'fail', message: 'Unable to check overflow' };
  }
}

export function checkFontSize(size_px: number): AuditResult {
  try {
    const s = size_px ?? 0;
    if (s >= 14) return { rule: 'font-size', severity: 'pass', message: `Font ${s}px meets 14px minimum` };
    if (s >= 12) return { rule: 'font-size', severity: 'warn', message: `Font ${s}px is small but may be acceptable for labels` };
    if (s >= 10) return { rule: 'font-size', severity: 'warn', message: `Font ${s}px is very small` };
    return { rule: 'font-size', severity: 'fail', message: `Font ${s}px is too small for mobile` };
  } catch {
    return { rule: 'font-size', severity: 'fail', message: 'Unable to check font size' };
  }
}

export function checkContainerPadding(padding_px: number): AuditResult {
  try {
    const p = padding_px ?? 0;
    if (p >= 16) return { rule: 'container-padding', severity: 'pass', message: `Padding ${p}px meets 16px minimum` };
    if (p >= 8) return { rule: 'container-padding', severity: 'warn', message: `Padding ${p}px is tight` };
    return { rule: 'container-padding', severity: 'fail', message: `Padding ${p}px is too narrow for mobile` };
  } catch {
    return { rule: 'container-padding', severity: 'fail', message: 'Unable to check padding' };
  }
}

export function checkStackedLayout(is_stacked: boolean, viewport_width: number): AuditResult {
  try {
    const vw = viewport_width ?? 375;
    if (vw >= 768) return { rule: 'stacked-layout', severity: 'pass', message: 'Desktop viewport — stacking not required' };
    if (is_stacked) return { rule: 'stacked-layout', severity: 'pass', message: 'Layout stacks on mobile' };
    return { rule: 'stacked-layout', severity: 'fail', message: 'Layout should stack on mobile viewports' };
  } catch {
    return { rule: 'stacked-layout', severity: 'fail', message: 'Unable to check layout stacking' };
  }
}

export function checkImageAspectRatio(width: number, height: number): AuditResult {
  try {
    const w = width ?? 0;
    const h = height ?? 0;
    if (w === 0 || h === 0) return { rule: 'image-ratio', severity: 'warn', message: 'Image has zero dimension' };
    const ratio = w / h;
    if (ratio >= 0.5 && ratio <= 3) return { rule: 'image-ratio', severity: 'pass', message: `Image ratio ${ratio.toFixed(2)} is within acceptable range` };
    return { rule: 'image-ratio', severity: 'warn', message: `Image ratio ${ratio.toFixed(2)} may cause layout issues` };
  } catch {
    return { rule: 'image-ratio', severity: 'warn', message: 'Unable to check image ratio' };
  }
}

// ── Report builder ────────────────────────────────────────────────────────────

export function buildLayoutAudit(page: string, results: AuditResult[]): LayoutAuditReport {
  try {
    const r = results ?? [];
    const pass_count = r.filter(x => x.severity === 'pass').length;
    const warn_count = r.filter(x => x.severity === 'warn').length;
    const fail_count = r.filter(x => x.severity === 'fail').length;
    const total = r.length || 1;
    const score = Math.round((pass_count / total) * 100);
    return { page: page ?? '', results: r, pass_count, warn_count, fail_count, score };
  } catch {
    return { page: page ?? '', results: [], pass_count: 0, warn_count: 0, fail_count: 0, score: 0 };
  }
}

export function isAuditPassing(report: LayoutAuditReport): boolean {
  try {
    return (report?.fail_count ?? 1) === 0;
  } catch {
    return false;
  }
}
