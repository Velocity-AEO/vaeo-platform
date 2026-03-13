/**
 * tools/link_graph/redirect_chain_detector.test.ts
 *
 * Tests for redirect chain detector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRedirectChain,
  scanInternalLinksForRedirects,
  buildRedirectChainFix,
  type RedirectChain,
} from './redirect_chain_detector.js';
import type { InternalLink } from './types.js';

function link(source: string, dest: string): InternalLink {
  return { source_url: source, destination_url: dest, anchor_text: 'link', link_type: 'body_content', is_nofollow: false };
}

// ── detectRedirectChain ──────────────────────────────────────────────────────

describe('detectRedirectChain', () => {
  it('returns null for direct link (no redirect)', async () => {
    const result = await detectRedirectChain('https://example.com/page', 5, {
      fetchFn: async () => ({ status: 200, redirected: false, url: 'https://example.com/page', headers: {} }),
    });
    assert.equal(result, null);
  });

  it('returns chain for redirect', async () => {
    let call = 0;
    const result = await detectRedirectChain('https://example.com/old', 5, {
      fetchFn: async () => {
        call++;
        if (call === 1) return { status: 301, redirected: true, url: 'https://example.com/new', headers: { location: 'https://example.com/new' } };
        return { status: 200, redirected: false, url: 'https://example.com/new', headers: {} };
      },
    });
    assert.ok(result);
    assert.equal(result!.hop_count, 1);
    assert.equal(result!.final_url, 'https://example.com/new');
  });

  it('detects multi-hop chains', async () => {
    let call = 0;
    const result = await detectRedirectChain('https://a.com/1', 5, {
      fetchFn: async () => {
        call++;
        if (call === 1) return { status: 301, redirected: true, url: '', headers: { location: 'https://a.com/2' } };
        if (call === 2) return { status: 302, redirected: true, url: '', headers: { location: 'https://a.com/3' } };
        return { status: 200, redirected: false, url: '', headers: {} };
      },
    });
    assert.ok(result);
    assert.equal(result!.hop_count, 2);
    assert.deepEqual(result!.chain, ['https://a.com/1', 'https://a.com/2', 'https://a.com/3']);
  });

  it('respects max_hops', async () => {
    const result = await detectRedirectChain('https://a.com/loop', 2, {
      fetchFn: async (url) => ({
        status: 301,
        redirected: true,
        url: '',
        headers: { location: url + '/next' },
      }),
    });
    assert.ok(result);
    assert.ok(result!.hop_count <= 2);
  });

  it('returns null on error', async () => {
    const result = await detectRedirectChain('https://example.com', 5, {
      fetchFn: async () => { throw new Error('network error'); },
    });
    assert.equal(result, null);
  });

  it('returns null for empty url', async () => {
    assert.equal(await detectRedirectChain('', 5), null);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => detectRedirectChain(null as any, null as any, null as any));
  });
});

// ── scanInternalLinksForRedirects ────────────────────────────────────────────

describe('scanInternalLinksForRedirects', () => {
  it('deduplicates by link_url', async () => {
    const links = [link('/a', '/target'), link('/b', '/target')];
    let detectCalls = 0;
    const chains = await scanInternalLinksForRedirects(links, {
      detectFn: async () => { detectCalls++; return null; },
    });
    assert.equal(detectCalls, 1);
  });

  it('returns chains found', async () => {
    const links = [link('/a', '/old')];
    const chains = await scanInternalLinksForRedirects(links, {
      detectFn: async () => ({
        source_url: '', link_url: '/old', final_url: '/new',
        hop_count: 1, chain: ['/old', '/new'], fix_action: 'update_link_to_final' as const,
      }),
    });
    assert.equal(chains.length, 1);
  });

  it('all deps injectable', async () => {
    let called = false;
    await scanInternalLinksForRedirects([link('/a', '/b')], {
      detectFn: async () => { called = true; return null; },
    });
    assert.equal(called, true);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => scanInternalLinksForRedirects(null as any, null as any));
  });
});

// ── buildRedirectChainFix ────────────────────────────────────────────────────

describe('buildRedirectChainFix', () => {
  it('returns replacement href', () => {
    const chain: RedirectChain = {
      source_url: '/page', link_url: '/old', final_url: '/new',
      hop_count: 1, chain: ['/old', '/new'], fix_action: 'update_link_to_final',
    };
    const fix = buildRedirectChainFix(chain, '<a href="/old">Click</a>');
    assert.equal(fix.original_href, '/old');
    assert.equal(fix.replacement_href, '/new');
    assert.equal(fix.anchor_text, 'Click');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildRedirectChainFix(null as any, null as any));
  });
});
