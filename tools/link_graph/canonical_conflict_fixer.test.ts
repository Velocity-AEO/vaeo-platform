import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fixCanonicalConflict,
  bulkFixCanonicalConflicts,
} from './canonical_conflict_fixer.js';
import type { CanonicalConflict } from './canonical_conflict_detector.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConflict(overrides?: Partial<CanonicalConflict>): CanonicalConflict {
  return {
    source_url: 'https://a.com/blog',
    linked_url: 'https://a.com/page?v=1',
    canonical_url: 'https://a.com/page',
    conflict_type: 'links_to_non_canonical',
    equity_impact: 'high',
    fix_action: 'update_link_to_canonical',
    fix_href: 'https://a.com/page',
    description: 'test conflict',
    ...overrides,
  };
}

// ── fixCanonicalConflict ─────────────────────────────────────────────────────

describe('fixCanonicalConflict', () => {
  it('succeeds with shopify handler', async () => {
    const result = await fixCanonicalConflict(makeConflict(), 'site_1', 'shopify', {
      shopifyFn: async () => true,
    });
    assert.equal(result.success, true);
    assert.ok(result.fix_applied.length > 0);
  });

  it('succeeds with wordpress handler', async () => {
    const result = await fixCanonicalConflict(makeConflict(), 'site_1', 'wordpress', {
      wpFn: async () => true,
    });
    assert.equal(result.success, true);
  });

  it('skips non-fixable actions', async () => {
    const result = await fixCanonicalConflict(
      makeConflict({ fix_action: 'investigate' }),
      'site_1',
      'shopify',
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('manual review'));
  });

  it('returns false on handler failure', async () => {
    const result = await fixCanonicalConflict(makeConflict(), 'site_1', 'shopify', {
      shopifyFn: async () => false,
    });
    assert.equal(result.success, false);
  });

  it('returns false on error', async () => {
    const result = await fixCanonicalConflict(makeConflict(), 'site_1', 'shopify', {
      shopifyFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result.success, false);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => fixCanonicalConflict(null as any, null as any, null as any));
  });
});

// ── bulkFixCanonicalConflicts ────────────────────────────────────────────────

describe('bulkFixCanonicalConflicts', () => {
  it('skips investigate conflicts', async () => {
    const conflicts = [
      makeConflict({ fix_action: 'investigate' }),
      makeConflict({ fix_action: 'add_canonical_to_target' }),
    ];
    const result = await bulkFixCanonicalConflicts(conflicts, 'site_1', 'shopify', {
      fixFn: async () => ({ success: true, fix_applied: 'done', error: null }),
    });
    assert.equal(result.skipped, 2);
    assert.equal(result.fixed, 0);
  });

  it('counts fixed correctly', async () => {
    const conflicts = [makeConflict(), makeConflict()];
    const result = await bulkFixCanonicalConflicts(conflicts, 'site_1', 'shopify', {
      fixFn: async () => ({ success: true, fix_applied: 'done', error: null }),
    });
    assert.equal(result.fixed, 2);
  });

  it('counts skipped correctly', async () => {
    const conflicts = [
      makeConflict(),
      makeConflict({ fix_action: 'investigate' }),
    ];
    const result = await bulkFixCanonicalConflicts(conflicts, 'site_1', 'shopify', {
      fixFn: async () => ({ success: true, fix_applied: 'done', error: null }),
    });
    assert.equal(result.skipped, 1);
    assert.equal(result.fixed, 1);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => bulkFixCanonicalConflicts(null as any, null as any, null as any));
  });
});
