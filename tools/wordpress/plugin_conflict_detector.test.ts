/**
 * tools/wordpress/plugin_conflict_detector.test.ts
 *
 * Tests for SEO plugin conflict detection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectActivePlugins,
  detectSEOCoverage,
  buildSafeWriteList,
  type SEOCoverage,
} from './plugin_conflict_detector.js';

// ── detectActivePlugins ──────────────────────────────────────────────────────

describe('detectActivePlugins — yoast', () => {
  it('detects wordpress-seo as yoast', () => {
    const r = detectActivePlugins(['wordpress-seo']);
    assert.equal(r.yoast, true);
    assert.deepEqual(r.detected, ['yoast']);
  });

  it('detects wordpress-seo-premium as yoast', () => {
    const r = detectActivePlugins(['wordpress-seo-premium']);
    assert.equal(r.yoast, true);
  });
});

describe('detectActivePlugins — rankmath', () => {
  it('detects seo-by-rank-math', () => {
    const r = detectActivePlugins(['seo-by-rank-math']);
    assert.equal(r.rankmath, true);
    assert.deepEqual(r.detected, ['rankmath']);
  });

  it('detects seo-by-rank-math-pro', () => {
    const r = detectActivePlugins(['seo-by-rank-math-pro']);
    assert.equal(r.rankmath, true);
  });
});

describe('detectActivePlugins — aioseo', () => {
  it('detects all-in-one-seo-pack', () => {
    const r = detectActivePlugins(['all-in-one-seo-pack']);
    assert.equal(r.aioseo, true);
    assert.deepEqual(r.detected, ['aioseo']);
  });
});

describe('detectActivePlugins — conflict', () => {
  it('conflict_risk true when multiple detected', () => {
    const r = detectActivePlugins(['wordpress-seo', 'seo-by-rank-math']);
    assert.equal(r.conflict_risk, true);
    assert.equal(r.detected.length, 2);
  });

  it('conflict_risk false with one plugin', () => {
    const r = detectActivePlugins(['wordpress-seo']);
    assert.equal(r.conflict_risk, false);
  });

  it('conflict_risk false with none', () => {
    const r = detectActivePlugins([]);
    assert.equal(r.conflict_risk, false);
    assert.equal(r.detected.length, 0);
  });

  it('detects all three simultaneously', () => {
    const r = detectActivePlugins(['wordpress-seo', 'seo-by-rank-math', 'all-in-one-seo-pack']);
    assert.equal(r.detected.length, 3);
    assert.equal(r.conflict_risk, true);
  });

  it('ignores unrelated plugins', () => {
    const r = detectActivePlugins(['woocommerce', 'akismet', 'contact-form-7']);
    assert.equal(r.detected.length, 0);
  });
});

// ── detectSEOCoverage ────────────────────────────────────────────────────────

const YOAST_HTML = `
<html>
<head>
<!-- This site is optimized with the Yoast SEO plugin -->
<title>My Shop</title>
<meta name="description" content="Best shop" />
<meta property="og:title" content="My Shop" />
<meta name="twitter:card" content="summary" />
<script type="application/ld+json">{"@type":"Organization"}</script>
<link rel="canonical" href="https://shop.com/" />
</head>
</html>`;

const PARTIAL_HTML = `
<html>
<head>
<!-- This site is optimized by Rank Math SEO -->
<title>My Shop</title>
<meta property="og:title" content="My Shop" />
</head>
</html>`;

describe('detectSEOCoverage', () => {
  it('detects all signals with yoast', () => {
    const plugins = detectActivePlugins(['wordpress-seo']);
    const cov = detectSEOCoverage(YOAST_HTML, plugins);
    assert.equal(cov.title_tag, 'yoast');
    assert.equal(cov.meta_description, 'yoast');
    assert.equal(cov.og_tags, 'yoast');
    assert.equal(cov.json_ld_schema, 'yoast');
    assert.equal(cov.canonical, 'yoast');
  });

  it('detects missing meta description', () => {
    const plugins = detectActivePlugins(['seo-by-rank-math']);
    const cov = detectSEOCoverage(PARTIAL_HTML, plugins);
    assert.equal(cov.meta_description, null);
  });

  it('detects missing twitter tags', () => {
    const plugins = detectActivePlugins(['seo-by-rank-math']);
    const cov = detectSEOCoverage(PARTIAL_HTML, plugins);
    assert.equal(cov.twitter_tags, null);
  });

  it('detects missing canonical', () => {
    const plugins = detectActivePlugins(['seo-by-rank-math']);
    const cov = detectSEOCoverage(PARTIAL_HTML, plugins);
    assert.equal(cov.canonical, null);
  });

  it('returns all null for empty HTML', () => {
    const plugins = detectActivePlugins([]);
    const cov = detectSEOCoverage('', plugins);
    assert.equal(cov.title_tag, null);
    assert.equal(cov.meta_description, null);
  });

  it('attributes to rankmath when rank math comment present', () => {
    const plugins = detectActivePlugins(['seo-by-rank-math']);
    const cov = detectSEOCoverage(PARTIAL_HTML, plugins);
    assert.equal(cov.title_tag, 'rankmath');
    assert.equal(cov.og_tags, 'rankmath');
  });
});

// ── buildSafeWriteList ───────────────────────────────────────────────────────

describe('buildSafeWriteList', () => {
  it('returns only null coverage fields', () => {
    const cov: SEOCoverage = {
      title_tag: 'yoast',
      meta_description: null,
      og_tags: 'yoast',
      twitter_tags: null,
      json_ld_schema: 'yoast',
      canonical: null,
    };
    const safe = buildSafeWriteList(cov);
    assert.deepEqual(safe, ['meta_description', 'twitter_tags', 'canonical']);
  });

  it('returns empty array if all covered', () => {
    const cov: SEOCoverage = {
      title_tag: 'yoast',
      meta_description: 'yoast',
      og_tags: 'yoast',
      twitter_tags: 'yoast',
      json_ld_schema: 'yoast',
      canonical: 'yoast',
    };
    assert.deepEqual(buildSafeWriteList(cov), []);
  });

  it('returns all signals if none covered', () => {
    const cov: SEOCoverage = {
      title_tag: null,
      meta_description: null,
      og_tags: null,
      twitter_tags: null,
      json_ld_schema: null,
      canonical: null,
    };
    assert.equal(buildSafeWriteList(cov).length, 6);
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('plugin_conflict_detector — never throws', () => {
  it('detectActivePlugins with empty array', () => {
    const r = detectActivePlugins([]);
    assert.ok(r);
  });

  it('detectSEOCoverage with empty inputs', () => {
    const r = detectSEOCoverage('', { yoast: false, rankmath: false, aioseo: false, detected: [], conflict_risk: false });
    assert.ok(r);
  });

  it('buildSafeWriteList with all null coverage', () => {
    const r = buildSafeWriteList({ title_tag: null, meta_description: null, og_tags: null, twitter_tags: null, json_ld_schema: null, canonical: null });
    assert.ok(Array.isArray(r));
  });
});
