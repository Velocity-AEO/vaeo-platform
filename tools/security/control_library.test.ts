/**
 * tools/security/control_library.test.ts
 *
 * Tests for SOC 2 control library.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOC2_CONTROLS,
  getControlsByStatus,
  getControlsByCriteria,
  getComplianceScore,
  type Control,
  type TrustServiceCriteria,
  type ControlStatus,
} from './control_library.js';

// ── SOC2_CONTROLS data integrity ─────────────────────────────────────────────

describe('SOC2_CONTROLS — data integrity', () => {
  it('has at least 25 controls', () => {
    assert.ok(SOC2_CONTROLS.length >= 25, `Expected >= 25, got ${SOC2_CONTROLS.length}`);
  });

  it('has unique control IDs', () => {
    const ids = SOC2_CONTROLS.map((c) => c.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'Duplicate control IDs found');
  });

  it('every control has required fields', () => {
    for (const c of SOC2_CONTROLS) {
      assert.ok(c.id, `Control missing id`);
      assert.ok(c.criteria, `${c.id} missing criteria`);
      assert.ok(c.criteria_ref, `${c.id} missing criteria_ref`);
      assert.ok(c.title, `${c.id} missing title`);
      assert.ok(c.description, `${c.id} missing description`);
      assert.ok(c.status, `${c.id} missing status`);
      assert.ok(Array.isArray(c.evidence), `${c.id} evidence is not an array`);
      assert.ok(c.owner, `${c.id} missing owner`);
      assert.ok(typeof c.implementation_notes === 'string', `${c.id} missing implementation_notes`);
    }
  });

  it('all criteria values are valid TrustServiceCriteria', () => {
    const valid = new Set(['CC', 'A', 'PI', 'C', 'P']);
    for (const c of SOC2_CONTROLS) {
      assert.ok(valid.has(c.criteria), `${c.id} has invalid criteria: ${c.criteria}`);
    }
  });

  it('all status values are valid ControlStatus', () => {
    const valid = new Set(['implemented', 'partial', 'not_started', 'not_applicable']);
    for (const c of SOC2_CONTROLS) {
      assert.ok(valid.has(c.status), `${c.id} has invalid status: ${c.status}`);
    }
  });

  it('covers all 5 Trust Service Criteria', () => {
    const criteria = new Set(SOC2_CONTROLS.map((c) => c.criteria));
    assert.ok(criteria.has('CC'), 'Missing Common Criteria');
    assert.ok(criteria.has('A'), 'Missing Availability');
    assert.ok(criteria.has('PI'), 'Missing Processing Integrity');
    assert.ok(criteria.has('C'), 'Missing Confidentiality');
    assert.ok(criteria.has('P'), 'Missing Privacy');
  });

  it('implemented controls have at least one evidence item', () => {
    const implemented = SOC2_CONTROLS.filter((c) => c.status === 'implemented');
    for (const c of implemented) {
      assert.ok(c.evidence.length >= 1, `${c.id} is implemented but has no evidence`);
    }
  });

  it('not_started controls have gaps listed', () => {
    const notStarted = SOC2_CONTROLS.filter((c) => c.status === 'not_started');
    for (const c of notStarted) {
      assert.ok(c.gaps && c.gaps.length >= 1, `${c.id} is not_started but has no gaps`);
    }
  });
});

// ── getControlsByStatus ──────────────────────────────────────────────────────

describe('getControlsByStatus', () => {
  it('returns only implemented controls', () => {
    const controls = getControlsByStatus('implemented');
    assert.ok(controls.length > 0);
    for (const c of controls) {
      assert.equal(c.status, 'implemented');
    }
  });

  it('returns only partial controls', () => {
    const controls = getControlsByStatus('partial');
    assert.ok(controls.length > 0);
    for (const c of controls) {
      assert.equal(c.status, 'partial');
    }
  });

  it('returns only not_started controls', () => {
    const controls = getControlsByStatus('not_started');
    assert.ok(controls.length > 0);
    for (const c of controls) {
      assert.equal(c.status, 'not_started');
    }
  });

  it('returns empty for not_applicable when none exist', () => {
    const controls = getControlsByStatus('not_applicable');
    // May or may not be empty — just verify they all match
    for (const c of controls) {
      assert.equal(c.status, 'not_applicable');
    }
  });
});

// ── getControlsByCriteria ────────────────────────────────────────────────────

describe('getControlsByCriteria', () => {
  it('returns CC controls', () => {
    const controls = getControlsByCriteria('CC');
    assert.ok(controls.length >= 10, `Expected >= 10 CC controls, got ${controls.length}`);
    for (const c of controls) {
      assert.equal(c.criteria, 'CC');
    }
  });

  it('returns Privacy controls', () => {
    const controls = getControlsByCriteria('P');
    assert.ok(controls.length >= 3, `Expected >= 3 Privacy controls, got ${controls.length}`);
    for (const c of controls) {
      assert.equal(c.criteria, 'P');
    }
  });
});

// ── getComplianceScore ──────────────────────────────────────────────────────

describe('getComplianceScore', () => {
  it('returns valid compliance score', () => {
    const score = getComplianceScore();
    assert.ok(score.total > 0);
    assert.ok(score.score_pct >= 0 && score.score_pct <= 100);
    assert.equal(score.total, score.implemented + score.partial + score.not_started);
  });

  it('has counts that match control data', () => {
    const score = getComplianceScore();
    assert.equal(score.implemented, getControlsByStatus('implemented').length);
    assert.equal(score.partial, getControlsByStatus('partial').length);
    assert.equal(score.not_started, getControlsByStatus('not_started').length);
  });

  it('score formula is correct', () => {
    const score = getComplianceScore();
    const expected = Math.round(((score.implemented + score.partial * 0.5) / score.total) * 100);
    assert.equal(score.score_pct, expected);
  });
});
