import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runViewportQAForFix,
  runViewportQABatch,
} from './viewport_qa_orchestrator.js';
import type {
  ViewportQAOrchestratorConfig,
  ViewportCapturePair,
  ViewportQARecord,
} from './viewport_qa_orchestrator.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ViewportQAOrchestratorConfig> = {}): ViewportQAOrchestratorConfig {
  return {
    site_id: 'site_1',
    storage_backend: 'local',
    enabled: true,
    ...overrides,
  };
}

function noopFix(): Promise<void> { return Promise.resolve(); }

function passingCapture(_url: string): Promise<ViewportCapturePair> {
  return Promise.resolve({
    viewport: 'desktop',
    before_path: '/tmp/before.png',
    after_path: '/tmp/after.png',
    diff_score: 0.95,
  });
}

function failingCapture(_url: string): Promise<ViewportCapturePair> {
  return Promise.resolve({
    viewport: 'mobile',
    before_path: '/tmp/before.png',
    after_path: '/tmp/after.png',
    diff_score: 0.5,
  });
}

function throwingCapture(_url: string): Promise<ViewportCapturePair> {
  throw new Error('Capture failed');
}

function throwingStore(_pair: ViewportCapturePair): Promise<Record<string, string>> {
  throw new Error('Store failed');
}

let storeCallCount = 0;
function countingStore(_pair: ViewportCapturePair): Promise<Record<string, string>> {
  storeCallCount++;
  return Promise.resolve({ desktop: '/stored/path.png' });
}

let saveRecordCalls: ViewportQARecord[] = [];
function trackingSaveRecord(record: ViewportQARecord): Promise<void> {
  saveRecordCalls.push(record);
  return Promise.resolve();
}

// ── runViewportQAForFix ─────────────────────────────────────────────────────

describe('runViewportQAForFix', () => {
  it('returns skipped=true when disabled', async () => {
    const result = await runViewportQAForFix('fix_1', 'https://example.com', noopFix, makeConfig({ enabled: false }));
    assert.equal(result.skipped, true);
    assert.equal(result.skip_reason, 'disabled');
    assert.equal(result.qa_passed, true);
  });

  it('returns fix_id and url in result', async () => {
    const result = await runViewportQAForFix('fix_2', 'https://test.com', noopFix, makeConfig({ enabled: false }));
    assert.equal(result.fix_id, 'fix_2');
    assert.equal(result.url, 'https://test.com');
  });

  it('calls captureFn when enabled', async () => {
    let captured = false;
    const result = await runViewportQAForFix('fix_3', 'https://example.com', noopFix, makeConfig(), {
      captureFn: async (_url) => { captured = true; return passingCapture(_url); },
      storeFn: countingStore,
    });
    assert.equal(captured, true);
    assert.equal(result.skipped, false);
  });

  it('calls storeFn after capture', async () => {
    storeCallCount = 0;
    await runViewportQAForFix('fix_4', 'https://example.com', noopFix, makeConfig(), {
      captureFn: passingCapture,
      storeFn: countingStore,
    });
    assert.ok(storeCallCount > 0);
  });

  it('calls saveRecordFn', async () => {
    saveRecordCalls = [];
    await runViewportQAForFix('fix_5', 'https://example.com', noopFix, makeConfig(), {
      captureFn: passingCapture,
      storeFn: countingStore,
      saveRecordFn: trackingSaveRecord,
    });
    assert.equal(saveRecordCalls.length, 1);
    assert.equal(saveRecordCalls[0].fix_id, 'fix_5');
  });

  it('returns qa_passed=true for high diff_score', async () => {
    const result = await runViewportQAForFix('fix_6', 'https://example.com', noopFix, makeConfig(), {
      captureFn: passingCapture,
      storeFn: countingStore,
    });
    assert.equal(result.qa_passed, true);
  });

  it('returns qa_passed=false for low diff_score', async () => {
    const result = await runViewportQAForFix('fix_7', 'https://example.com', noopFix, makeConfig(), {
      captureFn: failingCapture,
      storeFn: countingStore,
    });
    assert.equal(result.qa_passed, false);
  });

  it('includes failed_viewports when QA fails', async () => {
    const result = await runViewportQAForFix('fix_8', 'https://example.com', noopFix, makeConfig(), {
      captureFn: failingCapture,
      storeFn: countingStore,
    });
    assert.ok(result.qa_record.failed_viewports.includes('mobile'));
  });

  it('includes capture_pair when enabled', async () => {
    const result = await runViewportQAForFix('fix_9', 'https://example.com', noopFix, makeConfig(), {
      captureFn: passingCapture,
      storeFn: countingStore,
    });
    assert.ok(result.capture_pair);
    assert.equal(result.capture_pair!.viewport, 'desktop');
  });

  it('never throws when captureFn throws', async () => {
    const result = await runViewportQAForFix('fix_10', 'https://example.com', noopFix, makeConfig(), {
      captureFn: throwingCapture,
    });
    assert.equal(result.skipped, true);
    assert.ok(result.skip_reason);
  });

  it('never throws when storeFn throws', async () => {
    const result = await runViewportQAForFix('fix_11', 'https://example.com', noopFix, makeConfig(), {
      captureFn: passingCapture,
      storeFn: throwingStore,
    });
    assert.equal(result.skipped, true);
  });

  it('never throws when runFix throws', async () => {
    const result = await runViewportQAForFix('fix_12', 'https://example.com', () => Promise.reject(new Error('fix failed')), makeConfig({ enabled: false }));
    assert.equal(result.skipped, true);
    assert.equal(result.qa_passed, true);
  });

  it('sets checked_at in qa_record', async () => {
    const result = await runViewportQAForFix('fix_13', 'https://example.com', noopFix, makeConfig({ enabled: false }));
    assert.ok(result.qa_record.checked_at);
  });

  it('sets site_id in qa_record from config', async () => {
    const result = await runViewportQAForFix('fix_14', 'https://example.com', noopFix, makeConfig({ site_id: 'my_site' }), {
      captureFn: passingCapture,
      storeFn: countingStore,
    });
    assert.equal(result.qa_record.site_id, 'my_site');
  });
});

