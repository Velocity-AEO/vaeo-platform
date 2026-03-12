/**
 * tools/viewport/playwright_capture.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureViewport,
  captureViewports,
  captureBeforeAndAfter,
  _injectLaunchBrowser,
  _resetInjections,
  type Browser,
  type BrowserPage,
  type LaunchBrowserFn,
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
