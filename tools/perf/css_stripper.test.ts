/**
 * tools/perf/css_stripper.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripUnusedCSS, stripCSSFromHTML } from './css_stripper.ts';
import type { CoverageResult } from './coverage_tracer.ts';

// ── stripUnusedCSS ────────────────────────────────────────────────────────────

describe('stripUnusedCSS — basic removal', () => {
  it('removes a rule whose selector is in the unused list', () => {
    const css = `.foo { color: red; }\n.bar { display: none; }`;
    const { css: out, removedCount } = stripUnusedCSS(css, ['.foo']);
    assert.ok(!out.includes('.foo'), 'should remove .foo');
    assert.ok(out.includes('.bar'), 'should keep .bar');
    assert.equal(removedCount, 1);
  });

  it('keeps rules not in the unused list', () => {
    const css = `.used { font-size: 16px; }\n.unused { display: none; }`;
    const { css: out } = stripUnusedCSS(css, ['.unused']);
    assert.ok(out.includes('.used'));
    assert.ok(!out.includes('.unused'));
  });

  it('returns original CSS unchanged when unusedSelectors is empty', () => {
    const css = `.foo { color: red; }`;
    const { css: out, removedCount } = stripUnusedCSS(css, []);
    assert.equal(out, css);
    assert.equal(removedCount, 0);
  });

  it('removes multiple unused rules', () => {
    const css = `.a { } .b { } .c { } .d { }`;
    const { css: out, removedCount } = stripUnusedCSS(css, ['.a', '.c']);
    assert.ok(!out.includes('.a'));
    assert.ok(out.includes('.b'));
    assert.ok(!out.includes('.c'));
    assert.ok(out.includes('.d'));
    assert.equal(removedCount, 2);
  });

  it('tracks keptCount correctly', () => {
    const css = `.a { color: red; }\n.b { color: blue; }\n.c { color: green; }`;
    const { keptCount, removedCount } = stripUnusedCSS(css, ['.a']);
    assert.equal(keptCount, 2);
    assert.equal(removedCount, 1);
  });
});

describe('stripUnusedCSS — protected rules', () => {
  it('never removes @media rules', () => {
    const css = `@media (max-width: 768px) { .foo { display: none; } }`;
    const { css: out, removedCount } = stripUnusedCSS(css, ['.foo', '@media (max-width: 768px)']);
    assert.ok(out.includes('@media'), 'should preserve @media');
    assert.equal(removedCount, 0);
  });

  it('never removes @keyframes rules', () => {
    const css = `@keyframes slide { from { opacity: 0; } to { opacity: 1; } }`;
    const { css: out } = stripUnusedCSS(css, ['@keyframes slide', 'slide']);
    assert.ok(out.includes('@keyframes'), 'should preserve @keyframes');
  });

  it('never removes :root rules', () => {
    const css = `:root { --primary: #333; }`;
    const { css: out } = stripUnusedCSS(css, [':root']);
    assert.ok(out.includes(':root'), 'should preserve :root');
  });

  it('never removes rules containing CSS variables (--)', () => {
    const css = `.theme { --bg: white; --fg: black; }`;
    const { css: out } = stripUnusedCSS(css, ['.theme']);
    assert.ok(out.includes('.theme'), 'should preserve CSS variable blocks');
  });

  it('never removes @font-face rules', () => {
    const css = `@font-face { font-family: "MyFont"; src: url(f.woff2); }`;
    const { css: out } = stripUnusedCSS(css, ['@font-face']);
    assert.ok(out.includes('@font-face'));
  });
});

describe('stripUnusedCSS — compound selectors', () => {
  it('keeps a compound selector if ANY part is used', () => {
    // .used is used, .unused is not — keep the whole rule
    const css = `.used, .unused { color: red; }`;
    const { css: out, removedCount } = stripUnusedCSS(css, ['.unused']);
    // Should NOT remove because .used is not in unusedSet
    assert.equal(removedCount, 0);
  });

  it('removes compound selector only when ALL parts are unused', () => {
    const css = `.a, .b { font-size: 12px; }`;
    const { css: out, removedCount } = stripUnusedCSS(css, ['.a', '.b']);
    assert.equal(removedCount, 1);
    assert.ok(!out.includes('.a, .b'));
  });
});

// ── stripCSSFromHTML ──────────────────────────────────────────────────────────

function makeCoverageResult(unusedSelectors: string[]): CoverageResult {
  return {
    url:            'local://html',
    fetchedAt:      new Date().toISOString(),
    unusedCSS:      unusedSelectors.map((s) => ({ selector: s, source: `${s} { }` })),
    unusedJS:       [],
    lcpImage:       null,
    rawCSSCoverage: [],
    rawJSCoverage:  [],
  };
}

describe('stripCSSFromHTML', () => {
  it('strips unused selectors from <style> blocks in HTML', () => {
    const html = `<html><head>
<style>.used { color: red; } .unused { display: none; }</style>
</head><body><p class="used">hi</p></body></html>`;
    const cr = makeCoverageResult(['.unused']);
    const out = stripCSSFromHTML(html, cr);
    assert.ok(!out.includes('.unused { display: none; }') || out.includes('.unused { }') || !out.includes('.unused'));
    assert.ok(out.includes('.used'));
  });

  it('returns HTML unchanged when no unused selectors', () => {
    const html = `<html><head><style>.a { color: red; }</style></head><body></body></html>`;
    const cr = makeCoverageResult([]);
    const out = stripCSSFromHTML(html, cr);
    assert.equal(out, html);
  });

  it('preserves HTML structure outside <style> blocks', () => {
    const html = `<html><head><style>.rm { } </style></head><body><div class="rm">hi</div></body></html>`;
    const cr = makeCoverageResult(['.rm']);
    const out = stripCSSFromHTML(html, cr);
    assert.ok(out.includes('<body>'));
    assert.ok(out.includes('<div class="rm">hi</div>'));
  });

  it('handles multiple <style> blocks', () => {
    const html = `<html><head>
<style>.a { } .b { }</style>
<style>.c { } .d { }</style>
</head><body></body></html>`;
    const cr = makeCoverageResult(['.a', '.c']);
    const out = stripCSSFromHTML(html, cr);
    assert.ok(!out.match(/\.a\s*\{[^}]*\}/));
    assert.ok(!out.match(/\.c\s*\{[^}]*\}/));
    assert.ok(out.includes('.b'));
    assert.ok(out.includes('.d'));
  });

  it('returns HTML unchanged when no <style> blocks', () => {
    const html = `<html><head></head><body><p>Hello</p></body></html>`;
    const cr = makeCoverageResult(['.unused']);
    const out = stripCSSFromHTML(html, cr);
    assert.equal(out, html);
  });
});
