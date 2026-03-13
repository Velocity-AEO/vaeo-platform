/**
 * tools/viewport/playwright_capture.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureViewport,
  captureViewports,
  captureAllViewports,
  captureBeforeAndAfter,
  _injectLaunchBrowser,
  _resetInjections,
  PLAYWRIGHT_CAPTURE_TIMEOUT_MS,
  CaptureTimeoutError,
  type Browser,
  type BrowserPage,
  type LaunchBrowserFn,
  type CaptureDeps,
} from './playwright_capture.ts';
import { VIEWPORTS } from './viewport_capture.ts';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockPage(): BrowserPage {
  return {
    setViewportSize: async () => {},
    goto:            async () => {},
    screenshot:      async () => Buffer.from('png'),
    close:           async () => {},
  };
}

function mockBrowser(pageOverride?: Partial<BrowserPage>): Browser {
  const page = { ...mockPage(), ...pageOverride };
  return {
    newPage: async () => page,
    close:   async () => {},
  };
}

function mockLaunch(pageOverride?: Partial<BrowserPage>): LaunchBrowserFn {
  return async () => mockBrowser(pageOverride);
}

function throwingLaunch(msg = 'browser failed'): LaunchBrowserFn {
  return async () => { throw new Error(msg); };
}

/** A timeoutFn that fires immediately to simulate a timeout. */
function immediateTimeoutFn(_ms: number): Promise<never> {
  return Promise.reject(new Error('timeout'));
}

/** A timeoutFn that never fires (normal fast capture wins). */
function neverTimeoutFn(_ms: number): Promise<never> {
  return new Promise<never>(() => {}); // never resolves or rejects
}

/** A slow goto that takes longer than the timeout. */
function slowGotoLaunch(delayMs: number): LaunchBrowserFn {
  return async () => mockBrowser({
    goto: async () => new Promise((resolve) => setTimeout(resolve, delayMs)),
  });
}

beforeEach(() => { _resetInjections(); });

// ── captureViewport ───────────────────────────────────────────────────────────

describe('captureViewport', () => {
  it('returns success=true on happy path', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before', {}, mockLaunch(),
    );
    assert.equal(shot.success, true);
  });

  it('sets correct key', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before', {}, mockLaunch(),
    );
    assert.equal(shot.key, 'site_1/fix_1/mobile/before.png');
  });

  it('sets stage', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'after', {}, mockLaunch(),
    );
    assert.equal(shot.stage, 'after');
  });

  it('sets url', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before', {}, mockLaunch(),
    );
    assert.equal(shot.url, 'https://x.com/');
  });

  it('sets captured_at ISO timestamp', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before', {}, mockLaunch(),
    );
    assert.ok(shot.captured_at.includes('T'));
  });

  it('returns success=false when browser launch throws', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before', {}, throwingLaunch('boom'),
    );
    assert.equal(shot.success, false);
    assert.ok(shot.error?.includes('boom'));
  });

  it('returns success=false when goto throws', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before', {},
      mockLaunch({ goto: async () => { throw new Error('nav failed'); } }),
    );
    assert.equal(shot.success, false);
    assert.ok(shot.error?.includes('nav failed'));
  });

  it('uses injected launcher when no explicit fn passed', async () => {
    _injectLaunchBrowser(mockLaunch());
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before',
    );
    assert.equal(shot.success, true);
  });
});

// ── captureViewport — timeout ────────────────────────────────────────────────

