/**
 * tools/email/render.test.ts
 *
 * Tests for renderDigestEmail and digestSubject.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderDigestEmail, digestSubject } from './render.js';
import type { DigestReport } from './digest.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeReport(overrides?: Partial<DigestReport>): DigestReport {
  return {
    site_id:          'site-001',
    tenant_id:        'tenant-001',
    site_url:         'https://example.com',
    health_before:    72,
    health_after:     85,
    grade_before:     'C',
    grade_after:      'B',
    fixes_applied:    4,
    issues_resolved:  5,
    issues_remaining: 3,
    top_win:          'Fixed 3 title missing issues this week.',
    generated_at:     '2026-03-10T12:00:00Z',
    ...overrides,
  };
}

// ── digestSubject ────────────────────────────────────────────────────────────

describe('digestSubject', () => {
  it('shows improvement when score went up', () => {
    const subject = digestSubject(makeReport());
    assert.match(subject, /improved/);
    assert.match(subject, /C/);
    assert.match(subject, /B/);
    assert.match(subject, /Velocity AEO/);
  });

  it('shows drop when score went down', () => {
    const subject = digestSubject(makeReport({ health_before: 90, health_after: 72, grade_before: 'A', grade_after: 'C' }));
    assert.match(subject, /dropped/);
    assert.match(subject, /A/);
    assert.match(subject, /C/);
  });

  it('shows neutral message when score unchanged', () => {
    const subject = digestSubject(makeReport({ health_before: 85, health_after: 85, grade_before: 'B', grade_after: 'B' }));
    assert.match(subject, /weekly SEO digest/);
    assert.match(subject, /Grade B/);
  });
});

// ── renderDigestEmail ────────────────────────────────────────────────────────

describe('renderDigestEmail', () => {
  it('returns valid HTML with DOCTYPE', () => {
    const html = renderDigestEmail(makeReport());
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /<html/);
    assert.match(html, /<\/html>/);
  });

  it('includes the site URL', () => {
    const html = renderDigestEmail(makeReport());
    assert.match(html, /example\.com/);
  });

  it('shows grade before and after', () => {
    const html = renderDigestEmail(makeReport());
    assert.match(html, /C/);  // grade_before
    assert.match(html, /B/);  // grade_after
  });

  it('shows health scores', () => {
    const html = renderDigestEmail(makeReport());
    assert.match(html, /72\/100/);
    assert.match(html, /85\/100/);
  });

  it('shows positive score delta with + sign', () => {
    const html = renderDigestEmail(makeReport());
    assert.match(html, /\+13/);
  });

  it('shows negative score delta', () => {
    const html = renderDigestEmail(makeReport({ health_before: 90, health_after: 80 }));
    assert.match(html, /-10/);
  });

  it('includes fixes applied count', () => {
    const html = renderDigestEmail(makeReport({ fixes_applied: 7 }));
    assert.match(html, /7/);
  });

  it('includes issues resolved count', () => {
    const html = renderDigestEmail(makeReport({ issues_resolved: 5 }));
    assert.match(html, /5/);
  });

  it('includes issues remaining count', () => {
    const html = renderDigestEmail(makeReport({ issues_remaining: 3 }));
    assert.match(html, /3.*remaining/);
  });

  it('shows "All clear" when no issues remain', () => {
    const html = renderDigestEmail(makeReport({ issues_remaining: 0 }));
    assert.match(html, /All clear/);
  });

  it('includes the top win text', () => {
    const html = renderDigestEmail(makeReport({ top_win: 'Fixed 3 title missing issues this week.' }));
    assert.match(html, /Fixed 3 title missing issues/);
  });

  it('includes CTA button linking to the dashboard', () => {
    const html = renderDigestEmail(makeReport());
    assert.match(html, /View full report/);
    assert.match(html, /app\.velocityaeo\.com\/sites\/site-001/);
  });

  it('uses table-based layout (no flex or grid)', () => {
    const html = renderDigestEmail(makeReport());
    assert.doesNotMatch(html, /display:\s*flex/i);
    assert.doesNotMatch(html, /display:\s*grid/i);
  });

  it('escapes HTML in user-generated content', () => {
    const html = renderDigestEmail(makeReport({
      site_url: 'https://example.com/<script>alert("xss")</script>',
      top_win:  'Fixed <b>issues</b>',
    }));
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  it('includes mobile viewport meta tag', () => {
    const html = renderDigestEmail(makeReport());
    assert.match(html, /viewport/);
    assert.match(html, /width=device-width/);
  });
});
