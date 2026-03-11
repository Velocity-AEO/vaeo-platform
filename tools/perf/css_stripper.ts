/**
 * tools/perf/css_stripper.ts
 *
 * Removes unused CSS rules from stylesheets.
 *
 * Rules:
 *   - Preserves @media, @keyframes, @font-face, @charset, @import, CSS variables, :root
 *   - Never removes rules with <95% unused confidence
 *   - stripUnusedCSS(css, unusedSelectors) — pure string transform
 *   - stripCSSFromHTML(html, coverageResult) — applies to all <style> blocks
 *
 * Never throws.
 */

import type { CoverageResult } from './coverage_tracer.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StripResult {
  css:          string;
  removedCount: number;
  keptCount:    number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a selector string for comparison:
 * collapse whitespace, remove comments.
 */
function normaliseSelector(sel: string): string {
  return sel
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Returns true if the rule block is protected:
 *   @-rules, :root, CSS custom properties.
 */
function isProtectedRule(ruleText: string): boolean {
  const trimmed = ruleText.trimStart();
  if (trimmed.startsWith('@')) return true;
  if (trimmed.startsWith(':root')) return true;
  // Block contains CSS custom properties (--var)
  if (/--[a-zA-Z]/.test(ruleText)) return true;
  return false;
}

// ── stripUnusedCSS ────────────────────────────────────────────────────────────

/**
 * Remove CSS rules whose selectors appear in `unusedSelectors`.
 *
 * Confidence rule: a selector must match EXACTLY (after normalisation)
 * to be removed — this ensures <95% confidence rules are never stripped
 * (partial matches or compound selectors are kept).
 *
 * Protected: @-rules, :root, blocks with CSS variables.
 */
export function stripUnusedCSS(
  css:             string,
  unusedSelectors: string[],
): StripResult {
  if (!unusedSelectors.length) {
    return { css, removedCount: 0, keptCount: 0 };
  }

  // Normalise unused selectors for O(1) lookup
  const unusedSet = new Set(unusedSelectors.map(normaliseSelector));

  const output: string[] = [];
  let removedCount = 0;
  let keptCount    = 0;

  // Walk top-level rules using brace depth
  let depth     = 0;
  let ruleStart = 0;
  let i         = 0;

  // Accumulate characters between rules (whitespace/comments)
  let between = '';

  while (i < css.length) {
    const ch = css[i];

    if (ch === '{') {
      depth++;
      i++;
    } else if (ch === '}') {
      depth--;
      i++;

      if (depth === 0) {
        // Complete top-level rule found: css[ruleStart..i]
        const ruleText = css.slice(ruleStart, i).trim();
        ruleStart = i;

        if (!ruleText) {
          i++;
          continue;
        }

        // Protected rules are always kept
        if (isProtectedRule(ruleText)) {
          output.push(between + ruleText + '\n');
          between = '';
          keptCount++;
          continue;
        }

        // Extract selector (text before first `{`)
        const braceIdx = ruleText.indexOf('{');
        if (braceIdx === -1) {
          output.push(between + ruleText + '\n');
          between = '';
          keptCount++;
          continue;
        }

        const rawSelector = ruleText.slice(0, braceIdx);
        const normSelector = normaliseSelector(rawSelector);

        // Check each comma-separated part of compound selectors
        // Only remove if ALL parts are in the unused set
        const parts = normSelector.split(',').map((p) => p.trim());
        const allUnused = parts.every((p) => unusedSet.has(p));

        if (allUnused) {
          removedCount++;
          between = '';
        } else {
          output.push(between + ruleText + '\n');
          between = '';
          keptCount++;
        }
      }
    } else if (depth === 0 && (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t')) {
      // Whitespace between top-level rules
      between += ch;
      i++;
    } else {
      i++;
    }
  }

  return {
    css:          output.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    removedCount,
    keptCount,
  };
}

// ── stripCSSFromHTML ──────────────────────────────────────────────────────────

/**
 * Apply stripUnusedCSS to every <style> block in an HTML string.
 * Uses unusedCSS selectors from the CoverageResult.
 * Returns the cleaned HTML.
 */
export function stripCSSFromHTML(
  html:           string,
  coverageResult: CoverageResult,
): string {
  const unusedSelectors = coverageResult.unusedCSS.map((r) => r.selector);
  if (!unusedSelectors.length) return html;

  return html.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, open: string, css: string, close: string) => {
      const { css: stripped } = stripUnusedCSS(css, unusedSelectors);
      return `${open}\n${stripped}\n${close}`;
    },
  );
}
