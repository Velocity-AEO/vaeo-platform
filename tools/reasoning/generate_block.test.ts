/**
 * tools/reasoning/generate_block.test.ts
 *
 * Unit tests for the Reasoning Block engine.
 * Uses node:test + node:assert — no external test framework needed.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateReasoningBlock,
  generateReasoningBlocks,
  type ActionRow,
  type ReasoningBlock,
  type ReasoningDeps,
} from './generate_block.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ActionRow> = {}): ActionRow {
  return {
    id:                'act-001',
    run_id:            'run-001',
    tenant_id:         '00000000-0000-0000-0000-000000000001',
    site_id:           'site-001',
    issue_type:        'META_TITLE_MISSING',
    url:               'https://example.com/products/widget',
    risk_score:        3,
    priority:          5,
    proposed_fix:      {},
    approval_required: false,
    execution_status:  'queued',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ReasoningDeps> = {}): ReasoningDeps & { stored: Map<string, ReasoningBlock> } {
  const stored = new Map<string, ReasoningBlock>();
  return {
    stored,
    countUrlsAffected: async () => 3,
    findSiblingIssues: async () => [],
    storeBlock: async (id, block) => { stored.set(id, block); },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generateReasoningBlock', () => {

  // ── Structure validation ───────────────────────────────────────────────

  it('returns a complete ReasoningBlock with all required fields', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow(), deps);

    // All required top-level fields
    assert.ok(block.detected);
    assert.ok(typeof block.detected.issue === 'string');
    assert.ok('current_value' in block.detected);
    assert.ok(typeof block.why === 'string');
    assert.ok(block.proposed);
    assert.ok(typeof block.proposed.change === 'string');
    assert.ok('target_value' in block.proposed);
    assert.ok(typeof block.risk_score === 'number');
    assert.ok(typeof block.blast_radius === 'number');
    assert.ok(Array.isArray(block.dependency_check));
    assert.ok(typeof block.visual_change_flag === 'boolean');
    assert.ok(Array.isArray(block.options));
    assert.ok(typeof block.recommended_option === 'string');
    assert.ok(typeof block.confidence === 'number');
  });

  it('options array has at least 2 entries', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow(), deps);
    assert.ok(block.options.length >= 2, `Expected ≥2 options, got ${block.options.length}`);
  });

  it('each option has label, description, risk_delta, effort, tradeoff', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow(), deps);

    for (const opt of block.options) {
      assert.ok(typeof opt.label === 'string', 'option.label is string');
      assert.ok(typeof opt.description === 'string', 'option.description is string');
      assert.ok(typeof opt.risk_delta === 'number', 'option.risk_delta is number');
      assert.ok(['low', 'medium', 'high'].includes(opt.effort), `option.effort is valid: ${opt.effort}`);
      assert.ok(typeof opt.tradeoff === 'string', 'option.tradeoff is string');
    }
  });

  it('recommended_option matches one of the option labels', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow(), deps);
    const labels = block.options.map(o => o.label);
    assert.ok(labels.includes(block.recommended_option), `"${block.recommended_option}" not in [${labels.join(', ')}]`);
  });

  it('risk_score matches the input row risk_score', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow({ risk_score: 7 }), deps);
    assert.equal(block.risk_score, 7);
  });

  it('confidence is between 0.0 and 1.0', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow(), deps);
    assert.ok(block.confidence >= 0.0, `confidence ${block.confidence} >= 0`);
    assert.ok(block.confidence <= 1.0, `confidence ${block.confidence} <= 1`);
  });

  // ── Persistence ────────────────────────────────────────────────────────

  it('calls storeBlock with the action ID and generated block', async () => {
    const deps = makeDeps();
    const row = makeRow({ id: 'act-42' });
    const block = await generateReasoningBlock(row, deps);

    assert.ok(deps.stored.has('act-42'), 'storeBlock was called with correct ID');
    assert.deepStrictEqual(deps.stored.get('act-42'), block);
  });

  // ── blast_radius ───────────────────────────────────────────────────────

  it('blast_radius reflects countUrlsAffected result', async () => {
    const deps = makeDeps({ countUrlsAffected: async () => 42 });
    const block = await generateReasoningBlock(makeRow(), deps);
    assert.equal(block.blast_radius, 42);
  });

  // ── dependency_check ───────────────────────────────────────────────────

  it('dependency_check reflects sibling issues on the same URL', async () => {
    const deps = makeDeps({
      findSiblingIssues: async () => ['H1_MISSING', 'SCHEMA_MISSING'],
    });
    const block = await generateReasoningBlock(makeRow(), deps);
    assert.deepStrictEqual(block.dependency_check, ['H1_MISSING', 'SCHEMA_MISSING']);
  });

  it('dependency_check is empty array when no siblings', async () => {
    const deps = makeDeps({ findSiblingIssues: async () => [] });
    const block = await generateReasoningBlock(makeRow(), deps);
    assert.deepStrictEqual(block.dependency_check, []);
  });

  // ── Issue-type specific behaviour ──────────────────────────────────────

  it('META_TITLE_MISSING sets visual_change_flag = true', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow({ issue_type: 'META_TITLE_MISSING' }), deps);
    assert.equal(block.visual_change_flag, true);
  });

  it('ERR_404 sets visual_change_flag = false', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow({ issue_type: 'ERR_404', risk_score: 8 }), deps);
    assert.equal(block.visual_change_flag, false);
  });

  it('ERR_404 has ≥3 options (redirect, restore, homepage)', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow({ issue_type: 'ERR_404', risk_score: 8 }), deps);
    assert.ok(block.options.length >= 3, `ERR_404 should have ≥3 options, got ${block.options.length}`);
  });

  it('CANONICAL_MISSING sets visual_change_flag = false', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow({ issue_type: 'CANONICAL_MISSING' }), deps);
    assert.equal(block.visual_change_flag, false);
  });

  it('SCHEMA_MISSING sets visual_change_flag = false', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow({ issue_type: 'SCHEMA_MISSING' }), deps);
    assert.equal(block.visual_change_flag, false);
  });

  it('H1_DUPLICATE sets visual_change_flag = true', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow({ issue_type: 'H1_DUPLICATE', risk_score: 5 }), deps);
    assert.equal(block.visual_change_flag, true);
  });

  it('IMG_ALT_MISSING sets visual_change_flag = false', async () => {
    const deps = makeDeps();
    const block = await generateReasoningBlock(makeRow({ issue_type: 'IMG_ALT_MISSING' }), deps);
    assert.equal(block.visual_change_flag, false);
  });

  // ── Current / target value extraction ──────────────────────────────────

  it('extracts current_value from proposed_fix.current_title', async () => {
    const deps = makeDeps();
    const row = makeRow({
      issue_type: 'META_TITLE_LONG',
      proposed_fix: { current_title: 'My Very Long Title That Exceeds Sixty Characters Significantly' },
    });
    const block = await generateReasoningBlock(row, deps);
    assert.equal(block.detected.current_value, 'My Very Long Title That Exceeds Sixty Characters Significantly');
  });

  it('extracts target_value from proposed_fix.new_title', async () => {
    const deps = makeDeps();
    const row = makeRow({
      issue_type: 'META_TITLE_LONG',
      proposed_fix: { new_title: 'Shorter Title | Brand' },
    });
    const block = await generateReasoningBlock(row, deps);
    assert.equal(block.proposed.target_value, 'Shorter Title | Brand');
  });

  it('ERR_404 uses URL as current_value', async () => {
    const deps = makeDeps();
    const row = makeRow({
      issue_type: 'ERR_404',
      url: 'https://example.com/missing-page',
      risk_score: 8,
    });
    const block = await generateReasoningBlock(row, deps);
    assert.equal(block.detected.current_value, 'https://example.com/missing-page');
  });

  // ── Confidence adjustments ─────────────────────────────────────────────

  it('reduces confidence when many siblings exist', async () => {
    const depsNoSiblings = makeDeps({ findSiblingIssues: async () => [] });
    const depsManySiblings = makeDeps({
      findSiblingIssues: async () => ['A', 'B', 'C', 'D'],
    });

    const row = makeRow();
    const blockClean = await generateReasoningBlock(row, depsNoSiblings);
    const blockBusy = await generateReasoningBlock(row, depsManySiblings);

    assert.ok(blockBusy.confidence < blockClean.confidence,
      `Busy confidence (${blockBusy.confidence}) should be < clean (${blockClean.confidence})`);
  });

  it('reduces confidence for high blast radius', async () => {
    const depsLow = makeDeps({ countUrlsAffected: async () => 2 });
    const depsHigh = makeDeps({ countUrlsAffected: async () => 100 });

    const row = makeRow();
    const blockLow = await generateReasoningBlock(row, depsLow);
    const blockHigh = await generateReasoningBlock(row, depsHigh);

    assert.ok(blockHigh.confidence < blockLow.confidence,
      `High blast confidence (${blockHigh.confidence}) should be < low blast (${blockLow.confidence})`);
  });

  it('boosts confidence for low risk scores', async () => {
    const deps = makeDeps();
    const rowLow = makeRow({ risk_score: 2, issue_type: 'ERR_REDIRECT_CHAIN' });
    const rowHigh = makeRow({ risk_score: 9, issue_type: 'ERR_REDIRECT_CHAIN' });

    const blockLow = await generateReasoningBlock(rowLow, deps);
    const blockHigh = await generateReasoningBlock(rowHigh, deps);

    assert.ok(blockLow.confidence > blockHigh.confidence,
      `Low-risk confidence (${blockLow.confidence}) should be > high-risk (${blockHigh.confidence})`);
  });

  // ── Unknown issue type fallback ────────────────────────────────────────

  it('handles unknown issue_type with fallback metadata', async () => {
    const deps = makeDeps();
    const row = makeRow({ issue_type: 'UNKNOWN_FUTURE_ISSUE' });
    const block = await generateReasoningBlock(row, deps);

    assert.ok(block.detected.issue.includes('unknown future issue'));
    assert.ok(block.options.length >= 2);
    assert.ok(block.confidence <= 0.65, `Fallback confidence should be ≤ 0.65, got ${block.confidence}`);
  });

  // ── GSC keyword integration ────────────────────────────────────────────

  it('META_TITLE_MISSING options reference top_keywords when present', async () => {
    const deps = makeDeps();
    const row = makeRow({
      issue_type: 'META_TITLE_MISSING',
      proposed_fix: {
        top_keywords: [{ query: 'pool floats', impressions: 500, position: 3.2 }],
      },
    });
    const block = await generateReasoningBlock(row, deps);
    const firstOption = block.options[0];
    assert.ok(firstOption.description.includes('pool floats'),
      `Expected first option to reference keyword, got: ${firstOption.description}`);
  });
});

// ── Batch tests ──────────────────────────────────────────────────────────────

describe('generateReasoningBlocks', () => {

  it('generates a block for each row', async () => {
    const deps = makeDeps();
    const rows = [
      makeRow({ id: 'a1', issue_type: 'ERR_404', risk_score: 8 }),
      makeRow({ id: 'a2', issue_type: 'META_TITLE_MISSING' }),
      makeRow({ id: 'a3', issue_type: 'SCHEMA_MISSING' }),
    ];

    const blocks = await generateReasoningBlocks(rows, deps);

    assert.equal(blocks.length, 3);
    assert.ok(deps.stored.has('a1'));
    assert.ok(deps.stored.has('a2'));
    assert.ok(deps.stored.has('a3'));
  });

  it('returns empty array for empty input', async () => {
    const deps = makeDeps();
    const blocks = await generateReasoningBlocks([], deps);
    assert.deepStrictEqual(blocks, []);
  });
});

// ── All known issue types ────────────────────────────────────────────────────

describe('all known issue types produce valid blocks', () => {
  const ALL_TYPES = [
    'ERR_404', 'ERR_500', 'ERR_REDIRECT_CHAIN', 'ERR_BROKEN_INTERNAL_LINK',
    'CANONICAL_MISSING', 'CANONICAL_MISMATCH', 'CANONICAL_RELATIVE',
    'CANONICAL_REDIRECT', 'CANONICAL_CHAIN',
    'META_TITLE_MISSING', 'META_TITLE_LONG', 'META_TITLE_DUPLICATE',
    'META_DESC_MISSING', 'META_DESC_LONG',
    'H1_MISSING', 'H1_DUPLICATE',
    'IMG_ALT_MISSING', 'IMG_DIMENSIONS_MISSING',
    'SCHEMA_MISSING', 'SCHEMA_INVALID_JSON', 'SCHEMA_DUPLICATE',
  ];

  for (const issueType of ALL_TYPES) {
    it(`${issueType} produces a valid block`, async () => {
      const deps = makeDeps();
      const row = makeRow({ issue_type: issueType, risk_score: clampRisk(issueType) });
      const block = await generateReasoningBlock(row, deps);

      assert.ok(block.detected.issue.length > 0, 'has issue label');
      assert.ok(block.why.length > 0, 'has rule');
      assert.ok(block.proposed.change.length > 0, 'has proposed change');
      assert.ok(block.risk_score >= 1 && block.risk_score <= 10, 'risk in range');
      assert.ok(block.options.length >= 2, '≥2 options');
      assert.ok(block.confidence >= 0 && block.confidence <= 1, 'confidence in range');
    });
  }
});

function clampRisk(issueType: string): number {
  // Return a typical risk_score for each issue type
  if (issueType.startsWith('ERR_5')) return 10;
  if (issueType.startsWith('ERR_4')) return 8;
  if (issueType.startsWith('ERR_')) return 5;
  return 3;
}
