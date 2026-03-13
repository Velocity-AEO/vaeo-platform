import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getConfidenceLabel,
  getConfidenceColor,
  getRiskLevelLabel,
  getRiskLevelColor,
  buildDecisionReasons,
  buildConfidenceDisplayData,
} from './confidence_display_builder.js';

// ── getConfidenceLabel ───────────────────────────────────────────────────────

describe('getConfidenceLabel', () => {
  it('returns Very High for >= 0.97', () => {
    assert.equal(getConfidenceLabel(0.97), 'Very High');
    assert.equal(getConfidenceLabel(0.99), 'Very High');
    assert.equal(getConfidenceLabel(1.0), 'Very High');
  });

  it('returns High for >= 0.92', () => {
    assert.equal(getConfidenceLabel(0.92), 'High');
    assert.equal(getConfidenceLabel(0.96), 'High');
  });

  it('returns Good for >= 0.85', () => {
    assert.equal(getConfidenceLabel(0.85), 'Good');
    assert.equal(getConfidenceLabel(0.91), 'Good');
  });

  it('returns Moderate for >= 0.75', () => {
    assert.equal(getConfidenceLabel(0.75), 'Moderate');
    assert.equal(getConfidenceLabel(0.84), 'Moderate');
  });

  it('returns Low for < 0.75', () => {
    assert.equal(getConfidenceLabel(0.5), 'Low');
    assert.equal(getConfidenceLabel(0.0), 'Low');
    assert.equal(getConfidenceLabel(0.74), 'Low');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getConfidenceLabel(null as any));
  });
});

// ── getConfidenceColor ───────────────────────────────────────────────────────

describe('getConfidenceColor', () => {
  it('returns green for >= 0.92', () => {
    assert.equal(getConfidenceColor(0.92), 'text-green-600');
    assert.equal(getConfidenceColor(0.99), 'text-green-600');
  });

  it('returns blue for >= 0.85', () => {
    assert.equal(getConfidenceColor(0.85), 'text-blue-600');
    assert.equal(getConfidenceColor(0.91), 'text-blue-600');
  });

  it('returns yellow for >= 0.75', () => {
    assert.equal(getConfidenceColor(0.75), 'text-yellow-600');
    assert.equal(getConfidenceColor(0.84), 'text-yellow-600');
  });

  it('returns red for < 0.75', () => {
    assert.equal(getConfidenceColor(0.5), 'text-red-600');
    assert.equal(getConfidenceColor(0.0), 'text-red-600');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getConfidenceColor(null as any));
  });
});

// ── getRiskLevelLabel ────────────────────────────────────────────────────────

describe('getRiskLevelLabel', () => {
  it('returns correct label per level', () => {
    assert.equal(getRiskLevelLabel('critical'), 'Critical Risk');
    assert.equal(getRiskLevelLabel('high'), 'High Risk');
    assert.equal(getRiskLevelLabel('medium'), 'Medium Risk');
    assert.equal(getRiskLevelLabel('low'), 'Low Risk');
  });

  it('returns Unknown Risk for unrecognized', () => {
    assert.equal(getRiskLevelLabel('extreme'), 'Unknown Risk');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getRiskLevelLabel(null as any));
  });
});

// ── getRiskLevelColor ────────────────────────────────────────────────────────

describe('getRiskLevelColor', () => {
  it('returns correct color per level', () => {
    assert.equal(getRiskLevelColor('critical'), 'text-red-700');
    assert.equal(getRiskLevelColor('high'), 'text-orange-600');
    assert.equal(getRiskLevelColor('medium'), 'text-yellow-600');
    assert.equal(getRiskLevelColor('low'), 'text-green-600');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getRiskLevelColor(null as any));
  });
});

// ── buildDecisionReasons ─────────────────────────────────────────────────────

