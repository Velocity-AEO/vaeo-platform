/**
 * tools/optimize/performance_plan.ts
 *
 * Generates fix plans for performance issues detected by performance_detect.
 *
 * Fix types:
 *   defer_script:  Add defer attribute to identified script tags
 *   lazy_image:    Add loading="lazy" to img tags without it
 *   font_display:  Inject font-display:swap into @font-face blocks
 *
 * All functions are pure — transform HTML strings, no I/O.
 * Never throws.
 */

import type { PerformanceIssue } from '../detect/performance_detect.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PerformanceFixPlan {
  issue_type:  string;
  url:         string;
  action:      string;
  original:    string;
  fixed:       string;
  description: string;
}

// ── Fix generators ──────────────────────────────────────────────────────────

/**
 * Add `defer` attribute to a render-blocking script tag.
 * Inserts defer before the closing >.
 */
export function fixDeferScript(element: string): string {
  // Insert defer before the closing >
  return element.replace(/>$/, ' defer>');
}

/**
 * Add `loading="lazy"` to an img tag.
 * Inserts before the closing > or />.
 */
export function fixLazyImage(element: string): string {
  // Handle self-closing tags
  if (element.endsWith('/>')) {
    return element.replace(/\s*\/>$/, ' loading="lazy" />');
  }
  return element.replace(/>$/, ' loading="lazy">');
}

/**
 * Inject `font-display: swap;` into a @font-face block.
 * Inserts before the closing }.
 */
export function fixFontDisplay(element: string): string {
  return element.replace(/\}$/, '  font-display: swap;\n}');
}

// ── Apply fix to HTML ───────────────────────────────────────────────────────

/**
 * Apply a single performance fix to an HTML string.
 * Replaces the first occurrence of the original element with the fixed version.
 */
export function applyPerformanceFix(html: string, original: string, fixed: string): string {
  const idx = html.indexOf(original);
  if (idx === -1) return html;
  return html.slice(0, idx) + fixed + html.slice(idx + original.length);
}

/**
 * Apply all performance fixes to HTML.
 * Applies each plan sequentially — order matters for overlapping elements.
 */
export function applyAllPerformanceFixes(html: string, plans: PerformanceFixPlan[]): string {
  let result = html;
  for (const plan of plans) {
    result = applyPerformanceFix(result, plan.original, plan.fixed);
  }
  return result;
}

// ── Plan generation ─────────────────────────────────────────────────────────

/**
 * Generate a fix plan for a single performance issue.
 */
export function generateFixPlan(issue: PerformanceIssue): PerformanceFixPlan {
  switch (issue.issue_type) {
    case 'DEFER_SCRIPT': {
      const fixed = fixDeferScript(issue.element);
      return {
        issue_type:  'DEFER_SCRIPT',
        url:         issue.url,
        action:      'add_defer_attribute',
        original:    issue.element,
        fixed,
        description: `Add defer to render-blocking script: ${issue.element.slice(0, 80)}`,
      };
    }
    case 'LAZY_IMAGE': {
      const fixed = fixLazyImage(issue.element);
      return {
        issue_type:  'LAZY_IMAGE',
        url:         issue.url,
        action:      'add_loading_lazy',
        original:    issue.element,
        fixed,
        description: `Add loading="lazy" to image: ${issue.element.slice(0, 80)}`,
      };
    }
    case 'FONT_DISPLAY': {
      const fixed = fixFontDisplay(issue.element);
      return {
        issue_type:  'FONT_DISPLAY',
        url:         issue.url,
        action:      'add_font_display_swap',
        original:    issue.element,
        fixed,
        description: `Add font-display: swap to @font-face rule`,
      };
    }
    default:
      return {
        issue_type:  issue.issue_type,
        url:         issue.url,
        action:      'unknown',
        original:    issue.element,
        fixed:       issue.element,
        description: `Unknown performance issue type: ${issue.issue_type}`,
      };
  }
}

/**
 * Generate fix plans for all detected performance issues.
 */
export function generateAllFixPlans(issues: PerformanceIssue[]): PerformanceFixPlan[] {
  return issues.map(generateFixPlan);
}
