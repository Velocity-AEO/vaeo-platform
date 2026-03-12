/**
 * tools/optimize/wp_image_plan.test.ts
 *
 * Tests for WordPress image optimization plan generator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planWpImageFixes, type WpImageFix } from './wp_image_plan.js';
import type { WpImageSignals } from '../detect/wp_image_detect.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrap(body: string): string {
  return `<html><body>${body}</body></html>`;
}

function emptySignals(overrides: Partial<WpImageSignals> = {}): WpImageSignals {
  return {
    total_images: 0,
    images_without_lazy: 0,
    images_without_alt: 0,
    images_without_width_height: 0,
    large_images: [],
    non_webp_images: [],
    needs_optimization: false,
    ...overrides,
  };
}

function fixTypes(fixes: WpImageFix[]): string[] {
  return fixes.map((f) => f.type);
}

// ── Lazy loading ─────────────────────────────────────────────────────────────

describe('planWpImageFixes — lazy loading', () => {
  it('adds lazy loading to non-first images', () => {
    const html = wrap('<img src="/first.jpg"><img src="/second.jpg">');
    const plan = planWpImageFixes('s1', '/page', html, emptySignals());
    const lazyFixes = plan.fixes.filter((f) => f.type === 'add_lazy_loading');
    assert.equal(lazyFixes.length, 1);
    assert.equal(lazyFixes[0]!.target_src, '/second.jpg');
  });

  it('skips first image for LCP protection', () => {
    const html = wrap('<img src="/hero.jpg">');
    const plan = planWpImageFixes('s1', '/page', html, emptySignals());
    const lazyFixes = plan.fixes.filter((f) => f.type === 'add_lazy_loading');
    assert.equal(lazyFixes.length, 0);
  });

  it('marks lazy loading as automated', () => {
    const html = wrap('<img src="/a.jpg"><img src="/b.jpg">');
    const plan = planWpImageFixes('s1', '/page', html, emptySignals());
    const lazy = plan.fixes.find((f) => f.type === 'add_lazy_loading');
    assert.equal(lazy?.automated, true);
  });

  it('generates correct fixed_html', () => {
    const html = wrap('<img src="/a.jpg"><img src="/b.jpg" alt="B">');
    const plan = planWpImageFixes('s1', '/page', html, emptySignals());
    const lazy = plan.fixes.find((f) => f.type === 'add_lazy_loading');
    assert.ok(lazy?.fixed_html.includes('loading="lazy"'));
  });

  it('does not add lazy to images that already have it', () => {
    const html = wrap('<img src="/a.jpg"><img src="/b.jpg" loading="lazy">');
    const plan = planWpImageFixes('s1', '/page', html, emptySignals());
    const lazyFixes = plan.fixes.filter((f) => f.type === 'add_lazy_loading');
    assert.equal(lazyFixes.length, 0);
  });
});

// ── Missing alt ──────────────────────────────────────────────────────────────

describe('planWpImageFixes — alt text', () => {
  it('flags images without alt as manual', () => {
    const html = wrap('<img src="/a.jpg">');
    const plan = planWpImageFixes('s1', '/page', html, emptySignals());
    const altFixes = plan.fixes.filter((f) => f.type === 'add_missing_alt');
    assert.equal(altFixes.length, 1);
    assert.equal(altFixes[0]!.automated, false);
  });

  it('does not flag images with alt', () => {
    const html = wrap('<img src="/a.jpg" alt="Photo">');
    const plan = planWpImageFixes('s1', '/page', html, emptySignals());
    const altFixes = plan.fixes.filter((f) => f.type === 'add_missing_alt');
    assert.equal(altFixes.length, 0);
  });
});

// ── Width/height ─────────────────────────────────────────────────────────────

describe('planWpImageFixes — dimensions', () => {
  it('flags images without dimensions as manual', () => {
    const html = wrap('<img src="/a.jpg" alt="x">');
    const plan = planWpImageFixes('s1', '/page', html, emptySignals());
    const dimFixes = plan.fixes.filter((f) => f.type === 'add_width_height');
    assert.equal(dimFixes.length, 1);
    assert.equal(dimFixes[0]!.automated, false);
  });
});

// ── WebP conversion ──────────────────────────────────────────────────────────

describe('planWpImageFixes — WebP', () => {
  it('suggests WebP conversion for non-WebP images', () => {
    const signals = emptySignals({
      non_webp_images: [{ src: '/photo.jpg', format: 'JPEG' }],
    });
    const plan = planWpImageFixes('s1', '/page', wrap(''), signals);
    const webpFixes = plan.fixes.filter((f) => f.type === 'suggest_webp_conversion');
    assert.equal(webpFixes.length, 1);
    assert.equal(webpFixes[0]!.automated, false);
    assert.ok(webpFixes[0]!.reason.includes('JPEG'));
  });
});

// ── Size reduction ──────────────────────────────────────────────────────────

describe('planWpImageFixes — large images', () => {
  it('suggests size reduction for large images', () => {
    const signals = emptySignals({
      large_images: [{ src: '/wp-content/uploads/big.jpg', estimated_kb: 300 }],
    });
    const plan = planWpImageFixes('s1', '/page', wrap(''), signals);
    const sizeFixes = plan.fixes.filter((f) => f.type === 'suggest_size_reduction');
    assert.equal(sizeFixes.length, 1);
    assert.equal(sizeFixes[0]!.automated, false);
  });
});

// ── Counts ──────────────────────────────────────────────────────────────────

describe('planWpImageFixes — counts', () => {
  it('calculates automated and manual counts', () => {
    const html = wrap('<img src="/a.jpg"><img src="/b.jpg">');
    const signals = emptySignals({
      non_webp_images: [{ src: '/a.jpg', format: 'JPEG' }, { src: '/b.jpg', format: 'JPEG' }],
    });
    const plan = planWpImageFixes('s1', '/page', html, signals);
    assert.ok(plan.automated_count >= 0);
    assert.ok(plan.manual_count > 0);
    assert.equal(plan.automated_count + plan.manual_count, plan.fixes.length);
  });

  it('sets site_id and url on plan', () => {
    const plan = planWpImageFixes('site-42', '/about', wrap(''), emptySignals());
    assert.equal(plan.site_id, 'site-42');
    assert.equal(plan.url, '/about');
  });
});

// ── Multiple non-WebP ────────────────────────────────────────────────────────

describe('planWpImageFixes — multiple non-WebP', () => {
  it('creates a fix for each non-WebP image', () => {
    const signals = emptySignals({
      non_webp_images: [
        { src: '/a.jpg', format: 'JPEG' },
        { src: '/b.png', format: 'PNG' },
        { src: '/c.gif', format: 'GIF' },
      ],
    });
    const plan = planWpImageFixes('s1', '/page', wrap(''), signals);
    const webpFixes = plan.fixes.filter((f) => f.type === 'suggest_webp_conversion');
    assert.equal(webpFixes.length, 3);
  });
});

// ── Empty ───────────────────────────────────────────────────────────────────

describe('planWpImageFixes — empty', () => {
  it('returns empty fixes for optimized page', () => {
    const html = wrap('<img src="/a.webp" alt="x" loading="lazy" width="100" height="50">');
    const plan = planWpImageFixes('s1', '/page', html, emptySignals());
    // First image skipped for lazy, has alt and dimensions
    assert.equal(plan.fixes.length, 0);
  });

  it('handles empty HTML gracefully', () => {
    const plan = planWpImageFixes('s1', '/page', '', emptySignals());
    assert.equal(plan.fixes.length, 0);
    assert.equal(plan.automated_count, 0);
  });
});
