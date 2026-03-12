/**
 * tools/detect/accessibility_issue_classifier.test.ts
 *
 * Tests for accessibility issue classifier.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAccessibilityIssues } from './accessibility_issue_classifier.js';
import type { AccessibilitySignals } from './accessibility_detect.js';

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

// ── Missing alt text ─────────────────────────────────────────────────────────

describe('classifyAccessibilityIssues — missing alt', () => {
  it('classifies missing alt as high severity', () => {
    const signals = emptySignals({
      images_missing_alt: [{ src: '/a.jpg', context: '<img src="/a.jpg">' }],
    });
    const issues = classifyAccessibilityIssues(signals);
    const alt = issues.find((i) => i.type === 'missing_alt_text');
    assert.ok(alt);
    assert.equal(alt.severity, 'high');
    assert.equal(alt.automated, false);
    assert.equal(alt.wcag_criterion, '1.1.1');
    assert.equal(alt.count, 1);
  });

  it('counts multiple missing alt images', () => {
    const signals = emptySignals({
      images_missing_alt: [
        { src: '/a.jpg', context: '' },
        { src: '/b.jpg', context: '' },
        { src: '/c.jpg', context: '' },
      ],
    });
    const issues = classifyAccessibilityIssues(signals);
    const alt = issues.find((i) => i.type === 'missing_alt_text');
    assert.equal(alt?.count, 3);
  });
});

// ── Empty alt text ───────────────────────────────────────────────────────────

describe('classifyAccessibilityIssues — empty alt', () => {
  it('classifies empty alt as medium severity', () => {
    const signals = emptySignals({
      images_empty_alt: [{ src: '/photo.jpg' }],
    });
    const issues = classifyAccessibilityIssues(signals);
    const empty = issues.find((i) => i.type === 'empty_alt_text');
    assert.ok(empty);
    assert.equal(empty.severity, 'medium');
    assert.equal(empty.automated, false);
  });
});

// ── Button label ─────────────────────────────────────────────────────────────

describe('classifyAccessibilityIssues — buttons', () => {
  it('classifies missing button label as high severity', () => {
    const signals = emptySignals({
      buttons_missing_label: [{ html: '<button><svg></svg></button>' }],
    });
    const issues = classifyAccessibilityIssues(signals);
    const btn = issues.find((i) => i.type === 'missing_button_label');
    assert.ok(btn);
    assert.equal(btn.severity, 'high');
    assert.equal(btn.wcag_criterion, '4.1.2');
  });
});

// ── Link label ───────────────────────────────────────────────────────────────

describe('classifyAccessibilityIssues — links', () => {
  it('classifies missing link label as high severity', () => {
    const signals = emptySignals({
      links_missing_label: [{ href: '/home', html: '<a href="/home"><svg></svg></a>' }],
    });
    const issues = classifyAccessibilityIssues(signals);
    const link = issues.find((i) => i.type === 'missing_link_label');
    assert.ok(link);
    assert.equal(link.severity, 'high');
    assert.equal(link.wcag_criterion, '2.4.4');
  });
});

// ── Input label ──────────────────────────────────────────────────────────────

describe('classifyAccessibilityIssues — inputs', () => {
  it('classifies missing input label as high severity', () => {
    const signals = emptySignals({
      inputs_missing_label: [{ type: 'text', name: 'email' }],
    });
    const issues = classifyAccessibilityIssues(signals);
    const input = issues.find((i) => i.type === 'missing_input_label');
    assert.ok(input);
    assert.equal(input.severity, 'high');
    assert.equal(input.wcag_criterion, '1.3.1');
  });
});

// ── Heading structure ────────────────────────────────────────────────────────

describe('classifyAccessibilityIssues — headings', () => {
  it('classifies skipped heading as medium + automated', () => {
    const signals = emptySignals({ headings_skipped: true });
    const issues = classifyAccessibilityIssues(signals);
    const heading = issues.find((i) => i.type === 'skipped_heading_level');
    assert.ok(heading);
    assert.equal(heading.severity, 'medium');
    assert.equal(heading.automated, true);
    assert.equal(heading.wcag_criterion, '1.3.1');
  });

  it('does not include heading issue when not skipped', () => {
    const issues = classifyAccessibilityIssues(emptySignals());
    assert.equal(issues.find((i) => i.type === 'skipped_heading_level'), undefined);
  });
});

// ── Lang attribute ───────────────────────────────────────────────────────────

describe('classifyAccessibilityIssues — lang', () => {
  it('classifies missing lang as medium + automated', () => {
    const signals = emptySignals({ lang_attribute_missing: true });
    const issues = classifyAccessibilityIssues(signals);
    const lang = issues.find((i) => i.type === 'missing_lang_attribute');
    assert.ok(lang);
    assert.equal(lang.severity, 'medium');
    assert.equal(lang.automated, true);
    assert.equal(lang.wcag_criterion, '3.1.1');
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('classifyAccessibilityIssues — edge cases', () => {
  it('returns empty array for clean signals', () => {
    const issues = classifyAccessibilityIssues(emptySignals());
    assert.equal(issues.length, 0);
  });

  it('returns only issues with count > 0', () => {
    const signals = emptySignals({
      images_missing_alt: [{ src: '/a.jpg', context: '' }],
      lang_attribute_missing: true,
    });
    const issues = classifyAccessibilityIssues(signals);
    assert.equal(issues.length, 2);
    assert.ok(issues.every((i) => i.count > 0));
  });

  it('handles null signals gracefully', () => {
    const issues = classifyAccessibilityIssues(null as unknown as AccessibilitySignals);
    assert.equal(issues.length, 0);
  });

  it('automated issues are only heading and lang', () => {
    const signals = emptySignals({
      images_missing_alt: [{ src: '/a.jpg', context: '' }],
      buttons_missing_label: [{ html: '<button></button>' }],
      links_missing_label: [{ href: '/', html: '<a href="/"></a>' }],
      inputs_missing_label: [{ type: 'text', name: 'q' }],
      images_empty_alt: [{ src: '/b.jpg' }],
      headings_skipped: true,
      lang_attribute_missing: true,
    });
    const issues = classifyAccessibilityIssues(signals);
    const automated = issues.filter((i) => i.automated);
    assert.equal(automated.length, 2);
    const types = automated.map((i) => i.type).sort();
    assert.deepEqual(types, ['missing_lang_attribute', 'skipped_heading_level']);
  });

  it('high severity issues are alt, button, link, input', () => {
    const signals = emptySignals({
      images_missing_alt: [{ src: '/a.jpg', context: '' }],
      buttons_missing_label: [{ html: '<button></button>' }],
      links_missing_label: [{ href: '/', html: '<a href="/"></a>' }],
      inputs_missing_label: [{ type: 'text', name: 'q' }],
    });
    const issues = classifyAccessibilityIssues(signals);
    assert.ok(issues.every((i) => i.severity === 'high'));
  });

  it('all issues have required fields', () => {
    const signals = emptySignals({
      images_missing_alt: [{ src: '/a.jpg', context: '' }],
      buttons_missing_label: [{ html: '<button></button>' }],
      headings_skipped: true,
      lang_attribute_missing: true,
    });
    const issues = classifyAccessibilityIssues(signals);
    for (const issue of issues) {
      assert.ok(issue.type);
      assert.ok(issue.severity);
      assert.ok(issue.description);
      assert.ok(issue.wcag_criterion);
      assert.ok(issue.recommendation);
      assert.ok(issue.count > 0);
    }
  });
});
