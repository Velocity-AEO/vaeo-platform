/**
 * tools/link_graph/equity_leak_detector.test.ts
 *
 * Tests for equity leak detector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectEquityLeak,
  detectAllEquityLeaks,
  EQUITY_THRESHOLDS,
} from './equity_leak_detector.js';
import type { InternalLink, ExternalLink } from './types.js';

function iLink(source: string, dest: string): InternalLink {
  return { source_url: source, destination_url: dest, anchor_text: 'link', link_type: 'body_content', is_nofollow: false };
}

function eLink(source: string, dest: string, nofollow = false): ExternalLink {
  return { source_url: source, destination_url: dest, anchor_text: 'link', is_nofollow: nofollow };
}

// ── EQUITY_THRESHOLDS ────────────────────────────────────────────────────────

describe('EQUITY_THRESHOLDS', () => {
  it('critical equals 150', () => {
    assert.equal(EQUITY_THRESHOLDS.critical, 150);
  });

  it('low equals 25', () => {
    assert.equal(EQUITY_THRESHOLDS.low, 25);
  });
});

// ── detectEquityLeak ─────────────────────────────────────────────────────────

describe('detectEquityLeak', () => {
  it('returns critical for > 150 links', () => {
    const internal = Array.from({ length: 160 }, (_, i) => iLink('/page', `/t${i}`));
    const leak = detectEquityLeak('/page', internal, [], 50);
    assert.equal(leak.leak_severity, 'critical');
  });

  it('returns none for < 25 links', () => {
    const internal = Array.from({ length: 10 }, (_, i) => iLink('/page', `/t${i}`));
    const leak = detectEquityLeak('/page', internal, [], 50);
    assert.equal(leak.leak_severity, 'none');
  });

  it('returns high for >= 100 links', () => {
    const internal = Array.from({ length: 110 }, (_, i) => iLink('/page', `/t${i}`));
    const leak = detectEquityLeak('/page', internal, [], 50);
    assert.equal(leak.leak_severity, 'high');
  });

  it('returns medium for >= 50 links', () => {
    const internal = Array.from({ length: 60 }, (_, i) => iLink('/page', `/t${i}`));
    const leak = detectEquityLeak('/page', internal, [], 50);
    assert.equal(leak.leak_severity, 'medium');
  });

  it('returns low for >= 25 links', () => {
    const internal = Array.from({ length: 30 }, (_, i) => iLink('/page', `/t${i}`));
    const leak = detectEquityLeak('/page', internal, [], 50);
    assert.equal(leak.leak_severity, 'low');
  });

  it('calculates equity_per_link', () => {
    const internal = [iLink('/page', '/a'), iLink('/page', '/b')];
    const external = [eLink('/page', 'https://ext.com')];
    const leak = detectEquityLeak('/page', internal, external, 50);
    assert.equal(leak.equity_per_link, 33.33);
  });

  it('counts followed_external_links', () => {
    const external = [eLink('/page', 'https://a.com'), eLink('/page', 'https://b.com', true)];
    const leak = detectEquityLeak('/page', [], external, 50);
    assert.equal(leak.followed_external_links, 1);
    assert.equal(leak.nofollow_links, 1);
  });

  it('adds recommendations for > 150 links', () => {
    const internal = Array.from({ length: 160 }, (_, i) => iLink('/page', `/t${i}`));
    const leak = detectEquityLeak('/page', internal, [], 50);
    assert.ok(leak.recommendations.some(r => r.includes('severely over-linked')));
  });

  it('adds recommendations for > 10 followed external', () => {
    const external = Array.from({ length: 15 }, (_, i) => eLink('/page', `https://ext${i}.com`));
    const leak = detectEquityLeak('/page', [], external, 50);
    assert.ok(leak.recommendations.some(r => r.includes('nofollow')));
  });

  it('adds recommendation for > 50 total links', () => {
    const internal = Array.from({ length: 60 }, (_, i) => iLink('/page', `/t${i}`));
    const leak = detectEquityLeak('/page', internal, [], 50);
    assert.ok(leak.recommendations.some(r => r.includes('Reduce outbound')));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => detectEquityLeak(null as any, null as any, null as any, null as any));
  });
});

// ── detectAllEquityLeaks ─────────────────────────────────────────────────────

describe('detectAllEquityLeaks', () => {
  it('sorts by total_outbound desc', async () => {
    const internal = [
      iLink('/a', '/x'), iLink('/a', '/y'),
      iLink('/b', '/x'), iLink('/b', '/y'), iLink('/b', '/z'),
    ];
    const leaks = await detectAllEquityLeaks('s1', {
      loadLinksFn: async () => ({ internal, external: [] }),
      loadScoresFn: async () => new Map(),
    });
    assert.ok(leaks[0].total_outbound_links >= leaks[leaks.length - 1].total_outbound_links);
  });

  it('returns [] on error', async () => {
    const leaks = await detectAllEquityLeaks('s1', {
      loadLinksFn: async () => { throw new Error('db down'); },
    });
    assert.deepEqual(leaks, []);
  });

  it('returns [] for empty site_id', async () => {
    assert.deepEqual(await detectAllEquityLeaks(''), []);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => detectAllEquityLeaks(null as any, null as any));
  });
});
