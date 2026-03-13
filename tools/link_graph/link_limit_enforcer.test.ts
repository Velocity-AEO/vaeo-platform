import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLinkLimitViolation,
  scanAllPagesForLinkLimits,
  LINK_LIMITS,
} from './link_limit_enforcer.js';
import type { InternalLink, ExternalLink } from './link_graph_types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInternalLinks(count: number, type = 'body_content'): InternalLink[] {
  return Array.from({ length: count }, (_, i) => ({
    source_url: 'https://a.com/',
    destination_url: `https://a.com/p${i}`,
    anchor_text: 'link',
    link_type: type as any,
    link_source: 'html_static' as const,
    is_nofollow: false,
    is_redirect: false,
    redirect_destination: null,
    position_in_page: i,
    discovered_at: new Date().toISOString(),
  }));
}

function makeExternalLinks(count: number): ExternalLink[] {
  return Array.from({ length: count }, (_, i) => ({
    source_url: 'https://a.com/',
    destination_url: `https://ext${i}.com/`,
    anchor_text: 'ext',
    link_type: 'body_content' as const,
    is_nofollow: false,
    is_sponsored: false,
    is_ugc: false,
    domain: `ext${i}.com`,
    discovered_at: new Date().toISOString(),
  }));
}

// ── LINK_LIMITS constants ────────────────────────────────────────────────────

describe('LINK_LIMITS', () => {
  it('soft_limit is 100', () => {
    assert.equal(LINK_LIMITS.soft_limit, 100);
  });

  it('hard_limit is 200', () => {
    assert.equal(LINK_LIMITS.hard_limit, 200);
  });

  it('external_nofollow_recommendation is 10', () => {
    assert.equal(LINK_LIMITS.external_nofollow_recommendation, 10);
  });
});

// ── detectLinkLimitViolation ─────────────────────────────────────────────────

describe('detectLinkLimitViolation', () => {
  it('returns null at exactly 100 links', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(100), []);
    assert.equal(result, null);
  });

  it('returns null below 100 links', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(50), makeExternalLinks(10));
    assert.equal(result, null);
  });

  it('returns violation above 100 links', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(101), []);
    assert.ok(result !== null);
    assert.equal(result!.total_links, 101);
  });

  it('severity is critical at 200+', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(200), []);
    assert.equal(result!.severity, 'critical');
  });

  it('severity is high at 150+', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(150), []);
    assert.equal(result!.severity, 'high');
  });

  it('severity is medium between 101-149', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(110), []);
    assert.equal(result!.severity, 'medium');
  });

  it('calculates over_limit_by correctly', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(130), []);
    assert.equal(result!.over_limit_by, 30);
  });

  it('counts internal and external links separately', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(80), makeExternalLinks(30));
    assert.equal(result!.internal_links, 80);
    assert.equal(result!.external_links, 30);
    assert.equal(result!.total_links, 110);
  });

  it('recommends nav review when nav > 50', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(55, 'navigation'), makeExternalLinks(50));
    assert.ok(result!.recommendations.some((r) => r.includes('navigation')));
  });

  it('recommends footer simplification when footer > 30', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(70, 'footer'), makeExternalLinks(35));
    assert.ok(result!.recommendations.some((r) => r.includes('footer')));
  });

  it('recommends nofollow when external > 10', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(90), makeExternalLinks(15));
    assert.ok(result!.recommendations.some((r) => r.includes('nofollow')));
  });

  it('recommends removing links when over_limit_by > 50', () => {
    const result = detectLinkLimitViolation('https://a.com/', 'Home', makeInternalLinks(160), []);
    assert.ok(result!.recommendations.some((r) => r.includes('Remove')));
  });

  it('returns null for empty page_url', () => {
    assert.equal(detectLinkLimitViolation('', 'Home', makeInternalLinks(200), []), null);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => detectLinkLimitViolation(null as any, null as any, null as any, null as any));
  });
});

// ── scanAllPagesForLinkLimits ────────────────────────────────────────────────

describe('scanAllPagesForLinkLimits', () => {
  it('sorts violations by total_links desc', async () => {
    const result = await scanAllPagesForLinkLimits('site_1', {
      loadPagesFn: async () => [
        { url: 'https://a.com/small', title: 'Small' },
        { url: 'https://a.com/big', title: 'Big' },
      ],
      loadLinksFn: async () => ({
        internal: [
          ...Array.from({ length: 110 }, (_, i) => ({
            source_url: 'https://a.com/small', destination_url: `https://a.com/p${i}`,
            anchor_text: 'link', link_type: 'body_content' as const, link_source: 'html_static' as const,
            is_nofollow: false, is_redirect: false, redirect_destination: null, position_in_page: i, discovered_at: '',
          })),
          ...Array.from({ length: 160 }, (_, i) => ({
            source_url: 'https://a.com/big', destination_url: `https://a.com/q${i}`,
            anchor_text: 'link', link_type: 'body_content' as const, link_source: 'html_static' as const,
            is_nofollow: false, is_redirect: false, redirect_destination: null, position_in_page: i, discovered_at: '',
          })),
        ],
        external: [],
      }),
    });
    assert.equal(result.violations[0]?.url, 'https://a.com/big');
  });

  it('returns empty on error', async () => {
    const result = await scanAllPagesForLinkLimits('site_1', {
      loadPagesFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result.violations.length, 0);
    assert.equal(result.worst_page, null);
  });

  it('counts severity correctly', async () => {
    const result = await scanAllPagesForLinkLimits('site_1', {
      loadPagesFn: async () => [{ url: 'https://a.com/', title: 'Home' }],
      loadLinksFn: async () => ({
        internal: Array.from({ length: 210 }, (_, i) => ({
          source_url: 'https://a.com/', destination_url: `https://a.com/p${i}`,
          anchor_text: 'link', link_type: 'body_content' as const, link_source: 'html_static' as const,
          is_nofollow: false, is_redirect: false, redirect_destination: null, position_in_page: i, discovered_at: '',
        })),
        external: [],
      }),
    });
    assert.equal(result.critical_count, 1);
  });

  it('all deps injectable', async () => {
    let calledSite = '';
    await scanAllPagesForLinkLimits('test_site', {
      loadPagesFn: async (s) => { calledSite = s; return []; },
      loadLinksFn: async () => ({ internal: [], external: [] }),
    });
    assert.equal(calledSite, 'test_site');
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => scanAllPagesForLinkLimits(null as any, null as any));
  });
});