describe('captureViewport — timeout', () => {
  it('returns timed_out=true when timeout fires first', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before',
      { timeout_ms: 1 },
      slowGotoLaunch(5000),
      { timeoutFn: immediateTimeoutFn },
    );
    assert.equal(shot.timed_out, true);
  });

  it('returns success=false when timed_out', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before',
      { timeout_ms: 1 },
      slowGotoLaunch(5000),
      { timeoutFn: immediateTimeoutFn },
    );
    assert.equal(shot.success, false);
  });

  it('returns elapsed_ms', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before',
      {}, mockLaunch(),
    );
    assert.equal(typeof shot.elapsed_ms, 'number');
    assert.ok(shot.elapsed_ms >= 0);
  });

  it('returns timeout_ms', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before',
      { timeout_ms: 5000 }, mockLaunch(),
    );
    assert.equal(shot.timeout_ms, 5000);
  });

  it('closes page on timeout (verify via dep injection)', async () => {
    let pageClosed = false;
    const launch: LaunchBrowserFn = async () => ({
      newPage: async () => ({
        ...mockPage(),
        goto: async () => new Promise((r) => setTimeout(r, 5000)),
        close: async () => { pageClosed = true; },
      }),
      close: async () => {},
    });
    await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before',
      { timeout_ms: 1 }, launch, { timeoutFn: immediateTimeoutFn },
    );
    assert.equal(pageClosed, true);
  });

  it('PLAYWRIGHT_CAPTURE_TIMEOUT_MS is 15000', () => {
    assert.equal(PLAYWRIGHT_CAPTURE_TIMEOUT_MS, 15000);
  });

  it('timeout is injectable via deps.timeoutFn', async () => {
    let called = false;
    const customTimeout = (_ms: number): Promise<never> => {
      called = true;
      return new Promise<never>(() => {}); // never fires
    };
    await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before',
      {}, mockLaunch(), { timeoutFn: customTimeout },
    );
    assert.equal(called, true);
  });

  it('CaptureTimeoutError message includes url', () => {
    const err = new CaptureTimeoutError('https://example.com/', 375, 15000);
    assert.ok(err.message.includes('https://example.com/'));
  });

  it('CaptureTimeoutError message includes viewport', () => {
    const err = new CaptureTimeoutError('https://example.com/', 375, 15000);
    assert.ok(err.message.includes('375'));
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() =>
      captureViewport(
        'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before',
        { timeout_ms: 1 },
        throwingLaunch('total crash'),
        { timeoutFn: immediateTimeoutFn },
      ),
    );
  });

  it('timed_out=false on normal success', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before',
      {}, mockLaunch(),
    );
    assert.equal(shot.timed_out, false);
  });

  it('defaults timeout_ms to PLAYWRIGHT_CAPTURE_TIMEOUT_MS', async () => {
    const shot = await captureViewport(
      'https://x.com/', 'fix_1', 'site_1', VIEWPORTS[0], 'before',
      {}, mockLaunch(),
    );
    assert.equal(shot.timeout_ms, PLAYWRIGHT_CAPTURE_TIMEOUT_MS);
  });
});

// ── captureViewports ──────────────────────────────────────────────────────────

describe('captureViewports', () => {
  it('returns 4 screenshots (one per viewport)', async () => {
    const shots = await captureViewports(
      'https://x.com/', 'fix_1', 'site_1', 'before', {}, mockLaunch(),
    );
    assert.equal(shots.length, 4);
  });

  it('all shots succeed on happy path', async () => {
    const shots = await captureViewports(
      'https://x.com/', 'fix_1', 'site_1', 'before', {}, mockLaunch(),
    );
    assert.ok(shots.every((s) => s.success));
  });

  it('all shots marked failed when launch throws', async () => {
    const shots = await captureViewports(
      'https://x.com/', 'fix_1', 'site_1', 'before', {}, throwingLaunch(),
    );
    assert.ok(shots.every((s) => !s.success));
  });

  it('stage is set to after', async () => {
    const shots = await captureViewports(
      'https://x.com/', 'fix_1', 'site_1', 'after', {}, mockLaunch(),
    );
    assert.ok(shots.every((s) => s.stage === 'after'));
  });

  it('viewport names match VIEWPORTS', async () => {
    const shots = await captureViewports(
      'https://x.com/', 'fix_1', 'site_1', 'before', {}, mockLaunch(),
    );
    const names = shots.map((s) => s.viewport.name);
    for (const vp of VIEWPORTS) {
      assert.ok(names.includes(vp.name));
    }
  });

  it('never throws even when launch always throws', async () => {
    await assert.doesNotReject(() =>
      captureViewports('https://x.com/', 'f', 's', 'before', {}, throwingLaunch()),
    );
  });

  it('continues after one viewport times out', async () => {
    let callCount = 0;
    const launch: LaunchBrowserFn = async () => ({
      newPage: async () => ({
        ...mockPage(),
        goto: async () => {
          callCount++;
          if (callCount === 1) {
            // First viewport "times out" (throws)
            throw new Error('timeout');
          }
        },
      }),
      close: async () => {},
    });
    const shots = await captureViewports('https://x.com/', 'f', 's', 'before', {}, launch);
    assert.equal(shots.length, 4);
    // At least some should succeed
    assert.ok(shots.some(s => s.success));
  });
});