describe('buildDecisionReasons', () => {
  it('includes confidence score line', () => {
    const reasons = buildDecisionReasons(0.92, 0.85, null, null, 'low', 'auto_approved');
    assert.ok(reasons.some(r => r.includes('Confidence score: 92%')));
    assert.ok(reasons.some(r => r.includes('threshold: 85%')));
  });

  it('includes auto_approved reason', () => {
    const reasons = buildDecisionReasons(0.92, 0.85, null, null, 'low', 'auto_approved');
    assert.ok(reasons.some(r => r.includes('applied automatically')));
  });

  it('includes manual reason when manually_approved', () => {
    const reasons = buildDecisionReasons(0.92, 0.85, null, null, 'low', 'manually_approved');
    assert.ok(reasons.some(r => r.includes('Manually approved')));
  });

  it('includes sandbox passed', () => {
    const reasons = buildDecisionReasons(0.92, 0.85, true, null, 'low', 'auto_approved');
    assert.ok(reasons.some(r => r.includes('Sandbox verification passed')));
  });

  it('includes sandbox failed', () => {
    const reasons = buildDecisionReasons(0.92, 0.85, false, null, 'low', 'auto_approved');
    assert.ok(reasons.some(r => r.includes('Sandbox verification failed')));
  });

  it('includes viewport passed', () => {
    const reasons = buildDecisionReasons(0.92, 0.85, null, true, 'low', 'auto_approved');
    assert.ok(reasons.some(r => r.includes('Visual QA passed')));
  });

  it('includes viewport failed', () => {
    const reasons = buildDecisionReasons(0.92, 0.85, null, false, 'low', 'auto_approved');
    assert.ok(reasons.some(r => r.includes('Visual QA issues detected')));
  });

  it('includes high risk note for critical', () => {
    const reasons = buildDecisionReasons(0.92, 0.85, null, null, 'critical', 'auto_approved');
    assert.ok(reasons.some(r => r.includes('High-risk fix type')));
  });

  it('includes high risk note for high', () => {
    const reasons = buildDecisionReasons(0.92, 0.85, null, null, 'high', 'auto_approved');
    assert.ok(reasons.some(r => r.includes('High-risk fix type')));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildDecisionReasons(null as any, null as any, null as any, null as any, null as any, null as any));
  });
});

// ── buildConfidenceDisplayData ───────────────────────────────────────────────

describe('buildConfidenceDisplayData', () => {
  const baseFix = {
    fix_id:             'fix_1',
    confidence_score:   0.93,
    risk_level:         'low',
    decision_method:    'auto_approved',
    threshold_used:     0.85,
    sandbox_passed:     true as boolean | null,
    viewport_qa_passed: true as boolean | null,
    applied_at:         '2026-01-15T10:00:00Z',
  };

  it('assembles all fields correctly', () => {
    const data = buildConfidenceDisplayData(baseFix);
    assert.equal(data.fix_id, 'fix_1');
    assert.equal(data.confidence_score, 0.93);
    assert.equal(data.confidence_label, 'High');
    assert.equal(data.confidence_color, 'text-green-600');
    assert.equal(data.risk_label, 'Low Risk');
    assert.equal(data.risk_color, 'text-green-600');
    assert.equal(data.decision_label, 'Auto-Approved');
    assert.ok(data.decision_reasons.length > 0);
    assert.equal(data.threshold_used, 0.85);
    assert.equal(data.sandbox_passed, true);
    assert.equal(data.viewport_qa_passed, true);
  });

  it('handles null sandbox_passed', () => {
    const data = buildConfidenceDisplayData({ ...baseFix, sandbox_passed: null });
    assert.equal(data.sandbox_passed, null);
  });

  it('handles null viewport_qa_passed', () => {
    const data = buildConfidenceDisplayData({ ...baseFix, viewport_qa_passed: null });
    assert.equal(data.viewport_qa_passed, null);
  });

  it('threshold_met true when score >= threshold', () => {
    const data = buildConfidenceDisplayData({ ...baseFix, confidence_score: 0.90, threshold_used: 0.85 });
    assert.equal(data.threshold_met, true);
  });

  it('threshold_met false when score < threshold', () => {
    const data = buildConfidenceDisplayData({ ...baseFix, confidence_score: 0.80, threshold_used: 0.85 });
    assert.equal(data.threshold_met, false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildConfidenceDisplayData(null as any));
  });
});
