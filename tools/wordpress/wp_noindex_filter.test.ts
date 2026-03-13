import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkMetaRobotsNoindex,
  checkXRobotsNoindex,
  detectNoindexSignal,
  checkPageNoindex,
  filterNoindexPages,
} from './wp_noindex_filter.js';

// ── checkMetaRobotsNoindex ──────────────────────────────────────────────────

describe('checkMetaRobotsNoindex', () => {
  it('returns true when noindex in meta tag', () => {
    const html = '<html><head><meta name="robots" content="noindex, nofollow"></head></html>';
    assert.equal(checkMetaRobotsNoindex(html), true);
  });

  it('returns false when index in meta tag', () => {
    const html = '<html><head><meta name="robots" content="index, follow"></head></html>';
    assert.equal(checkMetaRobotsNoindex(html), false);
  });

  it('is case-insensitive', () => {
    const html = '<html><head><meta name="robots" content="NOINDEX"></head></html>';
    assert.equal(checkMetaRobotsNoindex(html), true);
  });

  it('returns false when no meta robots tag', () => {
    const html = '<html><head><title>Hello</title></head></html>';
    assert.equal(checkMetaRobotsNoindex(html), false);
  });

  it('handles content before name attribute order', () => {
    const html = '<html><head><meta content="noindex" name="robots"></head></html>';
    assert.equal(checkMetaRobotsNoindex(html), true);
  });

  it('returns false for empty string', () => {
    assert.equal(checkMetaRobotsNoindex(''), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => checkMetaRobotsNoindex(null as any));
  });
});

// ── checkXRobotsNoindex ─────────────────────────────────────────────────────

describe('checkXRobotsNoindex', () => {
  it('returns true when noindex in header', () => {
    assert.equal(checkXRobotsNoindex({ 'X-Robots-Tag': 'noindex' }), true);
  });

  it('returns false when header absent', () => {
    assert.equal(checkXRobotsNoindex({ 'Content-Type': 'text/html' }), false);
  });

  it('is case-insensitive for header name', () => {
    assert.equal(checkXRobotsNoindex({ 'x-robots-tag': 'noindex' }), true);
  });

  it('is case-insensitive for header value', () => {
    assert.equal(checkXRobotsNoindex({ 'X-Robots-Tag': 'NOINDEX, NOFOLLOW' }), true);
  });

  it('returns false for empty headers', () => {
    assert.equal(checkXRobotsNoindex({}), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => checkXRobotsNoindex(null as any));
  });
});

// ── detectNoindexSignal ─────────────────────────────────────────────────────

describe('detectNoindexSignal', () => {
  it('returns meta_robots when only meta tag', () => {
    const html = '<meta name="robots" content="noindex">';
    assert.equal(detectNoindexSignal(html, {}), 'meta_robots');
  });

  it('returns x_robots_tag when only header', () => {
    assert.equal(detectNoindexSignal('', { 'X-Robots-Tag': 'noindex' }), 'x_robots_tag');
  });

  it('returns both when both present', () => {
    const html = '<meta name="robots" content="noindex">';
    assert.equal(detectNoindexSignal(html, { 'X-Robots-Tag': 'noindex' }), 'both');
  });

  it('returns none when neither present', () => {
    assert.equal(detectNoindexSignal('<html></html>', {}), 'none');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => detectNoindexSignal(null as any, null as any));
  });
});

// ── checkPageNoindex ────────────────────────────────────────────────────────

describe('checkPageNoindex', () => {
  it('returns is_noindex=true for noindex page', async () => {
    const result = await checkPageNoindex(
      'https://x.com/',
      '<meta name="robots" content="noindex">',
      {},
    );
    assert.equal(result.is_noindex, true);
  });

  it('returns is_noindex=false for indexable page', async () => {
    const result = await checkPageNoindex('https://x.com/', '<html></html>', {});
    assert.equal(result.is_noindex, false);
  });
});

// ── filterNoindexPages ──────────────────────────────────────────────────────

describe('filterNoindexPages', () => {
  it('removes noindex pages', () => {
    const pages = [
      { url: 'https://x.com/a', html: '<meta name="robots" content="noindex">', headers: {} },
      { url: 'https://x.com/b', html: '<html></html>', headers: {} },
    ];
    const result = filterNoindexPages(pages, { logFn: () => {} });
    assert.equal(result.length, 1);
    assert.equal(result[0].url, 'https://x.com/b');
  });

  it('keeps indexable pages', () => {
    const pages = [
      { url: 'https://x.com/a', html: '<html></html>', headers: {} },
    ];
    const result = filterNoindexPages(pages, { logFn: () => {} });
    assert.equal(result.length, 1);
  });

  it('logs each skipped page', () => {
    const logged: string[] = [];
    const pages = [
      { url: 'https://x.com/noindex', html: '<meta name="robots" content="noindex">', headers: {} },
    ];
    filterNoindexPages(pages, { logFn: (msg) => logged.push(msg) });
    assert.ok(logged.some(m => m.includes('https://x.com/noindex')));
  });

  it('handles empty array', () => {
    const result = filterNoindexPages([], { logFn: () => {} });
    assert.deepEqual(result, []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => filterNoindexPages(null as any));
  });
});
