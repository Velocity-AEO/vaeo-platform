/**
 * tools/multisite/multisite_api_logic.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMultisiteResponse,
  buildEmptyMultisiteResponse,
  getMultisiteCacheHeader,
  parseAccountIdParam,
  type MultisiteResponse,
} from './multisite_api_logic.ts';
import type { MultisiteSummary } from './multisite_aggregator.ts';
import type { AccountSites }     from './multisite_account_resolver.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptySummary(account_id = 'acc_1'): MultisiteSummary {
  return {
    account_id,
    total_sites:            2,
    healthy_sites:          1,
    needs_attention_sites:  1,
    critical_sites:         0,
    no_data_sites:          0,
    total_fixes_applied_7d: 5,
    total_open_issues:      3,
    average_health_score:   75,
    snapshots:              [],
    generated_at:           new Date().toISOString(),
  };
}

function acct(overrides?: Partial<AccountSites>): AccountSites {
  return {
    account_id:   'acc_1',
    account_type: 'direct',
    site_ids:     ['s1', 's2'],
    site_count:   2,
    ...overrides,
  };
}

// ── buildMultisiteResponse ────────────────────────────────────────────────────

describe('buildMultisiteResponse', () => {
  it('preserves account_id', () => {
    const r = buildMultisiteResponse(acct({ account_id: 'my_acc' }), emptySummary());
    assert.equal(r.account_id, 'my_acc');
  });

  it('preserves account_type', () => {
    const r = buildMultisiteResponse(acct({ account_type: 'agency' }), emptySummary());
    assert.equal(r.account_type, 'agency');
  });

  it('show_multisite_dashboard is true for agency', () => {
    const r = buildMultisiteResponse(acct({ account_type: 'agency', site_count: 1 }), emptySummary());
    assert.equal(r.show_multisite_dashboard, true);
  });

  it('show_multisite_dashboard is true for direct with >1 sites', () => {
    const r = buildMultisiteResponse(acct({ account_type: 'direct', site_count: 2 }), emptySummary());
    assert.equal(r.show_multisite_dashboard, true);
  });

  it('show_multisite_dashboard is false for direct with 1 site', () => {
    const r = buildMultisiteResponse(acct({ account_type: 'direct', site_count: 1 }), emptySummary());
    assert.equal(r.show_multisite_dashboard, false);
  });

  it('includes summary in response', () => {
    const s = emptySummary();
    const r = buildMultisiteResponse(acct(), s);
    assert.equal(r.summary.total_sites, 2);
  });

  it('never throws on null account', () => {
    assert.doesNotThrow(() => buildMultisiteResponse(null as never, emptySummary()));
  });
});

// ── buildEmptyMultisiteResponse ───────────────────────────────────────────────

describe('buildEmptyMultisiteResponse', () => {
  it('sets account_id', () => {
    const r = buildEmptyMultisiteResponse('acc_x');
    assert.equal(r.account_id, 'acc_x');
  });

  it('sets show_multisite_dashboard to false', () => {
    const r = buildEmptyMultisiteResponse('acc_x');
    assert.equal(r.show_multisite_dashboard, false);
  });

  it('summary has 0 total_sites', () => {
    const r = buildEmptyMultisiteResponse('acc_x');
    assert.equal(r.summary.total_sites, 0);
  });

  it('never throws on empty string', () => {
    assert.doesNotThrow(() => buildEmptyMultisiteResponse(''));
  });
});

// ── getMultisiteCacheHeader ───────────────────────────────────────────────────

describe('getMultisiteCacheHeader', () => {
  it('returns short TTL for agency', () => {
    const h = getMultisiteCacheHeader('agency');
    assert.ok(h.includes('max-age=60'));
  });

  it('returns no-store for direct', () => {
    assert.equal(getMultisiteCacheHeader('direct'), 'no-store');
  });

  it('returns no-store for unknown type', () => {
    assert.equal(getMultisiteCacheHeader('unknown'), 'no-store');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getMultisiteCacheHeader(null as never));
  });
});

// ── parseAccountIdParam ───────────────────────────────────────────────────────

describe('parseAccountIdParam', () => {
  it('returns trimmed string for valid input', () => {
    assert.equal(parseAccountIdParam('  acc_1  '), 'acc_1');
  });

  it('returns null for empty string', () => {
    assert.equal(parseAccountIdParam(''), null);
  });

  it('returns null for null', () => {
    assert.equal(parseAccountIdParam(null), null);
  });

  it('returns null for undefined', () => {
    assert.equal(parseAccountIdParam(undefined), null);
  });

  it('returns null for number input', () => {
    assert.equal(parseAccountIdParam(123), null);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => parseAccountIdParam(Symbol() as never));
  });
});
