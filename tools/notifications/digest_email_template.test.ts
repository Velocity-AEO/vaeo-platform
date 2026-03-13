/**
 * tools/notifications/digest_email_template.test.ts
 *
 * Tests for HTML digest email template.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDigestSubjectLine,
  buildDigestEmailHTML,
  buildDigestEmailText,
  type DigestEmailData,
} from './digest_email_template.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeData(overrides: Partial<DigestEmailData> = {}): DigestEmailData {
  return {
    site_domain:         'example.com',
    period_label:        'This Week',
    health_score:        85,
    health_score_change: 3,
    fixes_applied:       5,
    fixes_failed:        0,
    open_issues:         2,
    top_fixes: [
      { issue_type: 'Missing Title', url: 'https://example.com/page1', applied_at: '2026-01-01', impact_label: 'Critical' },
      { issue_type: 'Missing Alt', url: 'https://example.com/page2', applied_at: '2026-01-01', impact_label: 'Low' },
    ],
    biggest_ranking_gain: { keyword: 'best widgets', change: 8 },
    gsc_connected:       true,
    agency_name:         null,
    white_label_color:   null,
    unsubscribe_url:     'https://example.com/unsub',
    dashboard_url:       'https://example.com/dash',
    ...overrides,
  };
}

// ── buildDigestSubjectLine ───────────────────────────────────────────────────

describe('buildDigestSubjectLine', () => {
  it('includes fixes and score improvement', () => {
    const subject = buildDigestSubjectLine(makeData());
    assert.ok(subject.includes('5'));
    assert.ok(subject.includes('score up 3 points'));
  });

  it('with fixes only (no score change)', () => {
    const subject = buildDigestSubjectLine(makeData({ health_score_change: null }));
    assert.ok(subject.includes('5 SEO issues'));
    assert.ok(!subject.includes('score up'));
  });

  it('with open issues only (no fixes)', () => {
    const subject = buildDigestSubjectLine(makeData({ fixes_applied: 0, health_score_change: null }));
    assert.ok(subject.includes('2 SEO issues found'));
    assert.ok(subject.includes('review needed'));
  });

  it('default case — no fixes, no open issues', () => {
    const subject = buildDigestSubjectLine(makeData({ fixes_applied: 0, open_issues: 0, health_score_change: null }));
    assert.ok(subject.includes('weekly SEO report'));
  });

  it('replaces VAEO with agency_name', () => {
    const subject = buildDigestSubjectLine(makeData({ agency_name: 'Acme SEO' }));
    assert.ok(subject.includes('Acme SEO'));
    assert.ok(!subject.includes('VAEO'));
  });

  it('never throws on null data', () => {
    assert.doesNotThrow(() => buildDigestSubjectLine(null as any));
  });
});

// ── buildDigestEmailHTML ─────────────────────────────────────────────────────

describe('buildDigestEmailHTML', () => {
  it('includes site_domain', () => {
    const html = buildDigestEmailHTML(makeData());
    assert.ok(html.includes('example.com'));
  });

  it('includes health_score', () => {
    const html = buildDigestEmailHTML(makeData({ health_score: 92 }));
    assert.ok(html.includes('92'));
  });

  it('shows score change when provided', () => {
    const html = buildDigestEmailHTML(makeData({ health_score_change: 5 }));
    assert.ok(html.includes('+5'));
    assert.ok(html.includes('points this week'));
  });

  it('shows negative score change', () => {
    const html = buildDigestEmailHTML(makeData({ health_score_change: -3 }));
    assert.ok(html.includes('-3'));
  });

  it('shows top fixes section when fixes > 0', () => {
    const html = buildDigestEmailHTML(makeData());
    assert.ok(html.includes('What we fixed'));
    assert.ok(html.includes('Missing Title'));
  });

  it('hides failed pill when failures = 0', () => {
    const html = buildDigestEmailHTML(makeData({ fixes_failed: 0 }));
    assert.ok(!html.includes('0 Failed'));
  });

  it('shows failed pill when failures > 0', () => {
    const html = buildDigestEmailHTML(makeData({ fixes_failed: 2 }));
    assert.ok(html.includes('2 Failed'));
  });

  it('shows ranking gain when provided', () => {
    const html = buildDigestEmailHTML(makeData());
    assert.ok(html.includes('best widgets'));
    assert.ok(html.includes('8 positions'));
  });

  it('uses white_label_color', () => {
    const html = buildDigestEmailHTML(makeData({ white_label_color: '#ff5500' }));
    assert.ok(html.includes('#ff5500'));
  });

  it('uses agency_name', () => {
    const html = buildDigestEmailHTML(makeData({ agency_name: 'BrandCo' }));
    assert.ok(html.includes('BrandCo'));
  });

  it('includes dashboard_url', () => {
    const html = buildDigestEmailHTML(makeData());
    assert.ok(html.includes('https://example.com/dash'));
  });

  it('includes unsubscribe_url', () => {
    const html = buildDigestEmailHTML(makeData());
    assert.ok(html.includes('https://example.com/unsub'));
  });

  it('omits score section when health_score is null', () => {
    const html = buildDigestEmailHTML(makeData({ health_score: null }));
    assert.ok(!html.includes('Health Score'));
  });

  it('omits ranking gain when null', () => {
    const html = buildDigestEmailHTML(makeData({ biggest_ranking_gain: null }));
    assert.ok(!html.includes('moved up'));
  });

  it('never throws on empty top_fixes', () => {
    assert.doesNotThrow(() => buildDigestEmailHTML(makeData({ top_fixes: [] })));
  });

  it('never throws on null data', () => {
    assert.doesNotThrow(() => buildDigestEmailHTML(null as any));
  });

  it('limits top_fixes to 5', () => {
    const fixes = Array.from({ length: 10 }, (_, i) => ({
      issue_type: `Issue ${i}`, url: `https://example.com/${i}`,
      applied_at: '2026-01-01', impact_label: 'High',
    }));
    const html = buildDigestEmailHTML(makeData({ top_fixes: fixes }));
    // Issue 5 through 9 should not appear
    assert.ok(!html.includes('Issue 5'));
  });
});

// ── buildDigestEmailText ─────────────────────────────────────────────────────

describe('buildDigestEmailText', () => {
  it('includes key data', () => {
    const text = buildDigestEmailText(makeData());
    assert.ok(text.includes('example.com'));
    assert.ok(text.includes('85'));
    assert.ok(text.includes('Fixed: 5'));
  });

  it('has no HTML tags', () => {
    const text = buildDigestEmailText(makeData());
    assert.ok(!text.includes('<'));
    assert.ok(!text.includes('>'));
  });

  it('includes ranking gain', () => {
    const text = buildDigestEmailText(makeData());
    assert.ok(text.includes('best widgets'));
  });

  it('never throws on null data', () => {
    assert.doesNotThrow(() => buildDigestEmailText(null as any));
  });
});
