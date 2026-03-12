/**
 * tools/detect/accessibility_detect.test.ts
 *
 * Tests for accessibility issue detector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectAccessibilityIssues } from './accessibility_detect.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrap(body: string): string {
  return `<html lang="en"><body>${body}</body></html>`;
}

function wrapNoLang(body: string): string {
  return `<html><body>${body}</body></html>`;
}

// ── Images missing alt ───────────────────────────────────────────────────────

describe('detectAccessibilityIssues — images', () => {
  it('detects images without alt attribute', () => {
    const html = wrap('<img src="/hero.jpg"><img src="/logo.png" alt="Logo">');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.images_missing_alt.length, 1);
    assert.equal(signals.images_missing_alt[0]!.src, '/hero.jpg');
  });

  it('detects empty alt on non-decorative images', () => {
    const html = wrap('<img src="/photo.jpg" alt="">');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.images_empty_alt.length, 1);
    assert.equal(signals.images_empty_alt[0]!.src, '/photo.jpg');
  });

  it('skips empty alt on decorative images', () => {
    const html = wrap(
      '<img src="/spacer.gif" alt=""><img src="/1x1.png" alt=""><img src="/transparent.gif" alt="">',
    );
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.images_empty_alt.length, 0);
  });

  it('does not flag images with meaningful alt', () => {
    const html = wrap('<img src="/hero.jpg" alt="A beautiful sunset">');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.images_missing_alt.length, 0);
    assert.equal(signals.images_empty_alt.length, 0);
  });
});

// ── Buttons missing label ────────────────────────────────────────────────────

describe('detectAccessibilityIssues — buttons', () => {
  it('detects buttons with no text and no aria-label', () => {
    const html = wrap('<button><svg></svg></button>');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.buttons_missing_label.length, 1);
  });

  it('does not flag buttons with text content', () => {
    const html = wrap('<button>Submit</button>');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.buttons_missing_label.length, 0);
  });

  it('does not flag buttons with aria-label', () => {
    const html = wrap('<button aria-label="Close"><svg></svg></button>');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.buttons_missing_label.length, 0);
  });

  it('does not flag buttons with aria-labelledby', () => {
    const html = wrap('<button aria-labelledby="lbl"><svg></svg></button>');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.buttons_missing_label.length, 0);
  });
});

// ── Links missing label ──────────────────────────────────────────────────────

describe('detectAccessibilityIssues — links', () => {
  it('detects icon-only links with no text', () => {
    const html = wrap('<a href="/home"><svg></svg></a>');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.links_missing_label.length, 1);
    assert.equal(signals.links_missing_label[0]!.href, '/home');
  });

  it('does not flag links with text content', () => {
    const html = wrap('<a href="/about">About Us</a>');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.links_missing_label.length, 0);
  });

  it('does not flag links with aria-label', () => {
    const html = wrap('<a href="/home" aria-label="Home"><svg></svg></a>');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.links_missing_label.length, 0);
  });
});

// ── Inputs missing label ─────────────────────────────────────────────────────

describe('detectAccessibilityIssues — inputs', () => {
  it('detects inputs without associated label', () => {
    const html = wrap('<input type="text" name="email">');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.inputs_missing_label.length, 1);
    assert.equal(signals.inputs_missing_label[0]!.name, 'email');
  });

  it('excludes hidden and submit inputs', () => {
    const html = wrap('<input type="hidden" name="csrf"><input type="submit" value="Go">');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.inputs_missing_label.length, 0);
  });

  it('does not flag inputs with associated label', () => {
    const html = wrap('<label for="email">Email</label><input type="text" id="email" name="email">');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.inputs_missing_label.length, 0);
  });

  it('does not flag inputs with aria-label', () => {
    const html = wrap('<input type="text" name="search" aria-label="Search">');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.inputs_missing_label.length, 0);
  });
});

// ── Heading structure ────────────────────────────────────────────────────────

describe('detectAccessibilityIssues — headings', () => {
  it('detects skipped heading levels', () => {
    const html = wrap('<h1>Title</h1><h3>Subtitle</h3>');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.headings_skipped, true);
    assert.deepEqual(signals.heading_levels, [1, 3]);
  });

  it('does not flag sequential headings', () => {
    const html = wrap('<h1>Title</h1><h2>Section</h2><h3>Sub</h3>');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.headings_skipped, false);
  });
});

// ── Lang attribute ───────────────────────────────────────────────────────────

describe('detectAccessibilityIssues — lang', () => {
  it('detects missing lang attribute', () => {
    const signals = detectAccessibilityIssues(wrapNoLang('<p>Hello</p>'), '/page');
    assert.equal(signals.lang_attribute_missing, true);
  });

  it('does not flag when lang is present', () => {
    const signals = detectAccessibilityIssues(wrap('<p>Hello</p>'), '/page');
    assert.equal(signals.lang_attribute_missing, false);
  });
});

// ── Totals and edge cases ────────────────────────────────────────────────────

describe('detectAccessibilityIssues — totals', () => {
  it('calculates total_issues correctly', () => {
    const html = wrapNoLang('<img src="/a.jpg"><button><svg></svg></button>');
    const signals = detectAccessibilityIssues(html, '/page');
    // 1 missing alt + 1 button + 1 lang = 3
    assert.equal(signals.total_issues, 3);
    assert.equal(signals.needs_fixes, true);
  });

  it('returns zero issues for clean page', () => {
    const html = wrap('<img src="/a.jpg" alt="Photo"><button>Click</button><h1>Title</h1>');
    const signals = detectAccessibilityIssues(html, '/page');
    assert.equal(signals.total_issues, 0);
    assert.equal(signals.needs_fixes, false);
  });

  it('handles empty HTML', () => {
    const signals = detectAccessibilityIssues('', '/page');
    assert.equal(signals.total_issues, 0);
    assert.equal(signals.needs_fixes, false);
  });
});
