/**
 * tools/link_graph/link_graph_exporter.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCSV,
  pageNodeToCSVRow,
  internalLinkToCSVRow,
  externalLinkToCSVRow,
  suggestionToCSVRow,
  velocityTrendToCSVRow,
  exportPageNodes,
  exportInternalLinks,
  exportExternalLinks,
  exportLinkOpportunities,
  exportVelocityTrends,
  exportFullLinkReport,
  PAGE_NODES_CSV_HEADERS,
  INTERNAL_LINKS_CSV_HEADERS,
  EXTERNAL_LINKS_CSV_HEADERS,
  LINK_OPPORTUNITIES_CSV_HEADERS,
  VELOCITY_CSV_HEADERS,
  type LinkGraphExport,
} from './link_graph_exporter.js';
import type { PageNode, InternalLink, ExternalLink } from './link_graph_types.js';
import type { AuthorityScore } from './authority_scorer.js';
import type { LinkSuggestion } from './link_suggester.js';
import type { ExternalLinkCheckResult } from './external_link_checker.js';
import type { LinkVelocityTrend } from './link_velocity_tracker.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<PageNode> = {}): PageNode {
  return {
    url:                     'https://example.com/page',
    site_id:                 'site_1',
    title:                   'Test Page',
    is_canonical:            true,
    canonical_url:           null,
    is_noindex:              false,
    is_paginated:            false,
    pagination_root:         null,
    depth_from_homepage:     2,
    inbound_internal_count:  5,
    outbound_internal_count: 3,
    outbound_external_count: 1,
    total_link_count:        4,
    is_in_sitemap:           true,
    is_orphaned:             false,
    is_dead_end:             false,
    has_redirect_chain:      false,
    link_equity_score:       0.85,
    last_crawled_at:         '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function makeScore(overrides: Partial<AuthorityScore> = {}): AuthorityScore {
  return {
    url:                  'https://example.com/page',
    raw_score:            10,
    normalized_score:     0.75,
    inbound_count:        5,
    body_content_inbound: 3,
    navigation_inbound:   2,
    depth_from_homepage:  2,
    authority_tier:       'average',
    ...overrides,
  };
}

function makeInternalLink(overrides: Partial<InternalLink> = {}): InternalLink {
  return {
    source_url:           'https://src.com/',
    destination_url:      'https://dst.com/',
    anchor_text:          'click here',
    link_type:            'body_content',
    link_source:          'html_static',
    is_nofollow:          false,
    is_redirect:          false,
    redirect_destination: null,
    position_in_page:     3,
    discovered_at:        '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function makeExternalLink(overrides: Partial<ExternalLink> = {}): ExternalLink {
  return {
    source_url:         'https://src.com/',
    destination_url:    'https://ext.com/',
    destination_domain: 'ext.com',
    anchor_text:        'external',
    is_nofollow:        false,
    status_code:        200,
    is_broken:          false,
    discovered_at:      '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function makeCheck(overrides: Partial<ExternalLinkCheckResult> = {}): ExternalLinkCheckResult {
  return {
    url:               'https://src.com/',
    destination_url:   'https://ext.com/',
    destination_domain: 'ext.com',
    status_code:       200,
    is_broken:         false,
    is_redirect:       false,
    final_url:         null,
    redirect_hops:     0,
    response_time_ms:  100,
    is_nofollow:       false,
    domain_reputation: 'unknown',
    check_error:       null,
    checked_at:        new Date().toISOString(),
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<LinkSuggestion> = {}): LinkSuggestion {
  return {
    source_url:                  'https://src.com/',
    source_title:                'Source',
    destination_url:             'https://dst.com/',
    destination_title:           'Destination',
    suggested_anchor_text:       'learn more',
    suggestion_reason:           'High authority page with no link',
    priority:                    'high',
    destination_authority_score: 0.9,
    destination_inbound_count:   10,
    ...overrides,
  };
}

function makeVelocityTrend(overrides: Partial<LinkVelocityTrend> = {}): LinkVelocityTrend {
  return {
    url:            'https://example.com/hub',
    site_id:        'site_1',
    title:          'Hub Page',
    current_inbound: 20,
    inbound_7d_ago:  15,
    inbound_30d_ago: 10,
    change_7d:       5,
    change_30d:      10,
    pct_change_7d:   33,
    pct_change_30d:  100,
    trend_type:      'gaining',
    is_hub_page:     true,
    alert_required:  false,
    alert_reason:    null,
    authority_score: 0.8,
    ...overrides,
  };
}

// ── buildCSV ──────────────────────────────────────────────────────────────────

describe('buildCSV', () => {
  it('returns header row first', () => {
    const csv = buildCSV(['A', 'B'], [['1', '2']]);
    const lines = csv.split('\n');
    assert.equal(lines[0], 'A,B');
  });

  it('returns data rows after header', () => {
    const csv = buildCSV(['A', 'B'], [['1', '2'], ['3', '4']]);
    const lines = csv.split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[1], '1,2');
  });

  it('escapes commas in values', () => {
    const csv = buildCSV(['A'], [['hello, world']]);
    assert.ok(csv.includes('"hello, world"'));
  });

  it('escapes double quotes in values', () => {
    const csv = buildCSV(['A'], [['say "hi"']]);
    assert.ok(csv.includes('""'));
  });

  it('wraps values containing newlines in quotes', () => {
    const csv = buildCSV(['A'], [['line1\nline2']]);
    assert.ok(csv.includes('"'));
  });

  it('handles empty rows array', () => {
    const csv = buildCSV(['A', 'B'], []);
    assert.equal(csv, 'A,B');
  });

  it('handles null/undefined values as empty string', () => {
    const csv = buildCSV(['A'], [[null as any]]);
    assert.ok(csv.includes('\n'));
  });

  it('never throws on null headers', () => {
    assert.doesNotThrow(() => buildCSV(null as any, []));
  });
});

// ── pageNodeToCSVRow ──────────────────────────────────────────────────────────

describe('pageNodeToCSVRow', () => {
  it('returns correct number of columns', () => {
    const row = pageNodeToCSVRow(makeNode(), makeScore());
    assert.equal(row.length, PAGE_NODES_CSV_HEADERS.length);
  });

  it('formats boolean true as Yes', () => {
    const row = pageNodeToCSVRow(makeNode({ is_orphaned: true }), null);
    const orphanIdx = PAGE_NODES_CSV_HEADERS.indexOf('Is Orphaned');
    assert.equal(row[orphanIdx], 'Yes');
  });

  it('formats boolean false as No', () => {
    const row = pageNodeToCSVRow(makeNode({ is_orphaned: false }), null);
    const orphanIdx = PAGE_NODES_CSV_HEADERS.indexOf('Is Orphaned');
    assert.equal(row[orphanIdx], 'No');
  });

  it('formats null depth as empty string', () => {
    const row = pageNodeToCSVRow(makeNode({ depth_from_homepage: null }), null);
    const depthIdx = PAGE_NODES_CSV_HEADERS.indexOf('Depth From Homepage');
    assert.equal(row[depthIdx], '');
  });

  it('includes authority tier from score', () => {
    const row = pageNodeToCSVRow(makeNode(), makeScore({ authority_tier: 'hub' }));
    const tierIdx = PAGE_NODES_CSV_HEADERS.indexOf('Authority Tier');
    assert.equal(row[tierIdx], 'hub');
  });

  it('handles null score gracefully', () => {
    const row = pageNodeToCSVRow(makeNode(), null);
    assert.equal(row.length, PAGE_NODES_CSV_HEADERS.length);
  });

  it('never throws on null node', () => {
    assert.doesNotThrow(() => pageNodeToCSVRow(null as any, null));
  });
});

// ── internalLinkToCSVRow ──────────────────────────────────────────────────────

describe('internalLinkToCSVRow', () => {
  it('returns correct column count', () => {
    const row = internalLinkToCSVRow(makeInternalLink());
    assert.equal(row.length, INTERNAL_LINKS_CSV_HEADERS.length);
  });

  it('includes source_url', () => {
    const row = internalLinkToCSVRow(makeInternalLink({ source_url: 'https://src.com/' }));
    assert.ok(row.includes('https://src.com/'));
  });

  it('formats is_nofollow as Yes/No', () => {
    const row = internalLinkToCSVRow(makeInternalLink({ is_nofollow: true }));
    const idx = INTERNAL_LINKS_CSV_HEADERS.indexOf('Is Nofollow');
    assert.equal(row[idx], 'Yes');
  });

  it('never throws on null link', () => {
    assert.doesNotThrow(() => internalLinkToCSVRow(null as any));
  });
});

// ── externalLinkToCSVRow ──────────────────────────────────────────────────────

describe('externalLinkToCSVRow', () => {
  it('merges check result status_code', () => {
    const link  = makeExternalLink({ status_code: 200 });
    const check = makeCheck({ status_code: 404, destination_url: link.destination_url });
    const row   = externalLinkToCSVRow(link, check);
    const idx   = EXTERNAL_LINKS_CSV_HEADERS.indexOf('Status Code');
    assert.equal(row[idx], '404');
  });

  it('merges check result is_broken', () => {
    const link  = makeExternalLink({ is_broken: false });
    const check = makeCheck({ is_broken: true, destination_url: link.destination_url });
    const row   = externalLinkToCSVRow(link, check);
    const idx   = EXTERNAL_LINKS_CSV_HEADERS.indexOf('Is Broken');
    assert.equal(row[idx], 'Yes');
  });

  it('includes domain_reputation from check', () => {
    const link  = makeExternalLink();
    const check = makeCheck({ domain_reputation: 'low_value' });
    const row   = externalLinkToCSVRow(link, check);
    const idx   = EXTERNAL_LINKS_CSV_HEADERS.indexOf('Domain Reputation');
    assert.equal(row[idx], 'low_value');
  });

  it('handles null check gracefully', () => {
    const row = externalLinkToCSVRow(makeExternalLink(), null);
    assert.equal(row.length, EXTERNAL_LINKS_CSV_HEADERS.length);
  });

  it('never throws on null link', () => {
    assert.doesNotThrow(() => externalLinkToCSVRow(null as any, null));
  });
});

// ── suggestionToCSVRow ────────────────────────────────────────────────────────

describe('suggestionToCSVRow', () => {
  it('returns correct column count', () => {
    const row = suggestionToCSVRow(makeSuggestion());
    assert.equal(row.length, LINK_OPPORTUNITIES_CSV_HEADERS.length);
  });

  it('includes priority', () => {
    const row = suggestionToCSVRow(makeSuggestion({ priority: 'high' }));
    assert.ok(row.includes('high'));
  });

  it('includes suggested_anchor_text', () => {
    const row = suggestionToCSVRow(makeSuggestion({ suggested_anchor_text: 'learn more' }));
    assert.ok(row.includes('learn more'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => suggestionToCSVRow(null as any));
  });
});

// ── velocityTrendToCSVRow ─────────────────────────────────────────────────────

describe('velocityTrendToCSVRow', () => {
  it('returns correct column count', () => {
    const row = velocityTrendToCSVRow(makeVelocityTrend());
    assert.equal(row.length, VELOCITY_CSV_HEADERS.length);
  });

  it('includes trend_type', () => {
    const row = velocityTrendToCSVRow(makeVelocityTrend({ trend_type: 'losing_sudden' }));
    assert.ok(row.includes('losing_sudden'));
  });

  it('formats is_hub_page as Yes/No', () => {
    const row = velocityTrendToCSVRow(makeVelocityTrend({ is_hub_page: true }));
    const idx = VELOCITY_CSV_HEADERS.indexOf('Is Hub Page');
    assert.equal(row[idx], 'Yes');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => velocityTrendToCSVRow(null as any));
  });
});

// ── exportPageNodes ───────────────────────────────────────────────────────────

describe('exportPageNodes', () => {
  it('returns correct export_type', () => {
    const result = exportPageNodes([makeNode()], [makeScore()]);
    assert.equal(result.export_type, 'page_nodes');
  });

  it('row_count matches nodes length', () => {
    const nodes = [makeNode(), makeNode({ url: 'https://other.com/' })];
    const result = exportPageNodes(nodes, []);
    assert.equal(result.row_count, 2);
  });

  it('data includes header row', () => {
    const result = exportPageNodes([makeNode()], []);
    assert.ok(result.data.includes('URL'));
  });

  it('never throws on empty', () => {
    assert.doesNotThrow(() => exportPageNodes([], []));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => exportPageNodes(null as any, null as any));
  });
});

// ── exportInternalLinks ───────────────────────────────────────────────────────

describe('exportInternalLinks', () => {
  it('row_count matches links', () => {
    const links = [makeInternalLink(), makeInternalLink()];
    assert.equal(exportInternalLinks(links).row_count, 2);
  });

  it('export_type is internal_links', () => {
    assert.equal(exportInternalLinks([]).export_type, 'internal_links');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => exportInternalLinks(null as any));
  });
});

// ── exportExternalLinks ───────────────────────────────────────────────────────

describe('exportExternalLinks', () => {
  it('merges checks by destination_url', () => {
    const link  = makeExternalLink({ destination_url: 'https://t.com/', is_broken: false });
    const check = makeCheck({ destination_url: 'https://t.com/', is_broken: true });
    const result = exportExternalLinks([link], [check]);
    assert.ok(result.data.includes('Yes')); // is_broken = Yes
  });

  it('row_count matches links', () => {
    const result = exportExternalLinks([makeExternalLink(), makeExternalLink()], []);
    assert.equal(result.row_count, 2);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => exportExternalLinks(null as any, null as any));
  });
});

// ── exportLinkOpportunities ───────────────────────────────────────────────────

describe('exportLinkOpportunities', () => {
  it('row_count matches suggestions', () => {
    const result = exportLinkOpportunities([makeSuggestion(), makeSuggestion()]);
    assert.equal(result.row_count, 2);
  });

  it('export_type is link_opportunities', () => {
    assert.equal(exportLinkOpportunities([]).export_type, 'link_opportunities');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => exportLinkOpportunities(null as any));
  });
});

// ── exportVelocityTrends ──────────────────────────────────────────────────────

describe('exportVelocityTrends', () => {
  it('row_count matches trends', () => {
    const result = exportVelocityTrends([makeVelocityTrend(), makeVelocityTrend()]);
    assert.equal(result.row_count, 2);
  });

  it('export_type is velocity_trends', () => {
    assert.equal(exportVelocityTrends([]).export_type, 'velocity_trends');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => exportVelocityTrends(null as any));
  });
});

// ── exportFullLinkReport ──────────────────────────────────────────────────────

describe('exportFullLinkReport', () => {
  it('returns all 5 export keys', async () => {
    const result = await exportFullLinkReport('site_1', {
      loadGraphFn:       async () => ({ pages: [makeNode()], internal_links: [makeInternalLink()], external_links: [makeExternalLink()] }),
      loadScoresFn:      async () => [makeScore()],
      loadChecksFn:      async () => [makeCheck()],
      loadSuggestionsFn: async () => [makeSuggestion()],
      loadVelocityFn:    async () => [makeVelocityTrend()],
    });
    assert.ok(result.page_nodes);
    assert.ok(result.internal_links);
    assert.ok(result.external_links);
    assert.ok(result.opportunities);
    assert.ok(result.velocity);
  });

  it('stamps site_id on all exports', async () => {
    const result = await exportFullLinkReport('my_site');
    assert.equal(result.page_nodes.site_id, 'my_site');
    assert.equal(result.internal_links.site_id, 'my_site');
  });

  it('all deps injectable', async () => {
    let called = false;
    await exportFullLinkReport('site_1', {
      loadGraphFn: async () => { called = true; return null; },
    });
    assert.equal(called, true);
  });

  it('never throws when deps throw', async () => {
    await assert.doesNotReject(() => exportFullLinkReport('site_1', {
      loadGraphFn: async () => { throw new Error('DB error'); },
    }));
  });

  it('never throws on null site_id', async () => {
    await assert.doesNotReject(() => exportFullLinkReport(null as any));
  });

  it('returns generated_at ISO timestamp', async () => {
    const result = await exportFullLinkReport('site_1');
    assert.ok(result.generated_at.includes('T'));
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('PAGE_NODES_CSV_HEADERS has all required columns', () => {
    assert.ok(PAGE_NODES_CSV_HEADERS.includes('URL'));
    assert.ok(PAGE_NODES_CSV_HEADERS.includes('Authority Score'));
    assert.ok(PAGE_NODES_CSV_HEADERS.includes('Is Orphaned'));
    assert.ok(PAGE_NODES_CSV_HEADERS.includes('Link Equity Score'));
  });

  it('INTERNAL_LINKS_CSV_HEADERS has all required columns', () => {
    assert.ok(INTERNAL_LINKS_CSV_HEADERS.includes('Source URL'));
    assert.ok(INTERNAL_LINKS_CSV_HEADERS.includes('Anchor Text'));
    assert.ok(INTERNAL_LINKS_CSV_HEADERS.includes('Link Type'));
  });

  it('EXTERNAL_LINKS_CSV_HEADERS has all required columns', () => {
    assert.ok(EXTERNAL_LINKS_CSV_HEADERS.includes('Domain Reputation'));
    assert.ok(EXTERNAL_LINKS_CSV_HEADERS.includes('Is Broken'));
    assert.ok(EXTERNAL_LINKS_CSV_HEADERS.includes('Status Code'));
  });

  it('VELOCITY_CSV_HEADERS has all required columns', () => {
    assert.ok(VELOCITY_CSV_HEADERS.includes('Trend Type'));
    assert.ok(VELOCITY_CSV_HEADERS.includes('Alert Required'));
  });

  it('LINK_OPPORTUNITIES_CSV_HEADERS has all required columns', () => {
    assert.ok(LINK_OPPORTUNITIES_CSV_HEADERS.includes('Priority'));
    assert.ok(LINK_OPPORTUNITIES_CSV_HEADERS.includes('Suggested Anchor Text'));
  });
});
