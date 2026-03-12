/**
 * tools/apply/accessibility_apply.test.ts
 *
 * Tests for accessibility auto-fix applicator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAccessibilityFixes } from './accessibility_apply.js';
import type { AccessibilitySignals } from '../detect/accessibility_detect.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptySignals(overrides: Partial<AccessibilitySignals> = {}): AccessibilitySignals {
  return {
    images_missing_alt:     [],
    images_empty_alt:       [],
    buttons_missing_label:  [],
    links_missing_label:    [],
    inputs_missing_label:   [],
    headings_skipped:       false,
    heading_levels:         [],
    lang_attribute_missing: false,
    total_issues:           0,
    needs_fixes:            false,
    ...overrides,
  };
}

// ── Lang attribute ───────────────────────────────────────────────────────────

describe('applyAccessibilityFixes — lang attribute', () => {
  it('adds lang="en" when missing', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const signals = emptySignals({ lang_attribute_missing: true });
    const result = applyAccessibilityFixes(html, signals);
    assert.ok(result.html.includes('lang="en"'));
    assert.equal(result.applied.length, 1);
    assert.equal(result.applied[0]!.type, 'add_lang_attribute');
    assert.equal(result.applied[0]!.automated, true);
  });

  it('does not add lang when already present', () => {
    const html = '<html lang="en"><body><p>Hello</p></body></html>';
    const signals = emptySignals({ lang_attribute_missing: false });
    const result = applyAccessibilityFixes(html, signals);
    assert.equal(result.html, html);
    assert.equal(result.applied.length, 0);
  });

  it('preserves existing html attributes', () => {
    const html = '<html class="no-js"><body><p>Hello</p></body></html>';
    const signals = emptySignals({ lang_attribute_missing: true });
    const result = applyAccessibilityFixes(html, signals);
    assert.ok(result.html.includes('lang="en"'));
    assert.ok(result.html.includes('class="no-js"'));
  });
});

// ── Heading structure ────────────────────────────────────────────────────────

describe('applyAccessibilityFixes — headings', () => {
  it('skips heading normalization (too risky)', () => {
    const html = '<html lang="en"><body><h1>A</h1><h3>B</h3></body></html>';
    const signals = emptySignals({ headings_skipped: true });
    const result = applyAccessibilityFixes(html, signals);
    assert.equal(result.html, html); // unchanged
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0]!.type, 'normalize_heading_structure');
    assert.equal(result.skipped[0]!.automated, false);
  });
});

// ── Manual review ────────────────────────────────────────────────────────────

describe('applyAccessibilityFixes — manual review', () => {
  it('generates review items for missing alt', () => {
    const signals = emptySignals({
      images_missing_alt: [
        { src: '/a.jpg', context: '' },
        { src: '/b.jpg', context: '' },
        { src: '/c.jpg', context: '' },
      ],
    });
    const result = applyAccessibilityFixes('<html lang="en"><body></body></html>', signals);
    assert.equal(result.manual_review.length, 1);
    assert.ok(result.manual_review[0]!.includes('3 images missing alt text'));
  });

  it('generates review items for missing button labels', () => {
    const signals = emptySignals({
      buttons_missing_label: [{ html: '<button></button>' }, { html: '<button></button>' }],
    });
    const result = applyAccessibilityFixes('<html lang="en"><body></body></html>', signals);
    assert.ok(result.manual_review.some((r) => r.includes('2 buttons missing accessible labels')));
  });

  it('generates review items for missing link labels', () => {
    const signals = emptySignals({
      links_missing_label: [{ href: '/', html: '<a href="/"></a>' }],
    });
    const result = applyAccessibilityFixes('<html lang="en"><body></body></html>', signals);
    assert.ok(result.manual_review.some((r) => r.includes('1 link with no accessible name')));
  });

  it('generates review items for missing input labels', () => {
    const signals = emptySignals({
      inputs_missing_label: [{ type: 'text', name: 'q' }],
    });
    const result = applyAccessibilityFixes('<html lang="en"><body></body></html>', signals);
    assert.ok(result.manual_review.some((r) => r.includes('1 input missing associated labels')));
  });

  it('generates review for empty alt text', () => {
    const signals = emptySignals({
      images_empty_alt: [{ src: '/photo.jpg' }],
    });
    const result = applyAccessibilityFixes('<html lang="en"><body></body></html>', signals);
    assert.ok(result.manual_review.some((r) => r.includes('empty alt text')));
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('applyAccessibilityFixes — edge cases', () => {
  it('handles empty HTML', () => {
    const result = applyAccessibilityFixes('', emptySignals());
    assert.equal(result.html, '');
    assert.equal(result.applied.length, 0);
  });

  it('handles null signals', () => {
    const result = applyAccessibilityFixes('<p>hi</p>', null as unknown as AccessibilitySignals);
    assert.equal(result.html, '<p>hi</p>');
  });

  it('returns no manual review for clean page', () => {
    const result = applyAccessibilityFixes('<html lang="en"><body></body></html>', emptySignals());
    assert.equal(result.manual_review.length, 0);
    assert.equal(result.applied.length, 0);
    assert.equal(result.skipped.length, 0);
  });
});
