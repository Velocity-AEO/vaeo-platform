import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNodeRadius,
  getNodeColor,
  getEdgeColor,
  formatNodeTooltip,
  getStatusBadges,
  truncateUrl,
  formatDepthPath,
  type PageNode,
  type AuthorityScore,
  type AuthorityTier,
  type LinkType,
} from './link_graph_display.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(overrides?: Partial<PageNode>): PageNode {
  return {
    url: 'https://example.com/page',
    title: 'Test Page',
    depth: 2,
    inbound_internal_count: 5,
    outbound_internal_count: 3,
    is_orphaned: false,
    is_dead_end: false,
    is_in_sitemap: true,
    health_score: 85,
    outbound_link_count: 3,
    link_limit: 100,
    ...overrides,
  };
}

// ── getNodeRadius ────────────────────────────────────────────────────────────

describe('getNodeRadius', () => {
  it('returns min 8 for 0 inbound', () => {
    assert.equal(getNodeRadius(0), 8);
  });

  it('returns min 8 for 1 inbound', () => {
    assert.equal(getNodeRadius(1), 8);
  });

  it('returns max 40 cap for very high count', () => {
    assert.equal(getNodeRadius(1000), 40);
  });

  it('scales with sqrt', () => {
    const r4 = getNodeRadius(4);
    const r16 = getNodeRadius(16);
    // sqrt(4)*8 = 16, sqrt(16)*8 = 32
    assert.equal(r4, 16);
    assert.equal(r16, 32);
  });

  it('never throws on negative', () => {
    assert.doesNotThrow(() => getNodeRadius(-5));
    assert.equal(getNodeRadius(-5), 8);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getNodeRadius(null as any));
  });
});

// ── getNodeColor ─────────────────────────────────────────────────────────────

describe('getNodeColor', () => {
  it('returns indigo for hub', () => {
    assert.equal(getNodeColor('hub'), '#4F46E5');
  });

  it('returns blue for strong', () => {
    assert.equal(getNodeColor('strong'), '#0EA5E9');
  });

  it('returns green for average', () => {
    assert.equal(getNodeColor('average'), '#10B981');
  });

  it('returns yellow for weak', () => {
    assert.equal(getNodeColor('weak'), '#F59E0B');
  });

  it('returns red for isolated', () => {
    assert.equal(getNodeColor('isolated'), '#EF4444');
  });

  it('returns fallback for unknown tier', () => {
    assert.equal(getNodeColor('unknown' as AuthorityTier), '#94A3B8');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getNodeColor(null as any));
  });
});

// ── getEdgeColor ─────────────────────────────────────────────────────────────

describe('getEdgeColor', () => {
  it('returns correct color for body_content', () => {
    assert.equal(getEdgeColor('body_content'), '#94A3B8');
  });

  it('returns correct color for breadcrumb', () => {
    assert.equal(getEdgeColor('breadcrumb'), '#818CF8');
  });

  it('returns correct color for sidebar', () => {
    assert.equal(getEdgeColor('sidebar'), '#A5B4FC');
  });

  it('returns fallback for unknown type', () => {
    assert.equal(getEdgeColor('unknown' as LinkType), '#CBD5E1');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getEdgeColor(null as any));
  });
});

// ── getStatusBadges ──────────────────────────────────────────────────────────

describe('getStatusBadges', () => {
  it('returns orphaned badge', () => {
    const badges = getStatusBadges(makeNode({ is_orphaned: true }));
    assert.ok(badges.some((b) => b.label.includes('Orphaned')));
    assert.ok(badges.some((b) => b.color === 'red'));
  });

  it('returns dead end badge', () => {
    const badges = getStatusBadges(makeNode({ is_dead_end: true }));
    assert.ok(badges.some((b) => b.label.includes('Dead end')));
    assert.ok(badges.some((b) => b.color === 'orange'));
  });

  it('returns deep page badge for depth > 3', () => {
    const badges = getStatusBadges(makeNode({ depth: 5 }));
    assert.ok(badges.some((b) => b.label.includes('Deep page')));
    assert.ok(badges.some((b) => b.color === 'yellow'));
  });

  it('returns link limit badge when exceeded', () => {
    const badges = getStatusBadges(makeNode({ outbound_link_count: 150, link_limit: 100 }));
    assert.ok(badges.some((b) => b.label.includes('Exceeds link limit')));
  });

  it('returns empty for normal node', () => {
    const badges = getStatusBadges(makeNode());
    assert.equal(badges.length, 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getStatusBadges(null as any));
  });
});

// ── truncateUrl ──────────────────────────────────────────────────────────────

describe('truncateUrl', () => {
  it('strips protocol', () => {
    assert.ok(!truncateUrl('https://example.com/page', 40).includes('https'));
  });

  it('truncates long paths', () => {
    const result = truncateUrl('https://example.com/very/long/path/that/goes/on/forever', 20);
    assert.ok(result.length <= 20);
  });

  it('adds ellipsis when truncated', () => {
    const result = truncateUrl('https://example.com/very/long/path/that/goes/on/forever', 20);
    assert.ok(result.endsWith('...'));
  });

  it('returns short paths unchanged', () => {
    const result = truncateUrl('https://example.com/page', 40);
    assert.equal(result, '/page');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => truncateUrl(null as any, null as any));
  });

  it('returns empty string for empty input', () => {
    assert.equal(truncateUrl('', 10), '');
  });
});

// ── formatDepthPath ──────────────────────────────────────────────────────────

describe('formatDepthPath', () => {
  it('joins correctly for short paths', () => {
    assert.equal(formatDepthPath(['Home', 'Products', 'Widget A']), 'Home → Products → Widget A');
  });

  it('truncates long paths with ellipsis', () => {
    const path = ['Home', 'Cat', 'Sub1', 'Sub2', 'Sub3', 'Page'];
    const result = formatDepthPath(path);
    assert.ok(result.includes('...'));
    assert.ok(result.includes('Home'));
    assert.ok(result.includes('Page'));
  });

  it('returns empty for empty array', () => {
    assert.equal(formatDepthPath([]), '');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => formatDepthPath(null as any));
  });
});

// ── formatNodeTooltip ────────────────────────────────────────────────────────

describe('formatNodeTooltip', () => {
  it('handles null score', () => {
    const tip = formatNodeTooltip(makeNode(), null);
    assert.ok(tip.includes('unknown'));
  });

  it('includes url', () => {
    const tip = formatNodeTooltip(makeNode(), null);
    assert.ok(tip.includes('/page'));
  });

  it('includes health score when present', () => {
    const tip = formatNodeTooltip(makeNode({ health_score: 85 }), null);
    assert.ok(tip.includes('85'));
  });

  it('includes authority tier from score', () => {
    const score: AuthorityScore = { url: 'https://example.com/page', score: 80, authority_tier: 'strong' };
    const tip = formatNodeTooltip(makeNode(), score);
    assert.ok(tip.includes('strong'));
  });

  it('never throws on null node', () => {
    assert.doesNotThrow(() => formatNodeTooltip(null as any, null));
  });
});
