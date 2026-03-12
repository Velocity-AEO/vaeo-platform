/**
 * tools/reports/accessibility_report.test.ts
 *
 * Tests for accessibility report builder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAccessibilitySiteReport } from './accessibility_report.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanPage(url: string): { url: string; html: string } {
  return {
    url,
    html: '<html lang="en"><body><img src="/hero.jpg" alt="Hero"><h1>Title</h1><h2>Sub</h2><button>Click</button></body></html>',
  };
}

function dirtyPage(url: string): { url: string; html: string } {
  return {
    url,
    html: '<html><body><img src="/hero.jpg"><h1>Title</h1><h3>Skipped</h3><button><svg></svg></button><a href="/"><svg></svg></a></body></html>',
  };
}

// ── Basic report ─────────────────────────────────────────────────────────────

describe('buildAccessibilitySiteReport — basic', () => {
  it('returns report with site_id and page count', () => {
    const report = buildAccessibilitySiteReport('site-1', [cleanPage('/'), cleanPage('/about')]);
    assert.equal(report.site_id, 'site-1');
    assert.equal(report.total_pages, 2);
  });

  it('counts pages with issues', () => {
    const report = buildAccessibilitySiteReport('s1', [cleanPage('/'), dirtyPage('/bad')]);
    assert.equal(report.pages_with_issues, 1);
  });

  it('calculates total issues across pages', () => {
    const report = buildAccessibilitySiteReport('s1', [dirtyPage('/a'), dirtyPage('/b')]);
    assert.ok(report.total_issues > 0);
  });
});

// ── WCAG compliance ──────────────────────────────────────────────────────────

describe('buildAccessibilitySiteReport — WCAG', () => {
  it('reports AA compliant for clean pages', () => {
    const report = buildAccessibilitySiteReport('s1', [cleanPage('/'), cleanPage('/about')]);
    assert.equal(report.wcag_aa_compliant, true);
  });

  it('reports not AA compliant when high severity issues exist', () => {
    const report = buildAccessibilitySiteReport('s1', [dirtyPage('/')]);
    assert.equal(report.wcag_aa_compliant, false);
  });

  it('sets page wcag_level to failing for high severity', () => {
    const report = buildAccessibilitySiteReport('s1', [dirtyPage('/')]);
    assert.equal(report.pages[0]!.wcag_level, 'failing');
  });

  it('sets page wcag_level to AAA for clean page', () => {
    const report = buildAccessibilitySiteReport('s1', [cleanPage('/')]);
    assert.equal(report.pages[0]!.wcag_level, 'AAA');
  });
});

// ── Top issues ───────────────────────────────────────────────────────────────

describe('buildAccessibilitySiteReport — top issues', () => {
  it('returns top issues sorted by count desc', () => {
    const report = buildAccessibilitySiteReport('s1', [dirtyPage('/a'), dirtyPage('/b')]);
    assert.ok(report.top_issues.length > 0);
    for (let i = 1; i < report.top_issues.length; i++) {
      assert.ok(report.top_issues[i - 1]!.count >= report.top_issues[i]!.count);
    }
  });

  it('limits top issues to 5', () => {
    const report = buildAccessibilitySiteReport('s1', [dirtyPage('/')]);
    assert.ok(report.top_issues.length <= 5);
  });
});

// ── Page reports ─────────────────────────────────────────────────────────────

describe('buildAccessibilitySiteReport — page reports', () => {
  it('includes issues array per page', () => {
    const report = buildAccessibilitySiteReport('s1', [dirtyPage('/')]);
    assert.ok(report.pages[0]!.issues.length > 0);
  });

  it('includes manual review items per page', () => {
    const report = buildAccessibilitySiteReport('s1', [dirtyPage('/')]);
    assert.ok(report.pages[0]!.manual_review_items.length > 0);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('buildAccessibilitySiteReport — edge cases', () => {
  it('handles empty pages array', () => {
    const report = buildAccessibilitySiteReport('s1', []);
    assert.equal(report.total_pages, 0);
    assert.equal(report.total_issues, 0);
    assert.equal(report.wcag_aa_compliant, true);
  });

  it('handles page with empty HTML', () => {
    const report = buildAccessibilitySiteReport('s1', [{ url: '/', html: '' }]);
    assert.equal(report.total_pages, 1);
    assert.equal(report.pages[0]!.total_issues, 0);
  });
});
