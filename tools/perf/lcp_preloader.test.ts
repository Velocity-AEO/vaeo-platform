/**
 * tools/perf/lcp_preloader.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { injectLCPPreload } from './lcp_preloader.ts';

// ── injectLCPPreload ──────────────────────────────────────────────────────────

const SRC = 'https://cdn.example.com/hero.jpg';

describe('injectLCPPreload — injection position', () => {
  it('injects after <meta charset> when present', () => {
    const html = `<html><head><meta charset="utf-8"><title>T</title></head><body></body></html>`;
    const out  = injectLCPPreload(html, { src: SRC });
    const charsetIdx = out.indexOf('<meta charset="utf-8">');
    const preloadIdx = out.indexOf(`<link rel="preload"`);
    assert.ok(preloadIdx > charsetIdx, 'preload should come after charset meta');
  });

  it('falls back to after <head> when no charset meta', () => {
    const html = `<html><head><title>T</title></head><body></body></html>`;
    const out  = injectLCPPreload(html, { src: SRC });
    const headIdx    = out.indexOf('<head>');
    const preloadIdx = out.indexOf(`<link rel="preload"`);
    assert.ok(preloadIdx > headIdx, 'preload should come after <head>');
    assert.ok(preloadIdx < out.indexOf('<title>'), 'preload should come before <title>');
  });

  it('falls back to prepend when no <head> at all', () => {
    const html = `<p>bare</p>`;
    const out  = injectLCPPreload(html, { src: SRC });
    assert.ok(out.startsWith('<link rel="preload"'), 'should prepend when no head');
  });
});

describe('injectLCPPreload — tag attributes', () => {
  it('injects correct rel="preload" and as="image"', () => {
    const html = `<html><head><meta charset="utf-8"></head><body></body></html>`;
    const out  = injectLCPPreload(html, { src: SRC });
    assert.ok(out.includes('rel="preload"'));
    assert.ok(out.includes('as="image"'));
  });

  it('includes the correct href', () => {
    const html = `<html><head><meta charset="utf-8"></head><body></body></html>`;
    const out  = injectLCPPreload(html, { src: SRC });
    assert.ok(out.includes(`href="${SRC}"`));
  });
});

describe('injectLCPPreload — idempotency', () => {
  it('does not double-inject if preload already exists (rel first)', () => {
    const html = `<html><head><link rel="preload" as="image" href="${SRC}"></head><body></body></html>`;
    const out  = injectLCPPreload(html, { src: SRC });
    const count = (out.match(/rel="preload"/g) ?? []).length;
    assert.equal(count, 1, 'should not duplicate preload tag');
  });

  it('does not double-inject if preload already exists (href first)', () => {
    const html = `<html><head><link href="${SRC}" rel="preload" as="image"></head><body></body></html>`;
    const out  = injectLCPPreload(html, { src: SRC });
    const count = (out.match(/rel="preload"/g) ?? []).length;
    assert.equal(count, 1);
  });

  it('does inject when a different src already has a preload', () => {
    const otherSrc = 'https://cdn.example.com/other.jpg';
    const html = `<html><head><link rel="preload" as="image" href="${otherSrc}"></head><body></body></html>`;
    const out  = injectLCPPreload(html, { src: SRC });
    assert.ok(out.includes(`href="${SRC}"`), 'should inject new preload');
  });
});

describe('injectLCPPreload — edge cases', () => {
  it('returns HTML unchanged when src is empty', () => {
    const html = `<html><head></head><body></body></html>`;
    const out  = injectLCPPreload(html, { src: '' });
    assert.equal(out, html);
  });

  it('handles <head> with attributes (e.g. <head data-x="1">)', () => {
    const html = `<html><head data-x="1"><title>T</title></head><body></body></html>`;
    const out  = injectLCPPreload(html, { src: SRC });
    assert.ok(out.includes('rel="preload"'), 'should inject into head with attrs');
  });
});
