import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QA_CHECKS } from './qa_checks_library.js';
import { buildQAReport, type QACheckResult } from './qa_check.js';

describe('QA_CHECKS — structure', () => {
  it('has at least 14 checks', () => {
    assert.ok(QA_CHECKS.length >= 14);
  });

  it('all checks have required fields', () => {
    for (const check of QA_CHECKS) {
      assert.ok(check.check_id, `check missing check_id`);
      assert.ok(check.name, `check ${check.check_id} missing name`);
      assert.ok(check.description, `check ${check.check_id} missing description`);
      assert.ok(check.category, `check ${check.check_id} missing category`);
      assert.ok(check.severity, `check ${check.check_id} missing severity`);
      assert.equal(typeof check.run, 'function', `check ${check.check_id} missing run function`);
    }
  });

  it('has at least one pipeline check', () => {
    assert.ok(QA_CHECKS.some((c) => c.category === 'pipeline'));
  });

  it('has at least one data check', () => {
    assert.ok(QA_CHECKS.some((c) => c.category === 'data'));
  });

  it('has at least one integration check', () => {
    assert.ok(QA_CHECKS.some((c) => c.category === 'integration'));
  });

  it('has at least one configuration check', () => {
    assert.ok(QA_CHECKS.some((c) => c.category === 'configuration'));
  });

  it('has at least one security check', () => {
    assert.ok(QA_CHECKS.some((c) => c.category === 'security'));
  });

  it('has at least one blocker', () => {
    assert.ok(QA_CHECKS.some((c) => c.severity === 'blocker'));
  });

  it('has at least one warning', () => {
    assert.ok(QA_CHECKS.some((c) => c.severity === 'warning'));
  });

  it('has at least one info', () => {
    assert.ok(QA_CHECKS.some((c) => c.severity === 'info'));
  });

  it('check_ids are unique', () => {
    const ids = QA_CHECKS.map((c) => c.check_id);
    assert.equal(ids.length, new Set(ids).size);
  });
});

describe('QA_CHECKS — ai_generator_configured', () => {
  const check = QA_CHECKS.find((c) => c.check_id === 'qa_ai_generator_configured')!;
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it('passes when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
    const r = await check.run();
    assert.equal(r.passed, true);
  });

  it('fails when ANTHROPIC_API_KEY is absent', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await check.run();
    assert.equal(r.passed, false);
    assert.ok(r.recommendation);
  });
});

describe('QA_CHECKS — supabase_connection', () => {
  const check = QA_CHECKS.find((c) => c.check_id === 'qa_supabase_connection')!;
  let savedUrl: string | undefined;
  let savedKey: string | undefined;

  beforeEach(() => {
    savedUrl = process.env.SUPABASE_URL;
    savedKey = process.env.SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
    else delete process.env.SUPABASE_URL;
    if (savedKey !== undefined) process.env.SUPABASE_ANON_KEY = savedKey;
    else delete process.env.SUPABASE_ANON_KEY;
  });

  it('passes when both vars set', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    const r = await check.run();
    assert.equal(r.passed, true);
  });

  it('fails when SUPABASE_URL missing', async () => {
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = 'key';
    const r = await check.run();
    assert.equal(r.passed, false);
    assert.ok(r.message.includes('SUPABASE_URL'));
  });
});

describe('QA_CHECKS — crawler_reachable', () => {
  const check = QA_CHECKS.find((c) => c.check_id === 'qa_crawler_reachable')!;

  it('always passes (simulated)', async () => {
    const r = await check.run();
    assert.equal(r.passed, true);
  });
});

describe('QA_CHECKS — doppler_active', () => {
  const check = QA_CHECKS.find((c) => c.check_id === 'qa_doppler_active')!;

  it('returns info severity', () => {
    assert.equal(check.severity, 'info');
  });
});

describe('QA_CHECKS — schema_library_loaded', () => {
  const check = QA_CHECKS.find((c) => c.check_id === 'qa_schema_library_loaded')!;

  it('passes when spec library has entries', async () => {
    const r = await check.run();
    assert.equal(r.passed, true);
    assert.ok(r.message.includes('loaded'));
  });
});

describe('buildQAReport with mixed results', () => {
  it('blocker failure means report.passed=false', () => {
    const results: QACheckResult[] = [
      { check_id: 'a', name: 'Pass', category: 'pipeline', severity: 'blocker', passed: true, message: 'OK', checked_at: new Date().toISOString() },
      { check_id: 'b', name: 'Fail', category: 'data', severity: 'blocker', passed: false, message: 'Bad', checked_at: new Date().toISOString() },
    ];
    const r = buildQAReport(results, 'rpt1', Date.now());
    assert.equal(r.passed, false);
    assert.equal(r.blocker_count, 1);
  });

  it('all pass means report.passed=true', () => {
    const results: QACheckResult[] = [
      { check_id: 'a', name: 'Pass', category: 'pipeline', severity: 'blocker', passed: true, message: 'OK', checked_at: new Date().toISOString() },
      { check_id: 'b', name: 'Pass2', category: 'data', severity: 'warning', passed: true, message: 'OK', checked_at: new Date().toISOString() },
    ];
    const r = buildQAReport(results, 'rpt1', Date.now());
    assert.equal(r.passed, true);
  });
});
