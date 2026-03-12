/**
 * tools/viewport/viewport_qa_gate.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runViewportQA,
  getFailedViewports,
  type QAGateDeps,
  type CaptureFn,
  type StoreFn,
} from './viewport_qa_gate.ts';
import {
  VIEWPORTS,
  buildScreenshotKey,
  buildCapturePair,
  type ViewportScreenshot,
  type ViewportCapturePair,
} from './viewport_capture.ts';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockShot(
  viewportIndex: number,
  stage: 'before' | 'after',
  success = true,
): ViewportScreenshot {
  const vp = VIEWPORTS[viewportIndex];
  return {
    viewport:    vp,
    stage,
    url:         'https://x.com/',
    key:         buildScreenshotKey('site_1', 'fix_1', vp.name, stage),
    captured_at: new Date().toISOString(),
    success,
  };
}

function allShots(stage: 'before' | 'after', success = true): ViewportScreenshot[] {
  return VIEWPORTS.map((_, i) => mockShot(i, stage, success));
}

const successCapture: CaptureFn = async (_bu, _au, _fid, _sid) => ({
  before: allShots('before'),
  after:  allShots('after'),
});

const failingCapture: CaptureFn = async (_bu, _au, _fid, _sid) => ({
  before: allShots('before', false),
  after:  allShots('after',  false),
});

const throwingCapture: CaptureFn = async () => { throw new Error('capture boom'); };

const successStore: StoreFn = async (shot) => ({
  key: shot.key, url: `https://cdn/${shot.key}`, ok: true,
});

const failStore: StoreFn = async (shot) => ({
  key: shot.key, url: '', ok: false, error: 'store failed',
});

function mockDeps(overrides?: Partial<QAGateDeps>): QAGateDeps {
  return { capture: successCapture, store: successStore, ...overrides };
}

const input = { fix_id: 'fix_1', site_id: 'site_1', before_url: 'https://x.com/', after_url: 'https://x.com/' };

// ── getFailedViewports ────────────────────────────────────────────────────────

describe('getFailedViewports', () => {
  it('returns empty array when all shots succeed', () => {
    const pair: ViewportCapturePair = buildCapturePair(
      'https://x.com/', 'f', 's', allShots('before'), allShots('after'),
    );
    assert.deepEqual(getFailedViewports(pair), []);
  });

  it('returns failing viewport names', () => {
    const before = allShots('before');
    before[0] = mockShot(0, 'before', false);
    const pair = buildCapturePair('https://x.com/', 'f', 's', before, allShots('after'));
    const failed = getFailedViewports(pair);
    assert.ok(failed.includes('mobile'));
  });

  it('de-duplicates: viewport listed once even if both before+after fail', () => {
    const before = allShots('before');
    const after  = allShots('after');
    before[1] = mockShot(1, 'before', false);
    after[1]  = mockShot(1, 'after',  false);
    const pair = buildCapturePair('https://x.com/', 'f', 's', before, after);
    const failed = getFailedViewports(pair);
    assert.equal(failed.filter((n) => n === 'tablet').length, 1);
  });

  it('never throws on empty pair', () => {
    const pair = buildCapturePair('https://x.com/', 'f', 's', [], []);
    assert.doesNotThrow(() => getFailedViewports(pair));
  });
});

// ── runViewportQA — happy path ────────────────────────────────────────────────

describe('runViewportQA — happy path', () => {
  it('returns passed=true when all 8 shots succeed', async () => {
    const result = await runViewportQA(input, mockDeps());
    assert.equal(result.passed, true);
  });

  it('sets fix_id', async () => {
    const result = await runViewportQA(input, mockDeps());
    assert.equal(result.fix_id, 'fix_1');
  });

  it('sets site_id', async () => {
    const result = await runViewportQA(input, mockDeps());
    assert.equal(result.site_id, 'site_1');
  });

  it('has qa_at ISO timestamp', async () => {
    const result = await runViewportQA(input, mockDeps());
    assert.ok(result.qa_at.includes('T'));
  });

  it('failed_viewports is empty on clean run', async () => {
    const result = await runViewportQA(input, mockDeps());
    assert.deepEqual(result.failed_viewports, []);
  });

  it('stored_keys has 8 entries (4 before + 4 after)', async () => {
    const result = await runViewportQA(input, mockDeps());
    assert.equal(result.stored_keys.length, 8);
  });
});

// ── runViewportQA — failures ──────────────────────────────────────────────────

describe('runViewportQA — failures', () => {
  it('passed=false when all shots fail', async () => {
    const result = await runViewportQA(input, mockDeps({ capture: failingCapture }));
    assert.equal(result.passed, false);
  });

  it('failed_viewports lists all 4 when all shots fail', async () => {
    const result = await runViewportQA(input, mockDeps({ capture: failingCapture }));
    assert.equal(result.failed_viewports.length, 4);
  });

  it('stored_keys empty when all shots fail (nothing to store)', async () => {
    const result = await runViewportQA(input, mockDeps({ capture: failingCapture }));
    assert.equal(result.stored_keys.length, 0);
  });

  it('passed=false when capture throws', async () => {
    const result = await runViewportQA(input, mockDeps({ capture: throwingCapture }));
    assert.equal(result.passed, false);
    assert.ok(result.error?.includes('capture boom'));
  });

  it('never throws when capture throws', async () => {
    await assert.doesNotReject(() => runViewportQA(input, mockDeps({ capture: throwingCapture })));
  });

  it('never throws when store throws', async () => {
    await assert.doesNotReject(() =>
      runViewportQA(input, mockDeps({
        store: async () => { throw new Error('store boom'); },
      })),
    );
  });

  it('still passes when store fails (capture was clean)', async () => {
    const result = await runViewportQA(input, mockDeps({ store: failStore }));
    // capture succeeded → passed=true, even though store returned ok=false
    assert.equal(result.passed, true);
    assert.equal(result.stored_keys.length, 0); // nothing stored
  });
});
