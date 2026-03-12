/**
 * apps/dashboard/lib/nav_logic.test.ts
 *
 * Tests for dynamic nav logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNavItems, getNavState, type NavSite } from './nav_logic.js';

// ── buildNavItems ────────────────────────────────────────────────────────────

describe('buildNavItems', () => {
  it('maps sites to nav items with correct hrefs', () => {
    const sites: NavSite[] = [
      { site_id: 'abc', domain: 'myshop.com' },
      { site_id: 'def', domain: 'other.com' },
    ];
    const items = buildNavItems(sites);
    assert.equal(items.length, 2);
    assert.equal(items[0].label, 'myshop.com');
    assert.equal(items[0].href, '/client/abc');
    assert.equal(items[1].label, 'other.com');
    assert.equal(items[1].href, '/client/def');
  });

  it('returns [] for empty array', () => {
    assert.deepEqual(buildNavItems([]), []);
  });

  it('handles single site', () => {
    const items = buildNavItems([{ site_id: 's1', domain: 'one.com' }]);
    assert.equal(items.length, 1);
    assert.equal(items[0].href, '/client/s1');
  });

  it('includes platform in site but not in nav item', () => {
    const items = buildNavItems([{ site_id: 's1', domain: 'wp.com', platform: 'wordpress' }]);
    assert.equal(items[0].label, 'wp.com');
  });

  it('preserves site_id with special characters', () => {
    const items = buildNavItems([{ site_id: 'my-shop-123', domain: 'shop.com' }]);
    assert.equal(items[0].href, '/client/my-shop-123');
  });
});

// ── getNavState ──────────────────────────────────────────────────────────────

describe('getNavState', () => {
  it('returns loading when loading=true', () => {
    assert.equal(getNavState(null, true, false), 'loading');
  });

  it('returns loading even if sites present', () => {
    assert.equal(getNavState([{ site_id: 's1', domain: 'x.com' }], true, false), 'loading');
  });

  it('returns error when error=true', () => {
    assert.equal(getNavState(null, false, true), 'error');
  });

  it('returns empty when sites is null', () => {
    assert.equal(getNavState(null, false, false), 'empty');
  });

  it('returns empty when sites is empty array', () => {
    assert.equal(getNavState([], false, false), 'empty');
  });

  it('returns ready when sites present', () => {
    assert.equal(getNavState([{ site_id: 's1', domain: 'x.com' }], false, false), 'ready');
  });

  it('loading takes priority over error', () => {
    assert.equal(getNavState(null, true, true), 'loading');
  });

  it('error takes priority over empty', () => {
    assert.equal(getNavState([], false, true), 'error');
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('nav_logic — never throws', () => {
  it('buildNavItems with empty input', () => {
    assert.ok(Array.isArray(buildNavItems([])));
  });
});