// ── runViewportQABatch ──────────────────────────────────────────────────────

describe('runViewportQABatch', () => {
  it('processes all fixes', async () => {
    const fixes = [
      { fix_id: 'b1', url: 'https://a.com', runFix: noopFix },
      { fix_id: 'b2', url: 'https://b.com', runFix: noopFix },
      { fix_id: 'b3', url: 'https://c.com', runFix: noopFix },
    ];
    const results = await runViewportQABatch(fixes, makeConfig({ enabled: false }));
    assert.equal(results.length, 3);
  });

  it('returns same count as input', async () => {
    const fixes = [
      { fix_id: 'c1', url: 'https://d.com', runFix: noopFix },
    ];
    const results = await runViewportQABatch(fixes, makeConfig({ enabled: false }));
    assert.equal(results.length, fixes.length);
  });

  it('returns results in input order', async () => {
    const fixes = [
      { fix_id: 'o1', url: 'https://e.com', runFix: noopFix },
      { fix_id: 'o2', url: 'https://f.com', runFix: noopFix },
    ];
    const results = await runViewportQABatch(fixes, makeConfig({ enabled: false }));
    assert.equal(results[0].fix_id, 'o1');
    assert.equal(results[1].fix_id, 'o2');
  });

  it('returns empty array for empty input', async () => {
    const results = await runViewportQABatch([], makeConfig());
    assert.equal(results.length, 0);
  });

  it('never throws when a fix throws', async () => {
    const fixes = [
      { fix_id: 'e1', url: 'https://g.com', runFix: () => Promise.reject(new Error('boom')) },
    ];
    const results = await runViewportQABatch(fixes, makeConfig({ enabled: false }));
    assert.equal(results.length, 1);
  });

  it('never throws on null input', async () => {
    await assert.doesNotReject(async () => {
      await runViewportQABatch(null as unknown as any, makeConfig());
    });
  });
});
