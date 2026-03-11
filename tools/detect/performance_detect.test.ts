/**
 * tools/detect/performance_detect.test.ts
 *
 * Tests for performance detectors.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRenderBlockingScripts,
  detectMissingLazyImages,
  detectMissingFontDisplay,
  detectAllPerformanceIssues,
} from './performance_detect.js';

const URL = 'https://example.com/page';

// ── detectRenderBlockingScripts ──────────────────────────────────────────────

describe('detectRenderBlockingScripts', () => {
  it('detects sync script in <head> with src', () => {
    const html = '<html><head><script src="/js/app.js"></script></head><body></body></html>';
    const issues = detectRenderBlockingScripts(html, URL);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'DEFER_SCRIPT');
    assert.ok(issues[0].element.includes('app.js'));
    assert.ok(issues[0].fix_hint.includes('defer'));
  });

  it('skips scripts with defer attribute', () => {
    const html = '<html><head><script src="/js/app.js" defer></script></head></html>';
    const issues = detectRenderBlockingScripts(html, URL);
    assert.equal(issues.length, 0);
  });

  it('skips scripts with async attribute', () => {
    const html = '<html><head><script async src="/js/analytics.js"></script></head></html>';
    const issues = detectRenderBlockingScripts(html, URL);
    assert.equal(issues.length, 0);
  });

  it('skips type="module" scripts (deferred by default)', () => {
    const html = '<html><head><script type="module" src="/js/mod.js"></script></head></html>';
    const issues = detectRenderBlockingScripts(html, URL);
    assert.equal(issues.length, 0);
  });

  it('ignores scripts in <body> (not render-blocking)', () => {
    const html = '<html><head></head><body><script src="/js/body.js"></script></body></html>';
    const issues = detectRenderBlockingScripts(html, URL);
    assert.equal(issues.length, 0);
  });

  it('detects multiple blocking scripts', () => {
    const html = `<html><head>
      <script src="/js/a.js"></script>
      <script src="/js/b.js"></script>
      <script src="/js/c.js" defer></script>
    </head></html>`;
    const issues = detectRenderBlockingScripts(html, URL);
    assert.equal(issues.length, 2);
  });

  it('returns empty for HTML without <head>', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const issues = detectRenderBlockingScripts(html, URL);
    assert.equal(issues.length, 0);
  });
});

// ── detectMissingLazyImages ──────────────────────────────────────────────────

describe('detectMissingLazyImages', () => {
  it('detects img without loading attribute', () => {
    const html = '<img src="/img/hero.jpg" alt="Hero">';
    const issues = detectMissingLazyImages(html, URL);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'LAZY_IMAGE');
    assert.ok(issues[0].element.includes('hero.jpg'));
  });

  it('skips img with loading="lazy"', () => {
    const html = '<img src="/img/hero.jpg" loading="lazy" alt="Hero">';
    const issues = detectMissingLazyImages(html, URL);
    assert.equal(issues.length, 0);
  });

  it('skips img with loading="eager"', () => {
    const html = '<img src="/img/hero.jpg" loading="eager" alt="Hero">';
    const issues = detectMissingLazyImages(html, URL);
    assert.equal(issues.length, 0);
  });

  it('detects multiple images missing lazy loading', () => {
    const html = `
      <img src="/a.jpg" alt="A">
      <img src="/b.jpg" loading="lazy" alt="B">
      <img src="/c.jpg" alt="C">`;
    const issues = detectMissingLazyImages(html, URL);
    assert.equal(issues.length, 2);
  });
});

// ── detectMissingFontDisplay ─────────────────────────────────────────────────

describe('detectMissingFontDisplay', () => {
  it('detects @font-face without font-display', () => {
    const html = `<html><head><style>
      @font-face { font-family: 'Custom'; src: url('/font.woff2'); }
    </style></head></html>`;
    const issues = detectMissingFontDisplay(html, URL);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'FONT_DISPLAY');
    assert.ok(issues[0].fix_hint.includes('font-display'));
  });

  it('skips @font-face that has font-display: swap', () => {
    const html = `<style>
      @font-face { font-family: 'Custom'; src: url('/font.woff2'); font-display: swap; }
    </style>`;
    const issues = detectMissingFontDisplay(html, URL);
    assert.equal(issues.length, 0);
  });

  it('detects multiple @font-face blocks missing font-display', () => {
    const html = `<style>
      @font-face { font-family: 'A'; src: url('/a.woff2'); }
      @font-face { font-family: 'B'; src: url('/b.woff2'); font-display: swap; }
      @font-face { font-family: 'C'; src: url('/c.woff2'); }
    </style>`;
    const issues = detectMissingFontDisplay(html, URL);
    assert.equal(issues.length, 2);
  });

  it('returns empty when no <style> blocks', () => {
    const html = '<html><head></head><body></body></html>';
    const issues = detectMissingFontDisplay(html, URL);
    assert.equal(issues.length, 0);
  });
});

// ── detectAllPerformanceIssues ───────────────────────────────────────────────

describe('detectAllPerformanceIssues', () => {
  it('combines all detector results', () => {
    const html = `<html><head>
      <script src="/js/app.js"></script>
      <style>@font-face { font-family: 'X'; src: url('/x.woff2'); }</style>
    </head><body>
      <img src="/hero.jpg" alt="Hero">
    </body></html>`;
    const issues = detectAllPerformanceIssues(html, URL);
    const types = issues.map((i) => i.issue_type);
    assert.ok(types.includes('DEFER_SCRIPT'));
    assert.ok(types.includes('LAZY_IMAGE'));
    assert.ok(types.includes('FONT_DISPLAY'));
  });

  it('returns empty for clean HTML', () => {
    const html = `<html><head>
      <script src="/app.js" defer></script>
      <style>@font-face { font-family: 'X'; src: url('/x.woff2'); font-display: swap; }</style>
    </head><body>
      <img src="/hero.jpg" loading="lazy" alt="Hero">
    </body></html>`;
    const issues = detectAllPerformanceIssues(html, URL);
    assert.equal(issues.length, 0);
  });

  it('sets url on every issue', () => {
    const html = '<img src="/a.jpg" alt="A"><img src="/b.jpg" alt="B">';
    const issues = detectAllPerformanceIssues(html, URL);
    for (const issue of issues) {
      assert.equal(issue.url, URL);
    }
  });
});
