import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMultisiteFromHTML,
  detectMultisiteType,
  detectWPMultisite,
  type WPMultisiteConfig,
} from './wp_multisite_detector.js';

// ── Mock helpers ────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  return async (_url: string, _opts?: RequestInit) => ({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  }) as unknown as Response;
}

// ── detectMultisiteFromHTML ──────────────────────────────────────────────────

describe('detectMultisiteFromHTML', () => {
  it('returns true when network admin link present', () => {
    const html = '<a href="/wp-admin/network/">Network Admin</a>';
    assert.equal(detectMultisiteFromHTML(html, 'https://x.com'), true);
  });

  it('returns true when admin-bar-network id present', () => {
    const html = '<li id="wp-admin-bar-network-admin">Network</li>';
    assert.equal(detectMultisiteFromHTML(html, 'https://x.com'), true);
  });

  it('returns true when generator tag contains multisite', () => {
    const html = '<meta name="generator" content="WordPress Multisite 6.4">';
    assert.equal(detectMultisiteFromHTML(html, 'https://x.com'), true);
  });

  it('returns true when wp-signup.php present', () => {
    const html = '<a href="https://x.com/wp-signup.php">Sign Up</a>';
    assert.equal(detectMultisiteFromHTML(html, 'https://x.com'), true);
  });

  it('returns true when network-admin class present', () => {
    const html = '<div class="network-admin-panel">Menu</div>';
    assert.equal(detectMultisiteFromHTML(html, 'https://x.com'), true);
  });

  it('returns false when no indicators', () => {
    const html = '<html><head><title>Normal WP</title></head><body>Hello</body></html>';
    assert.equal(detectMultisiteFromHTML(html, 'https://x.com'), false);
  });

  it('returns false for empty string', () => {
    assert.equal(detectMultisiteFromHTML('', ''), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => detectMultisiteFromHTML(null as any, null as any));
  });
});

// ── detectMultisiteType ─────────────────────────────────────────────────────

describe('detectMultisiteType', () => {
  it('returns subdirectory for path-based subsites', () => {
    const result = detectMultisiteType('https://example.com', [
      'https://example.com/blog/',
      'https://example.com/shop/',
    ]);
    assert.equal(result, 'subdirectory');
  });

  it('returns subdomain for subdomain subsites', () => {
    const result = detectMultisiteType('https://example.com', [
      'https://blog.example.com',
      'https://shop.example.com',
    ]);
    assert.equal(result, 'subdomain');
  });

  it('returns none for single site', () => {
    assert.equal(detectMultisiteType('https://example.com', []), 'none');
  });

  it('returns none when no subsites provided', () => {
    assert.equal(detectMultisiteType('https://example.com', []), 'none');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => detectMultisiteType(null as any, null as any));
  });
});

// ── detectWPMultisite ───────────────────────────────────────────────────────

describe('detectWPMultisite', () => {
  it('returns is_multisite=false on 404', async () => {
    const result = await detectWPMultisite('https://x.com', 'user', 'pass', {
      fetchFn: mockFetch(404, {}),
    });
    assert.equal(result.is_multisite, false);
  });

  it('returns is_multisite=false on error', async () => {
    const result = await detectWPMultisite('https://x.com', 'user', 'pass', {
      fetchFn: async () => { throw new Error('network'); },
    });
    assert.equal(result.is_multisite, false);
  });

  it('parses subsites correctly', async () => {
    const sites = [
      { id: 1, url: 'https://x.com', name: 'Main Site' },
      { id: 2, url: 'https://blog.x.com', name: 'Blog' },
    ];
    const result = await detectWPMultisite('https://x.com', 'user', 'pass', {
      fetchFn: mockFetch(200, sites),
    });
    assert.equal(result.is_multisite, true);
    assert.equal(result.subsites.length, 2);
    assert.equal(result.subsites[0].name, 'Main Site');
    assert.equal(result.subsites[1].name, 'Blog');
  });

  it('sets subsite_count correctly', async () => {
    const sites = [
      { id: 1, url: 'https://x.com', name: 'Main' },
      { id: 2, url: 'https://a.x.com', name: 'A' },
      { id: 3, url: 'https://b.x.com', name: 'B' },
    ];
    const result = await detectWPMultisite('https://x.com', 'user', 'pass', {
      fetchFn: mockFetch(200, sites),
    });
    assert.equal(result.subsite_count, 3);
  });

  it('first subsite is marked as main', async () => {
    const sites = [{ id: 1, url: 'https://x.com', name: 'Main' }];
    const result = await detectWPMultisite('https://x.com', 'user', 'pass', {
      fetchFn: mockFetch(200, sites),
    });
    assert.equal(result.subsites[0].is_main, true);
  });

  it('detects subdomain type from parsed sites', async () => {
    const sites = [
      { id: 1, url: 'https://x.com', name: 'Main' },
      { id: 2, url: 'https://blog.x.com', name: 'Blog' },
    ];
    const result = await detectWPMultisite('https://x.com', 'user', 'pass', {
      fetchFn: mockFetch(200, sites),
    });
    assert.equal(result.multisite_type, 'subdomain');
  });

  it('returns is_multisite=false for empty array', async () => {
    const result = await detectWPMultisite('https://x.com', 'user', 'pass', {
      fetchFn: mockFetch(200, []),
    });
    assert.equal(result.is_multisite, false);
  });

  it('fetchFn is injectable', async () => {
    let calledUrl = '';
    await detectWPMultisite('https://x.com', 'user', 'pass', {
      fetchFn: async (url) => { calledUrl = url as string; return { ok: false, status: 404, json: async () => ({}) } as Response; },
    });
    assert.ok(calledUrl.includes('/wp-json/wp/v2/sites'));
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => detectWPMultisite(null as any, null as any, null as any));
  });
});