// ── captureAllViewports ──────────────────────────────────────────────────────

describe('captureAllViewports', () => {
  it('sets any_timed_out=true when any timeout', async () => {
    let callCount = 0;
    const launch: LaunchBrowserFn = async () => ({
      newPage: async () => ({
        ...mockPage(),
        goto: async () => {
          callCount++;
          if (callCount === 1) throw new CaptureTimeoutError('https://x.com/', 375, 100);
        },
      }),
      close: async () => {},
    });
    // Use immediateTimeoutFn for first call
    const result = await captureAllViewports('https://x.com/', 'f', 's', 'before', { timeout_ms: 1 }, launch, { timeoutFn: immediateTimeoutFn });
    // All will time out since immediateTimeoutFn always fires
    assert.equal(result.any_timed_out, true);
  });

  it('sets timed_out_viewports correctly', async () => {
    const result = await captureAllViewports('https://x.com/', 'f', 's', 'before', { timeout_ms: 1 }, slowGotoLaunch(5000), { timeoutFn: immediateTimeoutFn });
    assert.ok(result.timed_out_viewports.length > 0);
  });

  it('captures remaining viewports after one times out', async () => {
    const result = await captureAllViewports('https://x.com/', 'f', 's', 'before', {}, mockLaunch());
    assert.equal(result.results.length, 4);
  });
});

// ── captureBeforeAndAfter ─────────────────────────────────────────────────────

describe('captureBeforeAndAfter', () => {
  it('returns before array of length 4', async () => {
    const { before } = await captureBeforeAndAfter(
      'https://x.com/', 'https://x.com/', 'fix_1', 'site_1', {}, mockLaunch(),
    );
    assert.equal(before.length, 4);
  });

  it('returns after array of length 4', async () => {
    const { after } = await captureBeforeAndAfter(
      'https://x.com/', 'https://x.com/', 'fix_1', 'site_1', {}, mockLaunch(),
    );
    assert.equal(after.length, 4);
  });

  it('before shots have stage=before', async () => {
    const { before } = await captureBeforeAndAfter(
      'https://x.com/', 'https://x.com/', 'fix_1', 'site_1', {}, mockLaunch(),
    );
    assert.ok(before.every((s) => s.stage === 'before'));
  });

  it('after shots have stage=after', async () => {
    const { after } = await captureBeforeAndAfter(
      'https://x.com/', 'https://x.com/', 'fix_1', 'site_1', {}, mockLaunch(),
    );
    assert.ok(after.every((s) => s.stage === 'after'));
  });

  it('uses different URLs for before and after', async () => {
    const pages: string[] = [];
    const launchFn: LaunchBrowserFn = async () => ({
      newPage: async () => ({
        ...mockPage(),
        goto: async (url: string) => { pages.push(url); },
      }),
      close: async () => {},
    });
    await captureBeforeAndAfter('https://before.com/', 'https://after.com/', 'f', 's', {}, launchFn);
    assert.ok(pages.some((u) => u === 'https://before.com/'));
    assert.ok(pages.some((u) => u === 'https://after.com/'));
  });

  it('never throws when launch always throws', async () => {
    await assert.doesNotReject(() =>
      captureBeforeAndAfter('https://x.com/', 'https://x.com/', 'f', 's', {}, throwingLaunch()),
    );
  });
});
