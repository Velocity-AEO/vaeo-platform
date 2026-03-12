/**
 * apps/dashboard/lib/fix_expand_logic.test.ts
 *
 * Tests for fix row expand/collapse logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getExpandedFixId, isFixExpanded } from './fix_expand_logic.js';

// ── getExpandedFixId ─────────────────────────────────────────────────────────

describe('getExpandedFixId', () => {
  it('returns clicked_id when nothing is expanded', () => {
    assert.equal(getExpandedFixId(null, 'fix-1'), 'fix-1');
  });

  it('returns null when clicking the already expanded fix (collapse)', () => {
    assert.equal(getExpandedFixId('fix-1', 'fix-1'), null);
  });

  it('returns new id when clicking a different fix', () => {
    assert.equal(getExpandedFixId('fix-1', 'fix-2'), 'fix-2');
  });

  it('handles empty string clicked_id', () => {
    assert.equal(getExpandedFixId(null, ''), '');
  });

  it('never throws on null clicked_id', () => {
    assert.doesNotThrow(() => getExpandedFixId('fix-1', null as any));
  });

  it('never throws on undefined inputs', () => {
    assert.doesNotThrow(() => getExpandedFixId(undefined as any, undefined as any));
  });
});

// ── isFixExpanded ────────────────────────────────────────────────────────────

describe('isFixExpanded', () => {
  it('returns true when fix_id matches expanded_id', () => {
    assert.equal(isFixExpanded('fix-1', 'fix-1'), true);
  });

  it('returns false when fix_id does not match', () => {
    assert.equal(isFixExpanded('fix-1', 'fix-2'), false);
  });

  it('returns false when expanded_id is null', () => {
    assert.equal(isFixExpanded(null, 'fix-1'), false);
  });

  it('never throws on null fix_id', () => {
    assert.doesNotThrow(() => isFixExpanded('fix-1', null as any));
  });

  it('never throws on undefined inputs', () => {
    assert.doesNotThrow(() => isFixExpanded(undefined as any, undefined as any));
  });
});
