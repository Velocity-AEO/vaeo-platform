/**
 * tools/wordpress/wp_detect.test.ts
 *
 * Tests for WordPress issue detector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectWPIssues, type WPIssue } from './wp_detect.js';

const URL = 'https://example.com/sample-page/';

// ── Schema detection ─────────────────────────────────────────────────────────

describe('detectWPIssues — schema', () => {
  it('detects missing JSON-LD schema', () => {
    const html = '<html><head><title>Test</title><meta name="description" content="desc"></head><body><img src="/a.jpg" alt="A" width="100" height="100"></body></html>';
    const issues = detectWPIssues(html, URL);
    const schema = issues.filter((i) => i.issue_type === 'SCHEMA_MISSING');
    assert.equal(schema.length, 1);
    assert.equal(schema[0].category, 'schema');
  });

  it('detects invalid JSON-LD', () => {
    const html = '<html><head><title>Test</title><meta name="description" content="desc"><script type="application/ld+json">{invalid json</script></head><body><img src="/a.jpg" alt="A" width="100" height="100"></body></html>';
    const issues = detectWPIssues(html, URL);
    const invalid = issues.filter((i) => i.issue_type === 'SCHEMA_INVALID');
    assert.equal(invalid.length, 1);
  });

  it('skips valid JSON-LD', () => {
    const html = '<html><head><title>Test</title><meta name="description" content="desc"><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><img src="/a.jpg" alt="A" width="100" height="100"></body></html>';
    const issues = detectWPIssues(html, URL);
    const schema = issues.filter((i) => i.issue_type === 'SCHEMA_MISSING' || i.issue_type === 'SCHEMA_INVALID');
    assert.equal(schema.length, 0);
  });
});

// ── Title/meta detection ─────────────────────────────────────────────────────

describe('detectWPIssues — title/meta', () => {
  it('detects missing title', () => {
    const html = '<html><head><meta name="description" content="desc"><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><img src="/a.jpg" alt="A" width="100" height="100"></body></html>';
    const issues = detectWPIssues(html, URL);
    const title = issues.filter((i) => i.issue_type === 'TITLE_MISSING');
    assert.equal(title.length, 1);
    assert.equal(title[0].category, 'metadata');
  });

  it('detects long title (> 60 chars)', () => {
    const longTitle = 'A'.repeat(65);
    const html = `<html><head><title>${longTitle}</title><meta name="description" content="desc"><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><img src="/a.jpg" alt="A" width="100" height="100"></body></html>`;
    const issues = detectWPIssues(html, URL);
    const long = issues.filter((i) => i.issue_type === 'TITLE_LONG');
    assert.equal(long.length, 1);
  });

  it('detects missing meta description', () => {
    const html = '<html><head><title>Test</title><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><img src="/a.jpg" alt="A" width="100" height="100"></body></html>';
    const issues = detectWPIssues(html, URL);
    const meta = issues.filter((i) => i.issue_type === 'META_DESC_MISSING');
    assert.equal(meta.length, 1);
  });

  it('detects long meta description (> 155 chars)', () => {
    const longDesc = 'B'.repeat(160);
    const html = `<html><head><title>Test</title><meta name="description" content="${longDesc}"><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><img src="/a.jpg" alt="A" width="100" height="100"></body></html>`;
    const issues = detectWPIssues(html, URL);
    const long = issues.filter((i) => i.issue_type === 'META_DESC_LONG');
    assert.equal(long.length, 1);
  });
});

// ── Image detection ──────────────────────────────────────────────────────────

describe('detectWPIssues — images', () => {
  it('detects img missing alt', () => {
    const html = '<html><head><title>Test</title><meta name="description" content="desc"><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><img src="/hero.jpg"></body></html>';
    const issues = detectWPIssues(html, URL);
    const alt = issues.filter((i) => i.issue_type === 'IMG_MISSING_ALT');
    assert.ok(alt.length >= 1);
    assert.equal(alt[0].category, 'images');
  });

  it('detects img missing dimensions', () => {
    const html = '<html><head><title>Test</title><meta name="description" content="desc"><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><img src="/hero.jpg" alt="Hero"></body></html>';
    const issues = detectWPIssues(html, URL);
    const dims = issues.filter((i) => i.issue_type === 'IMG_MISSING_DIMENSIONS');
    assert.ok(dims.length >= 1);
  });

  it('skips img with alt, width, and height', () => {
    const html = '<html><head><title>Test</title><meta name="description" content="desc"><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><img src="/hero.jpg" alt="Hero" width="800" height="600"></body></html>';
    const issues = detectWPIssues(html, URL);
    const imgIssues = issues.filter((i) => i.category === 'images');
    assert.equal(imgIssues.length, 0);
  });
});

// ── Performance detection ────────────────────────────────────────────────────

describe('detectWPIssues — performance', () => {
  it('detects render-blocking scripts', () => {
    const html = '<html><head><title>Test</title><meta name="description" content="desc"><script type="application/ld+json">{"@type":"WebPage"}</script><script src="/app.js"></script></head><body><img src="/a.jpg" alt="A" width="100" height="100"></body></html>';
    const issues = detectWPIssues(html, URL);
    const scripts = issues.filter((i) => i.issue_type === 'DEFER_SCRIPT');
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].category, 'performance');
  });

  it('detects missing lazy images', () => {
    const html = '<html><head><title>Test</title><meta name="description" content="desc"><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><img src="/hero.jpg" alt="Hero" width="800" height="600"></body></html>';
    const issues = detectWPIssues(html, URL);
    const lazy = issues.filter((i) => i.issue_type === 'LAZY_IMAGE');
    assert.equal(lazy.length, 1);
  });
});

// ── Combined ─────────────────────────────────────────────────────────────────

describe('detectWPIssues — combined', () => {
  it('returns empty for clean HTML', () => {
    const html = `<html><head>
      <title>Good Title</title>
      <meta name="description" content="A good description here.">
      <script type="application/ld+json">{"@type":"WebPage"}</script>
      <script src="/app.js" defer></script>
    </head><body>
      <img src="/hero.jpg" alt="Hero" width="800" height="600" loading="lazy">
    </body></html>`;
    const issues = detectWPIssues(html, URL);
    assert.equal(issues.length, 0);
  });

  it('detects multiple issue types simultaneously', () => {
    const html = '<html><head><script src="/app.js"></script></head><body><img src="/hero.jpg"></body></html>';
    const issues = detectWPIssues(html, URL);
    const types = new Set(issues.map((i) => i.issue_type));
    // Should detect at least: SCHEMA_MISSING, TITLE_MISSING, META_DESC_MISSING, DEFER_SCRIPT, IMG_MISSING_ALT
    assert.ok(types.has('SCHEMA_MISSING'));
    assert.ok(types.has('TITLE_MISSING'));
    assert.ok(types.has('META_DESC_MISSING'));
    assert.ok(types.has('DEFER_SCRIPT'));
    assert.ok(types.has('IMG_MISSING_ALT'));
  });
});
