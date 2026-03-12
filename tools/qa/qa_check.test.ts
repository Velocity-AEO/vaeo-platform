import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildQAReport, type QACheckResult } from './qa_check.js';

function makeResult(overrides: Partial<QACheckResult> = {}): QACheckResult {
  return {
    check_id: 'chk_1',
    name: 'Test Check',
    category: 'pipeline',
    severity: 'blocker',
    passed: true,
    message: 'OK',
    checked_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildQAReport — all pass', () => {
  it('passed is true when all checks pass', () => {
    const r = buildQAReport([makeResult(), makeResult({ check_id: 'chk_2' })], 'rpt1', Date.now() - 100);
    assert.equal(r.passed, true);
  });

  it('summary says all passed with count', () => {
    const r = buildQAReport([makeResult(), makeResult({ check_id: 'chk_2' })], 'rpt1', Date.now());
    assert.ok(r.summary.includes('All 2 QA checks passed'));
  });

  it('blocker_count is 0', () => {
    const r = buildQAReport([makeResult()], 'rpt1', Date.now());
    assert.equal(r.blocker_count, 0);
  });

  it('failed_count is 0', () => {
    const r = buildQAReport([makeResult()], 'rpt1', Date.now());
    assert.equal(r.failed_count, 0);
  });

  it('passed_count matches total', () => {
    const r = buildQAReport([makeResult(), makeResult({ check_id: 'chk_2' })], 'rpt1', Date.now());
    assert.equal(r.passed_count, 2);
  });
});

describe('buildQAReport — with blockers', () => {
  it('passed is false when blockers fail', () => {
    const r = buildQAReport([makeResult({ passed: false, severity: 'blocker' })], 'rpt1', Date.now());
    assert.equal(r.passed, false);
  });

  it('blocker_count accurate', () => {
    const r = buildQAReport([
      makeResult({ check_id: 'a', passed: false, severity: 'blocker' }),
      makeResult({ check_id: 'b', passed: false, severity: 'blocker' }),
    ], 'rpt1', Date.now());
    assert.equal(r.blocker_count, 2);
  });

  it('summary includes blocker names', () => {
    const r = buildQAReport([
      makeResult({ check_id: 'a', name: 'DB Check', passed: false, severity: 'blocker' }),
    ], 'rpt1', Date.now());
    assert.ok(r.summary.includes('blocker'));
    assert.ok(r.summary.includes('DB Check'));
  });

  it('summary mentions blocker count', () => {
    const r = buildQAReport([
      makeResult({ check_id: 'a', passed: false, severity: 'blocker' }),
      makeResult({ check_id: 'b', passed: false, severity: 'blocker' }),
    ], 'rpt1', Date.now());
    assert.ok(r.summary.includes('2 blocker'));
  });
});

describe('buildQAReport — warnings only', () => {
  it('passed is true with only warnings', () => {
    const r = buildQAReport([makeResult({ passed: false, severity: 'warning' })], 'rpt1', Date.now());
    assert.equal(r.passed, true);
  });

  it('warning_count accurate', () => {
    const r = buildQAReport([
      makeResult({ check_id: 'a', passed: false, severity: 'warning' }),
      makeResult({ check_id: 'b', passed: false, severity: 'warning' }),
    ], 'rpt1', Date.now());
    assert.equal(r.warning_count, 2);
  });

  it('summary lists warning names', () => {
    const r = buildQAReport([
      makeResult({ check_id: 'a', name: 'GSC', passed: false, severity: 'warning' }),
    ], 'rpt1', Date.now());
    assert.ok(r.summary.includes('warning'));
    assert.ok(r.summary.includes('GSC'));
  });
});

describe('buildQAReport — metadata', () => {
  it('report_id set', () => {
    const r = buildQAReport([], 'rpt42', Date.now());
    assert.equal(r.report_id, 'rpt42');
  });

  it('site_id passed through', () => {
    const r = buildQAReport([], 'rpt1', Date.now(), 'site_abc');
    assert.equal(r.site_id, 'site_abc');
  });

  it('duration_ms is non-negative', () => {
    const r = buildQAReport([], 'rpt1', Date.now() - 50);
    assert.ok(r.duration_ms >= 0);
  });

  it('generated_at is valid ISO', () => {
    const r = buildQAReport([], 'rpt1', Date.now());
    assert.ok(!isNaN(Date.parse(r.generated_at)));
  });

  it('results array preserved', () => {
    const results = [makeResult(), makeResult({ check_id: 'chk_2' })];
    const r = buildQAReport(results, 'rpt1', Date.now());
    assert.equal(r.results.length, 2);
  });

  it('info failures counted separately', () => {
    const r = buildQAReport([
      makeResult({ check_id: 'a', passed: false, severity: 'info' }),
    ], 'rpt1', Date.now());
    assert.equal(r.info_count, 1);
    assert.equal(r.failed_count, 1);
    assert.equal(r.passed, true);
  });
});
