import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runQASuite, runQAForSite } from './qa_runner.js';
import type { QACheck, QACheckResult, QAReport } from './qa_check.js';

function makeCheck(id: string, passed: boolean, severity: 'blocker' | 'warning' | 'info' = 'blocker'): QACheck {
  return {
    check_id: id,
    name: `Check ${id}`,
    description: `Desc ${id}`,
    category: 'pipeline',
    severity,
    async run(): Promise<QACheckResult> {
      return {
        check_id: id,
        name: `Check ${id}`,
        category: 'pipeline',
        severity,
        passed,
        message: passed ? 'OK' : 'Failed',
        checked_at: new Date().toISOString(),
      };
    },
  };
}

function makeThrowingCheck(id: string): QACheck {
  return {
    check_id: id,
    name: `Throwing ${id}`,
    description: `Throws`,
    category: 'pipeline',
    severity: 'warning',
    async run(): Promise<QACheckResult> {
      throw new Error('boom');
    },
  };
}

describe('runQASuite', () => {
  it('runs all checks and returns report', async () => {
    const report = await runQASuite(undefined, {
      checks: [makeCheck('a', true), makeCheck('b', true)],
    });
    assert.equal(report.results.length, 2);
    assert.equal(report.passed, true);
  });

  it('report.passed=false when blocker fails', async () => {
    const report = await runQASuite(undefined, {
      checks: [makeCheck('a', true), makeCheck('b', false, 'blocker')],
    });
    assert.equal(report.passed, false);
    assert.equal(report.blocker_count, 1);
  });

  it('report.passed=true when only warnings fail', async () => {
    const report = await runQASuite(undefined, {
      checks: [makeCheck('a', true), makeCheck('b', false, 'warning')],
    });
    assert.equal(report.passed, true);
    assert.equal(report.warning_count, 1);
  });

  it('handles throwing checks gracefully', async () => {
    const report = await runQASuite(undefined, {
      checks: [makeCheck('a', true), makeThrowingCheck('b')],
    });
    assert.equal(report.results.length, 2);
    assert.equal(report.results[1].passed, false);
    assert.ok(report.results[1].message.includes('boom'));
  });

  it('runs checks concurrently', async () => {
    const timestamps: number[] = [];
    const slowCheck: QACheck = {
      check_id: 'slow',
      name: 'Slow',
      description: '',
      category: 'pipeline',
      severity: 'info',
      async run() {
        timestamps.push(Date.now());
        return { check_id: 'slow', name: 'Slow', category: 'pipeline', severity: 'info', passed: true, message: 'OK', checked_at: new Date().toISOString() };
      },
    };
    const fastCheck: QACheck = {
      check_id: 'fast',
      name: 'Fast',
      description: '',
      category: 'pipeline',
      severity: 'info',
      async run() {
        timestamps.push(Date.now());
        return { check_id: 'fast', name: 'Fast', category: 'pipeline', severity: 'info', passed: true, message: 'OK', checked_at: new Date().toISOString() };
      },
    };
    await runQASuite(undefined, { checks: [slowCheck, fastCheck] });
    assert.equal(timestamps.length, 2);
    // Both should start nearly simultaneously (within 50ms)
    assert.ok(Math.abs(timestamps[0] - timestamps[1]) < 50);
  });

  it('storeReport called if provided', async () => {
    let stored: QAReport | null = null;
    await runQASuite(undefined, {
      checks: [makeCheck('a', true)],
      storeReport: async (r) => { stored = r; },
    });
    assert.ok(stored);
    assert.equal((stored as QAReport).results.length, 1);
  });

  it('non-fatal storeReport failure', async () => {
    const report = await runQASuite(undefined, {
      checks: [makeCheck('a', true)],
      storeReport: async () => { throw new Error('store failed'); },
    });
    assert.equal(report.passed, true);
  });

  it('site_id flows through', async () => {
    const report = await runQASuite('site_xyz', {
      checks: [makeCheck('a', true)],
    });
    assert.equal(report.site_id, 'site_xyz');
  });

  it('duration_ms is set', async () => {
    const report = await runQASuite(undefined, {
      checks: [makeCheck('a', true)],
    });
    assert.ok(report.duration_ms >= 0);
  });

  it('report_id is generated', async () => {
    const report = await runQASuite(undefined, {
      checks: [makeCheck('a', true)],
    });
    assert.ok(report.report_id.startsWith('qa_'));
  });

  it('counts are accurate', async () => {
    const report = await runQASuite(undefined, {
      checks: [
        makeCheck('a', true, 'blocker'),
        makeCheck('b', false, 'blocker'),
        makeCheck('c', false, 'warning'),
        makeCheck('d', false, 'info'),
      ],
    });
    assert.equal(report.passed_count, 1);
    assert.equal(report.failed_count, 3);
    assert.equal(report.blocker_count, 1);
    assert.equal(report.warning_count, 1);
    assert.equal(report.info_count, 1);
  });
});

describe('runQAForSite', () => {
  it('passes site_id to report', async () => {
    const report = await runQAForSite('site_abc', {
      checks: [makeCheck('a', true)],
    });
    assert.equal(report.site_id, 'site_abc');
  });

  it('runs all checks', async () => {
    const report = await runQAForSite('s1', {
      checks: [makeCheck('a', true), makeCheck('b', true)],
    });
    assert.equal(report.results.length, 2);
  });

  it('generated_at is valid ISO', async () => {
    const report = await runQAForSite('s1', { checks: [makeCheck('a', true)] });
    assert.ok(!isNaN(Date.parse(report.generated_at)));
  });
});
