/**
 * handler.test.ts
 *
 * Tests for getFixes and updateFix.
 * All database access mocked via injectable FixesDeps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getFixes,
  updateFix,
  type FixesDeps,
  type ActionQueueRow,
  type SnapshotRow,
} from './handler.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SITE_ID = 'site-uuid-001';

let counter = 0;
function makeAction(overrides: Partial<ActionQueueRow> = {}): ActionQueueRow {
  counter++;
  return {
    id:               `action-${counter.toString().padStart(3, '0')}`,
    url:              `https://example.com/products/hat-${counter}`,
    issue_type:       'title_missing',
    proposed_fix:     { new_title: 'Beach Hat | Example', confidence_score: 0.88 },
    execution_status: 'pending_approval',
    priority:         5,
    risk_score:       3,
    reasoning_block:  { detected: { issue: 'Missing title' }, risk_score: 3 },
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    url:           'https://example.com/products/hat-1',
    field_name:    'title',
    current_value: 'Old Title',
    ...overrides,
  };
}

function happyDeps(overrides: Partial<FixesDeps> = {}): FixesDeps {
  return {
    loadActions:   async () => [makeAction(), makeAction({ issue_type: 'meta_missing', proposed_fix: { new_description: 'Shop hats', confidence_score: 0.82 } })],
    loadSnapshots: async () => [
      makeSnapshot(),
      makeSnapshot({ url: 'https://example.com/products/hat-2', field_name: 'meta_description', current_value: null }),
    ],
    updateStatus:  async () => {},
    ...overrides,
  };
}

// ── getFixes — happy path ─────────────────────────────────────────────────────

describe('getFixes — happy path', () => {
  it('returns fixes array', async () => {
    const result = await getFixes(SITE_ID, happyDeps());
    assert.ok(Array.isArray(result.fixes));
    assert.equal(result.fixes.length, 2);
    assert.equal(result.error, undefined);
  });

  it('each fix has the required shape', async () => {
    const result = await getFixes(SITE_ID, happyDeps());
    for (const fix of result.fixes) {
      assert.ok('id' in fix);
      assert.ok('url' in fix);
      assert.ok('issue_type' in fix);
      assert.ok('current_value' in fix);
      assert.ok('proposed_value' in fix);
      assert.ok('confidence' in fix);
      assert.ok('status' in fix);
      assert.ok('reasoning_block' in fix);
    }
  });

  it('extracts proposed_value from proposed_fix.new_title', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [makeAction({ proposed_fix: { new_title: 'My Title', confidence_score: 0.9 } })],
    }));
    assert.equal(result.fixes[0].proposed_value, 'My Title');
  });

  it('extracts proposed_value from proposed_fix.new_description', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [makeAction({ issue_type: 'meta_missing', proposed_fix: { new_description: 'My Desc', confidence_score: 0.85 } })],
    }));
    assert.equal(result.fixes[0].proposed_value, 'My Desc');
  });

  it('extracts proposed_value from proposed_fix.new_h1', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [makeAction({ issue_type: 'h1_missing', proposed_fix: { new_h1: 'Heading', confidence: 0.9 } })],
    }));
    assert.equal(result.fixes[0].proposed_value, 'Heading');
  });

  it('returns null proposed_value when no recognized key', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [makeAction({ proposed_fix: { some_other: 'value' } })],
    }));
    assert.equal(result.fixes[0].proposed_value, null);
  });

  it('extracts confidence from confidence_score', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [makeAction({ proposed_fix: { new_title: 'T', confidence_score: 0.95 } })],
    }));
    assert.equal(result.fixes[0].confidence, 0.95);
  });

  it('extracts confidence from confidence fallback', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [makeAction({ proposed_fix: { new_title: 'T', confidence: 0.77 } })],
    }));
    assert.equal(result.fixes[0].confidence, 0.77);
  });

  it('defaults confidence to 0.8 when not present', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [makeAction({ proposed_fix: { new_title: 'T' } })],
    }));
    assert.equal(result.fixes[0].confidence, 0.8);
  });

  it('maps status from execution_status', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [
        makeAction({ execution_status: 'pending_approval' }),
        makeAction({ execution_status: 'approved' }),
        makeAction({ execution_status: 'completed' }),
      ],
    }));
    assert.equal(result.fixes[0].status, 'pending_approval');
    assert.equal(result.fixes[1].status, 'approved');
    assert.equal(result.fixes[2].status, 'completed');
  });

  it('includes reasoning_block', async () => {
    const rb = { detected: { issue: 'Missing title' }, risk_score: 3 };
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [makeAction({ reasoning_block: rb })],
    }));
    assert.deepEqual(result.fixes[0].reasoning_block, rb);
  });

  it('handles null reasoning_block', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [makeAction({ reasoning_block: null })],
    }));
    assert.equal(result.fixes[0].reasoning_block, null);
  });
});

// ── getFixes — current_value matching ─────────────────────────────────────────

describe('getFixes — current_value from snapshots', () => {
  it('matches snapshot by url + field_name derived from issue_type', async () => {
    const action = makeAction({ url: 'https://example.com/page', issue_type: 'title_missing' });
    const snap = makeSnapshot({ url: 'https://example.com/page', field_name: 'title', current_value: 'Old Title' });
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions:   async () => [action],
      loadSnapshots: async () => [snap],
    }));
    assert.equal(result.fixes[0].current_value, 'Old Title');
  });

  it('returns null current_value when no matching snapshot', async () => {
    const action = makeAction({ url: 'https://example.com/page', issue_type: 'title_missing' });
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions:   async () => [action],
      loadSnapshots: async () => [], // no snapshots
    }));
    assert.equal(result.fixes[0].current_value, null);
  });

  it('maps meta_missing to meta_description field_name', async () => {
    const action = makeAction({ url: 'https://example.com/page', issue_type: 'meta_missing' });
    const snap = makeSnapshot({ url: 'https://example.com/page', field_name: 'meta_description', current_value: 'Old desc' });
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions:   async () => [action],
      loadSnapshots: async () => [snap],
    }));
    assert.equal(result.fixes[0].current_value, 'Old desc');
  });

  it('maps META_TITLE_MISSING to title field_name', async () => {
    const action = makeAction({ url: 'https://example.com/page', issue_type: 'META_TITLE_MISSING' });
    const snap = makeSnapshot({ url: 'https://example.com/page', field_name: 'title', current_value: 'Current Title' });
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions:   async () => [action],
      loadSnapshots: async () => [snap],
    }));
    assert.equal(result.fixes[0].current_value, 'Current Title');
  });

  it('maps h1_missing to h1 field_name', async () => {
    const action = makeAction({ url: 'https://example.com/page', issue_type: 'h1_missing' });
    const snap = makeSnapshot({ url: 'https://example.com/page', field_name: 'h1', current_value: 'Old H1' });
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions:   async () => [action],
      loadSnapshots: async () => [snap],
    }));
    assert.equal(result.fixes[0].current_value, 'Old H1');
  });

  it('maps canonical_missing to canonical field_name', async () => {
    const action = makeAction({ url: 'https://example.com/page', issue_type: 'canonical_missing' });
    const snap = makeSnapshot({ url: 'https://example.com/page', field_name: 'canonical', current_value: 'https://example.com/page' });
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions:   async () => [action],
      loadSnapshots: async () => [snap],
    }));
    assert.equal(result.fixes[0].current_value, 'https://example.com/page');
  });

  it('maps schema_missing to schema field_name', async () => {
    const action = makeAction({ url: 'https://example.com/page', issue_type: 'schema_missing' });
    const snap = makeSnapshot({ url: 'https://example.com/page', field_name: 'schema', current_value: '{}' });
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions:   async () => [action],
      loadSnapshots: async () => [snap],
    }));
    assert.equal(result.fixes[0].current_value, '{}');
  });
});

// ── getFixes — empty / edge cases ─────────────────────────────────────────────

describe('getFixes — edge cases', () => {
  it('returns empty array when no actions', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [],
    }));
    assert.equal(result.fixes.length, 0);
  });

  it('returns error when loadActions throws', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => { throw new Error('DB down'); },
    }));
    assert.ok(result.error?.includes('DB down'));
    assert.equal(result.fixes.length, 0);
  });

  it('returns error when loadSnapshots throws', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadSnapshots: async () => { throw new Error('snapshot error'); },
    }));
    assert.ok(result.error?.includes('snapshot error'));
    assert.equal(result.fixes.length, 0);
  });

  it('handles actions with empty proposed_fix', async () => {
    const result = await getFixes(SITE_ID, happyDeps({
      loadActions: async () => [makeAction({ proposed_fix: {} })],
    }));
    assert.equal(result.fixes[0].proposed_value, null);
    assert.equal(result.fixes[0].confidence, 0.8);
  });
});

// ── updateFix — approve ──────────────────────────────────────────────────────

describe('updateFix — approve', () => {
  it('returns ok with execution_status approved', async () => {
    const result = await updateFix(SITE_ID, 'fix-001', 'approve', happyDeps());
    assert.equal(result.ok, true);
    assert.equal(result.execution_status, 'approved');
  });

  it('calls updateStatus with correct args', async () => {
    let calledWith: { id: string; siteId: string; status: string } | null = null;
    await updateFix(SITE_ID, 'fix-001', 'approve', happyDeps({
      updateStatus: async (id, siteId, status) => { calledWith = { id, siteId, status }; },
    }));
    assert.deepEqual(calledWith, { id: 'fix-001', siteId: SITE_ID, status: 'approved' });
  });
});

// ── updateFix — skip ─────────────────────────────────────────────────────────

describe('updateFix — skip', () => {
  it('returns ok with execution_status skipped', async () => {
    const result = await updateFix(SITE_ID, 'fix-001', 'skip', happyDeps());
    assert.equal(result.ok, true);
    assert.equal(result.execution_status, 'skipped');
  });

  it('calls updateStatus with skipped', async () => {
    let calledStatus = '';
    await updateFix(SITE_ID, 'fix-001', 'skip', happyDeps({
      updateStatus: async (_id, _siteId, status) => { calledStatus = status; },
    }));
    assert.equal(calledStatus, 'skipped');
  });
});

// ── updateFix — validation ───────────────────────────────────────────────────

describe('updateFix — validation', () => {
  it('rejects missing id', async () => {
    const result = await updateFix(SITE_ID, '', 'approve', happyDeps());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('id is required'));
  });

  it('rejects invalid action', async () => {
    const result = await updateFix(SITE_ID, 'fix-001', 'invalid', happyDeps());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('action must be'));
  });

  it('rejects action "deploy"', async () => {
    const result = await updateFix(SITE_ID, 'fix-001', 'deploy', happyDeps());
    assert.equal(result.ok, false);
  });
});

// ── updateFix — error handling ───────────────────────────────────────────────

describe('updateFix — error handling', () => {
  it('returns error when updateStatus throws', async () => {
    const result = await updateFix(SITE_ID, 'fix-001', 'approve', happyDeps({
      updateStatus: async () => { throw new Error('DB write failed'); },
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('DB write failed'));
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      updateFix(SITE_ID, 'fix-001', 'approve', happyDeps({
        updateStatus: async () => { throw new Error('crash'); },
      })),
    );
  });
});
