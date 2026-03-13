/**
 * tools/link_graph/anchor_text_analyzer.test.ts
 *
 * Tests for anchor text analyzer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAnchorText,
  calculateDiversityScore,
  isOverOptimized,
  buildAnchorProfile,
  analyzeAllAnchors,
  GENERIC_ANCHORS,
  type AnchorDistributionEntry,
} from './anchor_text_analyzer.js';
import type { InternalLink } from './types.js';

function link(source: string, dest: string, anchor: string | null = 'link'): InternalLink {
  return { source_url: source, destination_url: dest, anchor_text: anchor, link_type: 'body_content', is_nofollow: false };
}

// ── GENERIC_ANCHORS ──────────────────────────────────────────────────────────

describe('GENERIC_ANCHORS', () => {
  it('contains click here', () => {
    assert.ok(GENERIC_ANCHORS.includes('click here'));
  });

  it('contains read more', () => {
    assert.ok(GENERIC_ANCHORS.includes('read more'));
  });

  it('contains learn more', () => {
    assert.ok(GENERIC_ANCHORS.includes('learn more'));
  });
});

// ── classifyAnchorText ───────────────────────────────────────────────────────

describe('classifyAnchorText', () => {
  it('returns generic for click here', () => {
    assert.equal(classifyAnchorText('click here', '/page'), 'generic');
  });

  it('returns generic for read more', () => {
    assert.equal(classifyAnchorText('read more', '/page'), 'generic');
  });

  it('returns generic for learn more', () => {
    assert.equal(classifyAnchorText('Learn More', '/page'), 'generic');
  });

  it('returns naked_url for url match', () => {
    assert.equal(classifyAnchorText('https://example.com/page', 'https://example.com/page'), 'naked_url');
  });

  it('returns image_link for null anchor', () => {
    assert.equal(classifyAnchorText(null, '/page'), 'image_link');
  });

  it('returns image_link for empty string', () => {
    assert.equal(classifyAnchorText('', '/page'), 'image_link');
  });

  it('returns exact_match for keyword match', () => {
    assert.equal(classifyAnchorText('blue widgets', '/shop', ['blue widgets']), 'exact_match');
  });

  it('returns partial_match for partial keyword', () => {
    assert.equal(classifyAnchorText('best blue widgets ever', '/shop', ['blue widgets']), 'partial_match');
  });

  it('returns descriptive by default', () => {
    assert.equal(classifyAnchorText('Our amazing product guide', '/page'), 'descriptive');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => classifyAnchorText(null as any, null as any, null as any));
  });
});

// ── calculateDiversityScore ──────────────────────────────────────────────────

describe('calculateDiversityScore', () => {
  it('returns high for many unique anchors', () => {
    const dist = [
      { text: 'a', count: 1 },
      { text: 'b', count: 1 },
      { text: 'c', count: 1 },
      { text: 'd', count: 1 },
      { text: 'e', count: 1 },
    ];
    assert.ok(calculateDiversityScore(dist) >= 90);
  });

  it('returns low for single dominant anchor', () => {
    const dist = [
      { text: 'a', count: 100 },
      { text: 'b', count: 1 },
    ];
    assert.ok(calculateDiversityScore(dist) < 30);
  });

  it('returns 0 for empty', () => {
    assert.equal(calculateDiversityScore([]), 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => calculateDiversityScore(null as any));
  });
});

// ── isOverOptimized ──────────────────────────────────────────────────────────

describe('isOverOptimized', () => {
  it('returns true when exact_match > 50%', () => {
    const dist: AnchorDistributionEntry[] = [
      { text: 'keyword', count: 6, percentage: 60, classification: 'exact_match' },
      { text: 'other', count: 4, percentage: 40, classification: 'descriptive' },
    ];
    assert.equal(isOverOptimized(dist), true);
  });

  it('returns false when exact_match <= 50%', () => {
    const dist: AnchorDistributionEntry[] = [
      { text: 'keyword', count: 3, percentage: 30, classification: 'exact_match' },
      { text: 'other', count: 7, percentage: 70, classification: 'descriptive' },
    ];
    assert.equal(isOverOptimized(dist), false);
  });

  it('returns false for empty', () => {
    assert.equal(isOverOptimized([]), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isOverOptimized(null as any));
  });
});

// ── buildAnchorProfile ───────────────────────────────────────────────────────

describe('buildAnchorProfile', () => {
  it('counts total inbound links correctly', () => {
    const links = [link('/a', '/target', 'foo'), link('/b', '/target', 'bar')];
    const profile = buildAnchorProfile('/target', links);
    assert.equal(profile.total_inbound_links, 2);
  });

  it('counts unique anchors', () => {
    const links = [link('/a', '/target', 'foo'), link('/b', '/target', 'foo'), link('/c', '/target', 'bar')];
    const profile = buildAnchorProfile('/target', links);
    assert.equal(profile.unique_anchor_texts, 2);
  });

  it('detects generic anchors', () => {
    const links = [link('/a', '/target', 'click here'), link('/b', '/target', 'learn more')];
    const profile = buildAnchorProfile('/target', links);
    assert.equal(profile.has_generic_anchors, true);
    assert.equal(profile.generic_anchor_count, 2);
  });

  it('returns empty for no matching links', () => {
    const profile = buildAnchorProfile('/target', [link('/a', '/other', 'text')]);
    assert.equal(profile.total_inbound_links, 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildAnchorProfile(null as any, null as any));
  });
});

// ── analyzeAllAnchors ────────────────────────────────────────────────────────

describe('analyzeAllAnchors', () => {
  it('builds profiles for all destinations', async () => {
    const links = [link('/a', '/t1', 'click here'), link('/b', '/t2', 'good anchor')];
    const profiles = await analyzeAllAnchors('s1', { loadLinksFn: async () => links });
    assert.equal(profiles.length, 2);
  });

  it('sorts by generic_anchor_count desc', async () => {
    const links = [
      link('/a', '/t1', 'click here'),
      link('/b', '/t1', 'read more'),
      link('/c', '/t2', 'good text'),
    ];
    const profiles = await analyzeAllAnchors('s1', { loadLinksFn: async () => links });
    assert.ok(profiles[0].generic_anchor_count >= profiles[profiles.length - 1].generic_anchor_count);
  });

  it('returns [] on error', async () => {
    const profiles = await analyzeAllAnchors('s1', {
      loadLinksFn: async () => { throw new Error('db down'); },
    });
    assert.deepEqual(profiles, []);
  });

  it('returns [] for empty site_id', async () => {
    assert.deepEqual(await analyzeAllAnchors(''), []);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => analyzeAllAnchors(null as any, null as any));
  });
});
