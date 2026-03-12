/**
 * tools/detect/wp_image_detect.test.ts
 *
 * Tests for WordPress image optimization detector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectWpImageIssues } from './wp_image_detect.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrap(body: string): string {
  return `<html><head></head><body>${body}</body></html>`;
}

const URL = 'https://example.com/page/';

// ── Total images ─────────────────────────────────────────────────────────────

describe('detectWpImageIssues — counting', () => {
  it('counts total images', () => {
    const html = wrap('<img src="/a.jpg"><img src="/b.png">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.total_images, 2);
  });

  it('returns 0 for no images', () => {
    const r = detectWpImageIssues(wrap('<p>No images</p>'), URL);
    assert.equal(r.total_images, 0);
    assert.equal(r.needs_optimization, false);
  });
});

// ── Lazy loading ─────────────────────────────────────────────────────────────

describe('detectWpImageIssues — lazy loading', () => {
  it('detects images without loading=lazy', () => {
    const html = wrap('<img src="/a.jpg"><img src="/b.jpg" loading="lazy">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.images_without_lazy, 1);
  });

  it('counts 0 when all have lazy', () => {
    const html = wrap('<img src="/a.jpg" loading="lazy">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.images_without_lazy, 0);
  });
});

// ── Alt text ─────────────────────────────────────────────────────────────────

describe('detectWpImageIssues — alt text', () => {
  it('detects images without alt attribute', () => {
    const html = wrap('<img src="/a.jpg"><img src="/b.jpg" alt="Photo">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.images_without_alt, 1);
  });

  it('accepts empty alt (decorative)', () => {
    const html = wrap('<img src="/a.jpg" alt="">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.images_without_alt, 0);
  });
});

// ── Width/height ─────────────────────────────────────────────────────────────

describe('detectWpImageIssues — dimensions', () => {
  it('detects images without width or height', () => {
    const html = wrap('<img src="/a.jpg"><img src="/b.jpg" width="100" height="100">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.images_without_width_height, 1);
  });

  it('flags image with only width (no height)', () => {
    const html = wrap('<img src="/a.jpg" width="100">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.images_without_width_height, 1);
  });

  it('passes when both width and height present', () => {
    const html = wrap('<img src="/a.jpg" width="100" height="50">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.images_without_width_height, 0);
  });
});

// ── Non-WebP ─────────────────────────────────────────────────────────────────

describe('detectWpImageIssues — non-WebP', () => {
  it('flags .jpg as non-WebP', () => {
    const html = wrap('<img src="/photo.jpg">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.non_webp_images.length, 1);
    assert.equal(r.non_webp_images[0]!.format, 'JPEG');
  });

  it('flags .png as non-WebP', () => {
    const html = wrap('<img src="/logo.png">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.non_webp_images.length, 1);
    assert.equal(r.non_webp_images[0]!.format, 'PNG');
  });

  it('does not flag .webp images', () => {
    const html = wrap('<img src="/hero.webp">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.non_webp_images.length, 0);
  });

  it('flags .gif as non-WebP', () => {
    const html = wrap('<img src="/anim.gif">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.non_webp_images[0]!.format, 'GIF');
  });
});

// ── Large images ─────────────────────────────────────────────────────────────

describe('detectWpImageIssues — large images', () => {
  it('flags full-size WP upload (no thumbnail suffix)', () => {
    const html = wrap('<img src="/wp-content/uploads/2024/01/hero.jpg">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.large_images.length, 1);
  });

  it('does not flag thumbnail WP uploads', () => {
    const html = wrap('<img src="/wp-content/uploads/2024/01/hero-300x200.jpg">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.large_images.length, 0);
  });
});

// ── needs_optimization ──────────────────────────────────────────────────────

describe('detectWpImageIssues — needs_optimization', () => {
  it('true when any issue detected', () => {
    const html = wrap('<img src="/a.jpg">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.needs_optimization, true);
  });

  it('false when all images optimized', () => {
    const html = wrap('<img src="/a.webp" alt="Photo" loading="lazy" width="100" height="50">');
    const r = detectWpImageIssues(html, URL);
    assert.equal(r.needs_optimization, false);
  });
});

// ── Resilience ──────────────────────────────────────────────────────────────

describe('detectWpImageIssues — resilience', () => {
  it('handles empty HTML', () => {
    const r = detectWpImageIssues('', URL);
    assert.equal(r.total_images, 0);
  });

  it('handles malformed HTML', () => {
    const r = detectWpImageIssues('<<<not html>>>', URL);
    assert.equal(r.total_images, 0);
    assert.equal(r.needs_optimization, false);
  });
});
