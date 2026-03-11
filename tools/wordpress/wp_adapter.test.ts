/**
 * tools/wordpress/wp_adapter.test.ts
 *
 * Tests for WordPress REST API adapter.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getWPPage,
  getWPThemeFiles,
  updateWPPost,
  injectWPSnippet,
  _injectFetch,
  _resetInjections,
  type WPCredentials,
} from './wp_adapter.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const creds: WPCredentials = {
  siteUrl:     'https://example.com',
  username:    'admin',
  appPassword: 'xxxx xxxx xxxx',
};

function mockFetch(responses: Record<string, { status: number; body: unknown }>): void {
  _injectFetch(async (url: string, init?: RequestInit) => {
    // Find matching response by URL substring
    for (const [pattern, resp] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(resp.body), {
          status: resp.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return new Response('Not Found', { status: 404 });
  });
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => _resetInjections());
afterEach(() => _resetInjections());

// ── getWPPage ────────────────────────────────────────────────────────────────

describe('getWPPage', () => {
  it('returns rendered HTML for a page slug', async () => {
    mockFetch({
      'wp/v2/pages?slug=about': {
        status: 200,
        body: [{ content: { rendered: '<p>About us</p>' } }],
      },
    });
    const html = await getWPPage(creds, '/about/');
    assert.equal(html, '<p>About us</p>');
  });

  it('falls back to posts if page not found', async () => {
    mockFetch({
      'wp/v2/pages?slug=hello': { status: 200, body: [] },
      'wp/v2/posts?slug=hello': {
        status: 200,
        body: [{ content: { rendered: '<p>Hello post</p>' } }],
      },
    });
    const html = await getWPPage(creds, '/blog/hello/');
    assert.equal(html, '<p>Hello post</p>');
  });

  it('returns empty string for empty path', async () => {
    const html = await getWPPage(creds, '');
    assert.equal(html, '');
  });

  it('returns empty string when API returns 404', async () => {
    mockFetch({
      'wp/v2/pages': { status: 404, body: {} },
      'wp/v2/posts': { status: 404, body: {} },
    });
    const html = await getWPPage(creds, '/missing/');
    assert.equal(html, '');
  });
});

// ── getWPThemeFiles ──────────────────────────────────────────────────────────

describe('getWPThemeFiles', () => {
  it('returns empty array when no active theme found', async () => {
    mockFetch({
      'wp/v2/themes?status=active': { status: 200, body: [] },
    });
    const files = await getWPThemeFiles(creds);
    assert.equal(files.length, 0);
  });

  it('returns empty array on API error', async () => {
    mockFetch({
      'wp/v2/themes?status=active': { status: 401, body: {} },
    });
    const files = await getWPThemeFiles(creds);
    assert.equal(files.length, 0);
  });
});

// ── updateWPPost ─────────────────────────────────────────────────────────────

describe('updateWPPost', () => {
  it('updates a page with standard fields', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    _injectFetch(async (url: string, init?: RequestInit) => {
      if (url.includes('/pages/42?_fields=id')) {
        return new Response(JSON.stringify({ id: 42 }), { status: 200 });
      }
      if (url.includes('/pages/42') && init?.method === 'POST') {
        capturedBody = JSON.parse(init?.body as string ?? '{}');
        return new Response(JSON.stringify({ id: 42 }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    await updateWPPost(creds, 42, { title: 'New Title' });
    assert.ok(capturedBody);
    assert.equal((capturedBody as Record<string, unknown>)['title'], 'New Title');
  });

  it('sends meta fields separately from standard fields', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    _injectFetch(async (url: string, init?: RequestInit) => {
      if (url.includes('/pages/10?_fields=id')) {
        return new Response(JSON.stringify({ id: 10 }), { status: 200 });
      }
      if (url.includes('/pages/10') && init?.method === 'POST') {
        capturedBody = JSON.parse(init?.body as string ?? '{}');
        return new Response(JSON.stringify({ id: 10 }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    await updateWPPost(creds, 10, { title: 'My Page', _yoast_wpseo_title: 'SEO Title' });
    assert.ok(capturedBody);
    assert.equal((capturedBody as Record<string, unknown>)['title'], 'My Page');
    const meta = (capturedBody as Record<string, unknown>)['meta'] as Record<string, string>;
    assert.equal(meta['_yoast_wpseo_title'], 'SEO Title');
  });

  it('throws on API error', async () => {
    _injectFetch(async (url: string) => {
      if (url.includes('_fields=id')) {
        return new Response('Not Found', { status: 404 });
      }
      // Falls to posts endpoint
      return new Response('Server Error', { status: 500 });
    });

    await assert.rejects(
      () => updateWPPost(creds, 99, { title: 'Fail' }),
      /failed/i,
    );
  });
});

// ── injectWPSnippet ──────────────────────────────────────────────────────────

describe('injectWPSnippet', () => {
  it('injects snippet into functions.php', async () => {
    let writtenContent = '';
    _injectFetch(async (url: string, init?: RequestInit) => {
      if (url.includes('themes?status=active')) {
        return new Response(JSON.stringify([{ stylesheet: 'twentytwenty' }]), { status: 200 });
      }
      if (url.includes('twentytwenty') && url.includes('functions.php') && init?.method === 'GET') {
        return new Response(JSON.stringify({ content: '<?php\n// Theme functions\n' }), { status: 200 });
      }
      if (url.includes('twentytwenty') && init?.method === 'POST') {
        const body = JSON.parse(init?.body as string ?? '{}');
        writtenContent = body.content ?? '';
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    await injectWPSnippet(creds, 'test_snippet', 'echo "hello";');
    assert.ok(writtenContent.includes('vaeo_test_snippet'));
    assert.ok(writtenContent.includes('echo "hello"'));
  });

  it('skips injection if guard function already exists', async () => {
    let writeAttempted = false;
    _injectFetch(async (url: string, init?: RequestInit) => {
      if (url.includes('themes?status=active')) {
        return new Response(JSON.stringify([{ stylesheet: 'twentytwenty' }]), { status: 200 });
      }
      if (url.includes('twentytwenty') && url.includes('functions.php')) {
        return new Response(JSON.stringify({
          content: '<?php\n// VAEO: existing\nif (!function_exists(\'vaeo_my_func\')) {\necho "hi";\n}\n',
        }), { status: 200 });
      }
      if (init?.method === 'POST') {
        writeAttempted = true;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    await injectWPSnippet(creds, 'my_func', 'echo "duplicate";');
    assert.equal(writeAttempted, false);
  });

  it('throws when no active theme found', async () => {
    mockFetch({
      'themes?status=active': { status: 200, body: [] },
    });
    await assert.rejects(
      () => injectWPSnippet(creds, 'test', 'echo "x";'),
      /No active theme/,
    );
  });
});
