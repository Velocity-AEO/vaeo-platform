/**
 * packages/commands/src/approve.test.ts
 *
 * Tests for runApprove.
 * All external deps (Supabase, readline) are injected via ApproveCommandOps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runApprove,
  formatSummary,
  type ApproveRequest,
  type ApproveCommandOps,
  type PendingApprovalItem,
} from './approve.js';
import type { ReasoningBlock } from '../../../tools/reasoning/generate_block.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SITE_ID   = 'site-uuid-001';
const TENANT_ID = 'tenant-uuid-001';

const REASONING_BLOCK: ReasoningBlock = {
  detected:           { issue: 'Missing <title> tag', current_value: null },
  why:                'Page has no <title> element or title is empty',
  proposed:           { change: 'Add a descriptive, keyword-optimised title tag', target_value: 'Beach Hat | Cococabana Life' },
  risk_score:         3,
  blast_radius:       1,
  dependency_check:   [],
  visual_change_flag: true,
  options:            [
    { label: 'Generate from page content', description: 'Create a title from the page heading', risk_delta: 0, effort: 'low', tradeoff: 'Automated' },
    { label: 'Manual title creation', description: 'Flag for manual writing', risk_delta: -2, effort: 'high', tradeoff: 'Best quality' },
  ],
  recommended_option: 'Generate from page content',
  confidence:         0.85,
};

let counter = 0;
function makeItem(overrides: Partial<PendingApprovalItem> = {}): PendingApprovalItem {
  counter++;
  return {
    id:               `item-uuid-${counter.toString().padStart(3, '0')}`,
    run_id:           'run-uuid-001',
    tenant_id:        TENANT_ID,
    site_id:          SITE_ID,
    issue_type:       'META_TITLE_MISSING',
    url:              `https://cococabanalife.com/products/hat-${counter}`,
    risk_score:       3,
    priority:         5,
    proposed_fix:     { action: 'generate_title' },
    execution_status: 'pending_approval',
    reasoning_block:  REASONING_BLOCK,
    ...overrides,
  };
}

function baseReq(overrides: Partial<ApproveRequest> = {}): ApproveRequest {
  return { site: 'cococabanalife.com', approve_all: false, ...overrides };
}

function happyOps(overrides: Partial<ApproveCommandOps> = {}): Partial<ApproveCommandOps> {
  return {
    lookupSiteByDomain: async () => ({ site_id: SITE_ID, tenant_id: TENANT_ID }),
    loadPendingItems:   async () => [makeItem(), makeItem(), makeItem()],
    markApproved:       async () => {},
    markSkipped:        async () => {},
    displaySummary:     () => {},
    promptUser:         async () => 'y',
    ...overrides,
  };
}

// ── runApprove — bulk approve (--all) ───────────────────────────────────────

describe('runApprove — bulk approve with --all', () => {
  it('approves all items without prompting', async () => {
    let promptCalled = false;
    const items = [makeItem(), makeItem(), makeItem()];
    const result = await runApprove(baseReq({ approve_all: true }), happyOps({
      loadPendingItems: async () => items,
      promptUser:       async () => { promptCalled = true; return 'y'; },
    }));
    assert.equal(result.approved, 3);
    assert.equal(result.skipped, 0);
    assert.equal(result.deferred, 0);
    assert.equal(result.total, 3);
    assert.equal(result.status, 'completed');
    assert.equal(promptCalled, false, 'promptUser should not be called in --all mode');
  });

  it('calls markApproved for each item', async () => {
    const approvedIds: string[] = [];
    const items = [makeItem(), makeItem()];
    await runApprove(baseReq({ approve_all: true }), happyOps({
      loadPendingItems: async () => items,
      markApproved:     async (id) => { approvedIds.push(id); },
    }));
    assert.equal(approvedIds.length, 2);
    assert.deepEqual(new Set(approvedIds), new Set(items.map((i) => i.id)));
  });

  it('does not call displaySummary in --all mode', async () => {
    let displayCalled = false;
    await runApprove(baseReq({ approve_all: true }), happyOps({
      loadPendingItems: async () => [makeItem()],
      displaySummary:   () => { displayCalled = true; },
    }));
    assert.equal(displayCalled, false);
  });
});

// ── runApprove — interactive mode (y/n/skip) ────────────────────────────────

describe('runApprove — interactive per-item prompting', () => {
  it('approves items when user answers y', async () => {
    const approvedIds: string[] = [];
    const items = [makeItem(), makeItem()];
    const result = await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => items,
      promptUser:       async () => 'y',
      markApproved:     async (id) => { approvedIds.push(id); },
    }));
    assert.equal(result.approved, 2);
    assert.equal(approvedIds.length, 2);
  });

  it('skips items when user answers n', async () => {
    const skippedIds: string[] = [];
    const items = [makeItem(), makeItem()];
    const result = await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => items,
      promptUser:       async () => 'n',
      markSkipped:      async (id) => { skippedIds.push(id); },
    }));
    assert.equal(result.skipped, 2);
    assert.equal(result.approved, 0);
    assert.equal(skippedIds.length, 2);
  });

  it('defers items when user answers skip', async () => {
    const result = await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => [makeItem(), makeItem()],
      promptUser:       async () => 'skip',
    }));
    assert.equal(result.deferred, 2);
    assert.equal(result.approved, 0);
    assert.equal(result.skipped, 0);
  });

  it('handles mixed decisions: y, n, skip', async () => {
    let callCount = 0;
    const result = await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => [makeItem(), makeItem(), makeItem()],
      promptUser: async () => {
        callCount++;
        if (callCount === 1) return 'y';
        if (callCount === 2) return 'n';
        return 'skip';
      },
    }));
    assert.equal(result.approved, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.deferred, 1);
    assert.equal(result.total, 3);
  });

  it('calls displaySummary before each prompt', async () => {
    const displayedIds: string[] = [];
    const items = [makeItem(), makeItem()];
    await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => items,
      displaySummary:   (item) => { displayedIds.push(item.id); },
      promptUser:       async () => 'y',
    }));
    assert.equal(displayedIds.length, 2);
    assert.deepEqual(displayedIds, items.map((i) => i.id));
  });

  it('markApproved is NOT called when user answers n', async () => {
    let approveCalled = false;
    await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => [makeItem()],
      promptUser:       async () => 'n',
      markApproved:     async () => { approveCalled = true; },
    }));
    assert.equal(approveCalled, false);
  });

  it('markSkipped is NOT called when user answers y', async () => {
    let skipCalled = false;
    await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => [makeItem()],
      promptUser:       async () => 'y',
      markSkipped:      async () => { skipCalled = true; },
    }));
    assert.equal(skipCalled, false);
  });

  it('neither markApproved nor markSkipped called when user answers skip', async () => {
    let approveCalled = false;
    let skipCalled = false;
    await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => [makeItem()],
      promptUser:       async () => 'skip',
      markApproved:     async () => { approveCalled = true; },
      markSkipped:      async () => { skipCalled = true; },
    }));
    assert.equal(approveCalled, false);
    assert.equal(skipCalled, false);
  });
});

// ── runApprove — validation failures ────────────────────────────────────────

describe('runApprove — validation', () => {
  it('returns failed when site is empty', async () => {
    const result = await runApprove(baseReq({ site: '' }), happyOps());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('site domain is required'));
  });

  it('returns failed when site not found', async () => {
    const result = await runApprove(baseReq(), happyOps({
      lookupSiteByDomain: async () => null,
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Site not found'));
  });

  it('returns failed when loadPendingItems throws', async () => {
    const result = await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => { throw new Error('DB timeout'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('DB timeout'));
  });

  it('returns completed with zeros when no pending items', async () => {
    const result = await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => [],
    }));
    assert.equal(result.status, 'completed');
    assert.equal(result.approved, 0);
    assert.equal(result.total, 0);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      runApprove(baseReq(), happyOps({
        lookupSiteByDomain: async () => { throw new Error('crash'); },
      })),
    );
  });
});

// ── runApprove — error resilience ───────────────────────────────────────────

describe('runApprove — error resilience', () => {
  it('markApproved failure → item counted as deferred, others continue', async () => {
    let callCount = 0;
    const result = await runApprove(baseReq({ approve_all: true }), happyOps({
      loadPendingItems: async () => [makeItem(), makeItem(), makeItem()],
      markApproved: async () => {
        callCount++;
        if (callCount === 2) throw new Error('db error');
      },
    }));
    assert.equal(result.approved, 2);
    assert.equal(result.deferred, 1);
    assert.equal(result.status, 'completed');
  });

  it('markSkipped failure → item counted as deferred', async () => {
    const result = await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => [makeItem()],
      promptUser:       async () => 'n',
      markSkipped:      async () => { throw new Error('db error'); },
    }));
    assert.equal(result.skipped, 0);
    assert.equal(result.deferred, 1);
  });

  it('promptUser failure → item counted as deferred', async () => {
    const result = await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => [makeItem()],
      promptUser:       async () => { throw new Error('readline error'); },
    }));
    assert.equal(result.deferred, 1);
    assert.equal(result.approved, 0);
  });
});

// ── runApprove — totals always add up ───────────────────────────────────────

describe('runApprove — approved + skipped + deferred === total', () => {
  it('bulk approve: all approved', async () => {
    const result = await runApprove(baseReq({ approve_all: true }), happyOps({
      loadPendingItems: async () => [makeItem(), makeItem(), makeItem(), makeItem()],
    }));
    assert.equal(result.approved + result.skipped + result.deferred, result.total);
    assert.equal(result.total, 4);
  });

  it('interactive mixed: totals add up', async () => {
    let callCount = 0;
    const result = await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => [makeItem(), makeItem(), makeItem(), makeItem(), makeItem()],
      promptUser: async () => {
        callCount++;
        if (callCount <= 2) return 'y';
        if (callCount === 3) return 'n';
        return 'skip';
      },
    }));
    assert.equal(result.approved + result.skipped + result.deferred, result.total);
    assert.equal(result.approved, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.deferred, 2);
  });
});

// ── formatSummary ───────────────────────────────────────────────────────────

describe('formatSummary', () => {
  it('includes issue, URL, confidence, risk, and blast radius', () => {
    const item = makeItem();
    const output = formatSummary(item);
    assert.ok(output.includes('META_TITLE_MISSING'));
    assert.ok(output.includes(item.url));
    assert.ok(output.includes('85%'));     // confidence 0.85
    assert.ok(output.includes('3/10'));    // risk_score
    assert.ok(output.includes('1 URL'));   // blast_radius
    assert.ok(output.includes('Missing <title> tag'));
    assert.ok(output.includes('Generate from page content'));
  });

  it('shows visual change warning when flag is true', () => {
    const item = makeItem();
    const output = formatSummary(item);
    assert.ok(output.includes('Visual change expected'));
  });

  it('shows dependencies when present', () => {
    const item = makeItem({
      reasoning_block: { ...REASONING_BLOCK, dependency_check: ['META_DESC_MISSING', 'H1_MISSING'] },
    });
    const output = formatSummary(item);
    assert.ok(output.includes('META_DESC_MISSING'));
    assert.ok(output.includes('H1_MISSING'));
  });

  it('handles null reasoning_block gracefully', () => {
    const item = makeItem({ reasoning_block: null });
    const output = formatSummary(item);
    assert.ok(output.includes('no reasoning block'));
  });

  it('handles null current_value', () => {
    const output = formatSummary(makeItem());
    assert.ok(output.includes('(none)'));
  });

  it('pluralizes blast_radius correctly', () => {
    const single = formatSummary(makeItem({ reasoning_block: { ...REASONING_BLOCK, blast_radius: 1 } }));
    const multi  = formatSummary(makeItem({ reasoning_block: { ...REASONING_BLOCK, blast_radius: 5 } }));
    assert.ok(single.includes('1 URL'));
    assert.ok(!single.includes('1 URLs'));
    assert.ok(multi.includes('5 URLs'));
  });
});

// ── Result shape ────────────────────────────────────────────────────────────

describe('runApprove — result shape', () => {
  it('completed_at is a valid ISO 8601 timestamp', async () => {
    const result = await runApprove(baseReq({ approve_all: true }), happyOps({
      loadPendingItems: async () => [makeItem()],
    }));
    assert.ok(!isNaN(Date.parse(result.completed_at)));
  });

  it('site is echoed back in result', async () => {
    const result = await runApprove(baseReq(), happyOps({
      loadPendingItems: async () => [],
    }));
    assert.equal(result.site, 'cococabanalife.com');
  });
});
