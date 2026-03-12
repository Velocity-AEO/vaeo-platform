/**
 * tools/apply/wp_image_apply.test.ts
 *
 * Tests for WordPress image fix applicator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyWpImageFixes } from './wp_image_apply.js';
import type { WpImageFix, WpImagePlan } from '../optimize/wp_image_plan.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlan(fixes: WpImageFix[]): WpImagePlan {
  return {
    site_id:         's1',
    url:             '/page',
    fixes,
    automated_count: fixes.filter((f) => f.automated).length,
    manual_count:    fixes.filter((f) => !f.automated).length,
  };
}

function lazyFix(src: string, currentHtml: string): WpImageFix {
  return {
    type:         'add_lazy_loading',
    target_src:   src,
    current_html: currentHtml,
    fixed_html:   currentHtml.replace(/<img\b/i, '<img loading="lazy"'),
    automated:    true,
    reason:       'Add lazy loading',
  };
}

function manualFix(src: string): WpImageFix {
  return {
    type:         'add_missing_alt',
    target_src:   src,
    current_html: `<img src="${src}">`,
    fixed_html:   `<img alt="" src="${src}">`,
    automated:    false,
    reason:       'Manual review needed',
  };
}

// ── Basic application ───────────────────────────────────────────────────────

describe('applyWpImageFixes — basic', () => {
  it('applies automated lazy loading fix', () => {
    const html = '<div><img src="/first.jpg"><img src="/second.jpg"></div>';
    const plan = makePlan([lazyFix('/second.jpg', '<img src="/second.jpg">')]);
    const result = applyWpImageFixes(html, plan);
    assert.ok(result.html.includes('loading="lazy"'));
    assert.equal(result.applied.length, 1);
  });

  it('returns modified HTML', () => {
    const html = '<img src="/a.jpg"><img src="/b.jpg">';
    const plan = makePlan([lazyFix('/b.jpg', '<img src="/b.jpg">')]);
    const result = applyWpImageFixes(html, plan);
    assert.notEqual(result.html, html);
  });

  it('tracks applied fixes', () => {
    const html = '<img src="/a.jpg"><img src="/b.jpg">';
    const plan = makePlan([lazyFix('/b.jpg', '<img src="/b.jpg">')]);
    const result = applyWpImageFixes(html, plan);
    assert.equal(result.applied.length, 1);
    assert.equal(result.applied[0]!.type, 'add_lazy_loading');
  });
});

// ── Manual fix skipping ─────────────────────────────────────────────────────

describe('applyWpImageFixes — manual skipping', () => {
  it('skips non-automated fixes', () => {
    const html = '<img src="/a.jpg">';
    const plan = makePlan([manualFix('/a.jpg')]);
    const result = applyWpImageFixes(html, plan);
    assert.equal(result.html, html);
    assert.equal(result.applied.length, 0);
    assert.equal(result.skipped.length, 1);
  });

  it('applies automated but skips manual in same plan', () => {
    const html = '<img src="/a.jpg"><img src="/b.jpg">';
    const plan = makePlan([
      lazyFix('/b.jpg', '<img src="/b.jpg">'),
      manualFix('/a.jpg'),
    ]);
    const result = applyWpImageFixes(html, plan);
    assert.equal(result.applied.length, 1);
    assert.equal(result.skipped.length, 1);
  });
});

// ── LCP protection ──────────────────────────────────────────────────────────

describe('applyWpImageFixes — LCP protection', () => {
  it('skips first image on page for lazy loading', () => {
    const html = '<img src="/hero.jpg"><img src="/other.jpg">';
    const plan = makePlan([lazyFix('/hero.jpg', '<img src="/hero.jpg">')]);
    const result = applyWpImageFixes(html, plan);
    assert.equal(result.applied.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.ok(!result.html.includes('loading="lazy"'));
  });

  it('applies lazy to non-first images', () => {
    const html = '<img src="/hero.jpg"><img src="/second.jpg"><img src="/third.jpg">';
    const plan = makePlan([
      lazyFix('/second.jpg', '<img src="/second.jpg">'),
      lazyFix('/third.jpg', '<img src="/third.jpg">'),
    ]);
    const result = applyWpImageFixes(html, plan);
    assert.equal(result.applied.length, 2);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('applyWpImageFixes — edge cases', () => {
  it('skips fix when target tag not found in HTML', () => {
    const html = '<img src="/a.jpg">';
    const plan = makePlan([lazyFix('/missing.jpg', '<img src="/missing.jpg">')]);
    const result = applyWpImageFixes(html, plan);
    assert.equal(result.applied.length, 0);
    assert.equal(result.skipped.length, 1);
  });

  it('handles empty HTML', () => {
    const result = applyWpImageFixes('', makePlan([]));
    assert.equal(result.html, '');
    assert.equal(result.applied.length, 0);
  });

  it('handles null-ish plan', () => {
    const result = applyWpImageFixes('<p>hi</p>', null as unknown as WpImagePlan);
    assert.equal(result.html, '<p>hi</p>');
  });

  it('skips already-lazy images', () => {
    const html = '<img src="/a.jpg"><img src="/b.jpg" loading="lazy">';
    const plan = makePlan([lazyFix('/b.jpg', '<img src="/b.jpg" loading="lazy">')]);
    const result = applyWpImageFixes(html, plan);
    assert.equal(result.applied.length, 0);
    assert.equal(result.skipped.length, 1);
  });
});

// ── Multiple fixes ──────────────────────────────────────────────────────────

describe('applyWpImageFixes — multiple', () => {
  it('applies multiple lazy fixes to different images', () => {
    const html = '<img src="/a.jpg"><img src="/b.jpg"><img src="/c.jpg"><img src="/d.jpg">';
    const plan = makePlan([
      lazyFix('/b.jpg', '<img src="/b.jpg">'),
      lazyFix('/c.jpg', '<img src="/c.jpg">'),
      lazyFix('/d.jpg', '<img src="/d.jpg">'),
    ]);
    const result = applyWpImageFixes(html, plan);
    assert.equal(result.applied.length, 3);
    // Count lazy attributes in result
    const lazyCount = (result.html.match(/loading="lazy"/g) ?? []).length;
    assert.equal(lazyCount, 3);
  });

  it('does not double-apply lazy on same tag', () => {
    const html = '<img src="/a.jpg"><img src="/b.jpg">';
    const fix = lazyFix('/b.jpg', '<img src="/b.jpg">');
    const plan = makePlan([fix, { ...fix }]);
    const result = applyWpImageFixes(html, plan);
    const lazyCount = (result.html.match(/loading="lazy"/g) ?? []).length;
    assert.equal(lazyCount, 1);
  });

  it('preserves non-img HTML content', () => {
    const html = '<h1>Title</h1><img src="/a.jpg"><p>Text</p><img src="/b.jpg">';
    const plan = makePlan([lazyFix('/b.jpg', '<img src="/b.jpg">')]);
    const result = applyWpImageFixes(html, plan);
    assert.ok(result.html.includes('<h1>Title</h1>'));
    assert.ok(result.html.includes('<p>Text</p>'));
  });

  it('total applied + skipped equals total fixes', () => {
    const html = '<img src="/a.jpg"><img src="/b.jpg">';
    const plan = makePlan([
      lazyFix('/b.jpg', '<img src="/b.jpg">'),
      manualFix('/a.jpg'),
      manualFix('/b.jpg'),
    ]);
    const result = applyWpImageFixes(html, plan);
    assert.equal(result.applied.length + result.skipped.length, 3);
  });
});
