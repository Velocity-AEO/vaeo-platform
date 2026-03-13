import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getConflictTypeLabel,
  getConflictFixLabel,
  isAutoFixable,
  getLinkLimitSeverityColor,
} from './canonical_conflict_display.js';

// ── getConflictTypeLabel ─────────────────────────────────────────────────────

describe('getConflictTypeLabel', () => {
  it('returns label for links_to_non_canonical', () => {
    assert.equal(getConflictTypeLabel('links_to_non_canonical'), 'Links to Non-Canonical URL');
  });

  it('returns label for canonical_chain', () => {
    assert.equal(getConflictTypeLabel('canonical_chain'), 'Canonical Chain Detected');
  });

  it('returns label for self_canonical_mismatch', () => {
    assert.equal(getConflictTypeLabel('self_canonical_mismatch'), 'Self-Canonical Mismatch');
  });

  it('returns label for missing_canonical_on_target', () => {
    assert.equal(getConflictTypeLabel('missing_canonical_on_target'), 'Missing Canonical on Target');
  });

  it('returns Unknown Conflict for invalid type', () => {
    assert.equal(getConflictTypeLabel('bogus' as any), 'Unknown Conflict');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getConflictTypeLabel(null as any));
  });
});

// ── getConflictFixLabel ──────────────────────────────────────────────────────

describe('getConflictFixLabel', () => {
  it('returns Update Link for update_link_to_canonical', () => {
    assert.equal(getConflictFixLabel('update_link_to_canonical'), 'Update Link');
  });

  it('returns Add Canonical for add_canonical_to_target', () => {
    assert.equal(getConflictFixLabel('add_canonical_to_target'), 'Add Canonical');
  });

  it('returns Review for investigate', () => {
    assert.equal(getConflictFixLabel('investigate'), 'Review');
  });

  it('returns Review for unknown action', () => {
    assert.equal(getConflictFixLabel('bogus' as any), 'Review');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getConflictFixLabel(null as any));
  });
});

// ── isAutoFixable ────────────────────────────────────────────────────────────

describe('isAutoFixable', () => {
  it('returns true for update_link_to_canonical', () => {
    assert.equal(isAutoFixable('update_link_to_canonical'), true);
  });

  it('returns false for add_canonical_to_target', () => {
    assert.equal(isAutoFixable('add_canonical_to_target'), false);
  });

  it('returns false for investigate', () => {
    assert.equal(isAutoFixable('investigate'), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isAutoFixable(null as any));
  });
});

// ── getLinkLimitSeverityColor ────────────────────────────────────────────────

describe('getLinkLimitSeverityColor', () => {
  it('returns red for critical', () => {
    assert.equal(getLinkLimitSeverityColor('critical'), 'text-red-600');
  });

  it('returns orange for high', () => {
    assert.equal(getLinkLimitSeverityColor('high'), 'text-orange-600');
  });

  it('returns yellow for medium', () => {
    assert.equal(getLinkLimitSeverityColor('medium'), 'text-yellow-600');
  });

  it('returns slate for unknown severity', () => {
    assert.equal(getLinkLimitSeverityColor('bogus' as any), 'text-slate-600');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getLinkLimitSeverityColor(null as any));
  });
});
