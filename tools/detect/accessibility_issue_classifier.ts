/**
 * tools/detect/accessibility_issue_classifier.ts
 *
 * Classifies accessibility signals into typed issues with
 * severity, WCAG criteria, and automation flags.
 *
 * Pure function — never throws.
 */

import type { AccessibilitySignals } from './accessibility_detect.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AccessibilityIssue {
  type:             'missing_alt_text'
                  | 'empty_alt_text'
                  | 'missing_button_label'
                  | 'missing_link_label'
                  | 'missing_input_label'
                  | 'skipped_heading_level'
                  | 'missing_lang_attribute';
  severity:         'high' | 'medium' | 'low';
  count:            number;
  automated:        boolean;
  description:      string;
  wcag_criterion:   string;
  recommendation:   string;
}

// ── Classifier ───────────────────────────────────────────────────────────────

export function classifyAccessibilityIssues(
  signals: AccessibilitySignals,
): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  try {
    if (!signals) return issues;

    if (signals.images_missing_alt.length > 0) {
      issues.push({
        type:           'missing_alt_text',
        severity:       'high',
        count:          signals.images_missing_alt.length,
        automated:      false,
        description:    'Images without alt attribute prevent screen readers from describing content',
        wcag_criterion: '1.1.1',
        recommendation: 'Add descriptive alt text to each image that conveys its meaning',
      });
    }

    if (signals.images_empty_alt.length > 0) {
      issues.push({
        type:           'empty_alt_text',
        severity:       'medium',
        count:          signals.images_empty_alt.length,
        automated:      false,
        description:    'Images with empty alt may be meaningful and need descriptive text',
        wcag_criterion: '1.1.1',
        recommendation: 'Review images with empty alt — add descriptive text if not purely decorative',
      });
    }

    if (signals.buttons_missing_label.length > 0) {
      issues.push({
        type:           'missing_button_label',
        severity:       'high',
        count:          signals.buttons_missing_label.length,
        automated:      false,
        description:    'Buttons without accessible names are unusable for screen reader users',
        wcag_criterion: '4.1.2',
        recommendation: 'Add text content, aria-label, or aria-labelledby to each button',
      });
    }

    if (signals.links_missing_label.length > 0) {
      issues.push({
        type:           'missing_link_label',
        severity:       'high',
        count:          signals.links_missing_label.length,
        automated:      false,
        description:    'Links without accessible text provide no context for navigation',
        wcag_criterion: '2.4.4',
        recommendation: 'Add text content or aria-label to describe each link purpose',
      });
    }

    if (signals.inputs_missing_label.length > 0) {
      issues.push({
        type:           'missing_input_label',
        severity:       'high',
        count:          signals.inputs_missing_label.length,
        automated:      false,
        description:    'Form inputs without labels are difficult to identify for assistive technology',
        wcag_criterion: '1.3.1',
        recommendation: 'Associate a <label> element or add aria-label to each input',
      });
    }

    if (signals.headings_skipped) {
      issues.push({
        type:           'skipped_heading_level',
        severity:       'medium',
        count:          1,
        automated:      true,
        description:    'Heading levels are not sequential — this disrupts document structure',
        wcag_criterion: '1.3.1',
        recommendation: 'Ensure headings follow a logical order without skipping levels',
      });
    }

    if (signals.lang_attribute_missing) {
      issues.push({
        type:           'missing_lang_attribute',
        severity:       'medium',
        count:          1,
        automated:      true,
        description:    'Page language not declared — screen readers cannot determine pronunciation',
        wcag_criterion: '3.1.1',
        recommendation: 'Add lang attribute to the <html> element',
      });
    }
  } catch {
    // Never throws
  }

  return issues;
}
