/**
 * tools/optimize/performance_plan.test.ts
 *
 * Tests for performance fix plan generation and application.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fixDeferScript,
  fixLazyImage,
  fixFontDisplay,
  applyPerformanceFix,
  applyAllPerformanceFixes,
  generateFixPlan,
  generateAllFixPlans,
  type PerformanceFixPlan,
} from './performance_plan.js';
import type { PerformanceIssue } from '../detect/performance_detect.js';

// ── fixDeferScript ──────────────────────────────────────────────────────────

describe('fixDeferScript', () => {
  it('adds defer before closing >', () => {
    const result = fixDeferScript('<script src="/js/app.js">');
    assert.equal(result, '<script src="/js/app.js" defer>');
  });

  it('preserves existing attributes', () => {
    const result = fixDeferScript('<script src="/js/app.js" type="text/javascript">');
    assert.ok(result.includes('defer'));
    assert.ok(result.includes('type="text/javascript"'));
  });
});

// ── fixLazyImage ────────────────────────────────────────────────────────────

describe('fixLazyImage', () => {
  it('adds loading="lazy" to img tag', () => {
    const result = fixLazyImage('<img src="/hero.jpg" alt="Hero">');
    assert.equal(result, '<img src="/hero.jpg" alt="Hero" loading="lazy">');
  });

  it('handles self-closing img tag', () => {
    const result = fixLazyImage('<img src="/hero.jpg" alt="Hero" />');
    assert.equal(result, '<img src="/hero.jpg" alt="Hero" loading="lazy" />');
  });

  it('preserves all existing attributes', () => {
    const result = fixLazyImage('<img src="/hero.jpg" alt="Hero" class="main" width="800">');
    assert.ok(result.includes('loading="lazy"'));
    assert.ok(result.includes('class="main"'));
    assert.ok(result.includes('width="800"'));
  });
});

// ── fixFontDisplay ──────────────────────────────────────────────────────────

describe('fixFontDisplay', () => {
  it('injects font-display: swap before closing }', () => {
    const input = "@font-face { font-family: 'Custom'; src: url('/font.woff2'); }";
    const result = fixFontDisplay(input);
    assert.ok(result.includes('font-display: swap;'));
    assert.ok(result.endsWith('}'));
  });

  it('preserves existing properties', () => {
    const input = "@font-face { font-family: 'X'; src: url('/x.woff2'); font-weight: bold; }";
    const result = fixFontDisplay(input);
    assert.ok(result.includes("font-family: 'X'"));
    assert.ok(result.includes('font-weight: bold'));
    assert.ok(result.includes('font-display: swap'));
  });
});

// ── applyPerformanceFix ─────────────────────────────────────────────────────

describe('applyPerformanceFix', () => {
  it('replaces original with fixed in HTML', () => {
    const html = '<html><head><script src="/app.js"></script></head></html>';
    const result = applyPerformanceFix(html, '<script src="/app.js">', '<script src="/app.js" defer>');
    assert.ok(result.includes('<script src="/app.js" defer>'));
    assert.ok(!result.includes('<script src="/app.js">') || result.includes('defer'));
  });

  it('returns unchanged HTML if original not found', () => {
    const html = '<html><body></body></html>';
    const result = applyPerformanceFix(html, '<script src="/missing.js">', '<script src="/missing.js" defer>');
    assert.equal(result, html);
  });
});

// ── generateFixPlan ─────────────────────────────────────────────────────────

describe('generateFixPlan', () => {
  it('generates DEFER_SCRIPT plan', () => {
    const issue: PerformanceIssue = {
      issue_type: 'DEFER_SCRIPT',
      url:        'https://example.com',
      element:    '<script src="/app.js">',
      fix_hint:   'Add defer',
    };
    const plan = generateFixPlan(issue);
    assert.equal(plan.issue_type, 'DEFER_SCRIPT');
    assert.equal(plan.action, 'add_defer_attribute');
    assert.ok(plan.fixed.includes('defer'));
    assert.equal(plan.original, '<script src="/app.js">');
  });

  it('generates LAZY_IMAGE plan', () => {
    const issue: PerformanceIssue = {
      issue_type: 'LAZY_IMAGE',
      url:        'https://example.com',
      element:    '<img src="/hero.jpg" alt="Hero">',
      fix_hint:   'Add loading="lazy"',
    };
    const plan = generateFixPlan(issue);
    assert.equal(plan.issue_type, 'LAZY_IMAGE');
    assert.equal(plan.action, 'add_loading_lazy');
    assert.ok(plan.fixed.includes('loading="lazy"'));
  });

  it('generates FONT_DISPLAY plan', () => {
    const issue: PerformanceIssue = {
      issue_type: 'FONT_DISPLAY',
      url:        'https://example.com',
      element:    "@font-face { font-family: 'X'; src: url('/x.woff2'); }",
      fix_hint:   'Add font-display: swap',
    };
    const plan = generateFixPlan(issue);
    assert.equal(plan.issue_type, 'FONT_DISPLAY');
    assert.equal(plan.action, 'add_font_display_swap');
    assert.ok(plan.fixed.includes('font-display: swap'));
  });

  it('handles unknown issue type gracefully', () => {
    const issue: PerformanceIssue = {
      issue_type: 'UNKNOWN' as PerformanceIssue['issue_type'],
      url:        'https://example.com',
      element:    '<div>test</div>',
      fix_hint:   'Unknown',
    };
    const plan = generateFixPlan(issue);
    assert.equal(plan.action, 'unknown');
    assert.equal(plan.fixed, plan.original);
  });
});

// ── generateAllFixPlans ─────────────────────────────────────────────────────

describe('generateAllFixPlans', () => {
  it('generates a plan for each issue', () => {
    const issues: PerformanceIssue[] = [
      { issue_type: 'DEFER_SCRIPT', url: 'https://x.com', element: '<script src="/a.js">', fix_hint: '' },
      { issue_type: 'LAZY_IMAGE',   url: 'https://x.com', element: '<img src="/b.jpg" alt="B">', fix_hint: '' },
    ];
    const plans = generateAllFixPlans(issues);
    assert.equal(plans.length, 2);
    assert.equal(plans[0].issue_type, 'DEFER_SCRIPT');
    assert.equal(plans[1].issue_type, 'LAZY_IMAGE');
  });

  it('returns empty array for empty input', () => {
    const plans = generateAllFixPlans([]);
    assert.equal(plans.length, 0);
  });
});

// ── applyAllPerformanceFixes ────────────────────────────────────────────────

describe('applyAllPerformanceFixes', () => {
  it('applies multiple fixes to HTML', () => {
    const html = '<head><script src="/app.js"></script></head><body><img src="/hero.jpg" alt="Hero"></body>';
    const plans: PerformanceFixPlan[] = [
      {
        issue_type: 'DEFER_SCRIPT',
        url: 'https://x.com',
        action: 'add_defer_attribute',
        original: '<script src="/app.js">',
        fixed: '<script src="/app.js" defer>',
        description: 'test',
      },
      {
        issue_type: 'LAZY_IMAGE',
        url: 'https://x.com',
        action: 'add_loading_lazy',
        original: '<img src="/hero.jpg" alt="Hero">',
        fixed: '<img src="/hero.jpg" alt="Hero" loading="lazy">',
        description: 'test',
      },
    ];
    const result = applyAllPerformanceFixes(html, plans);
    assert.ok(result.includes('defer'));
    assert.ok(result.includes('loading="lazy"'));
  });
});
