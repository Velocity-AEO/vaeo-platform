/**
 * tools/viewport/screenshot_storage.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  storeScreenshot,
  getScreenshotUrl,
  listScreenshotsForFix,
  _injectStorageDeps,
  _resetStorageDeps,
  type StorageDeps,
} from './screenshot_storage.ts';
import { VIEWPORTS, buildScreenshotKey, type ViewportScreenshot } from './viewport_capture.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockShot(
  viewportIndex = 0,
  stage: 'before' | 'after' = 'before',
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

function mockDeps(overrides?: Partial<StorageDeps>): StorageDeps {
  return {
    upload:  async (key) => ({ url: `https://cdn.example.com/${key}` }),
    getUrl:  async (key) => `https://cdn.example.com/${key}`,
    list:    async (prefix) => [`${prefix}mobile/before.png`, `${prefix}tablet/before.png`],
    ...overrides,
  };
}

beforeEach(() => { _resetStorageDeps(); });

// ── storeScreenshot ───────────────────────────────────────────────────────────

describe('storeScreenshot', () => {
  it('returns ok=true on success', async () => {
    const result = await storeScreenshot(mockShot(), Buffer.from('png'), mockDeps());
    assert.equal(result.ok, true);
  });

  it('returns the key', async () => {
    const shot = mockShot();
    const result = await storeScreenshot(shot, Buffer.from('png'), mockDeps());
    assert.equal(result.key, shot.key);
  });

  it('returns url from upload fn', async () => {
    const result = await storeScreenshot(mockShot(), Buffer.from('png'), mockDeps());
    assert.ok(result.url.startsWith('https://'));
  });

  it('url contains the key', async () => {
    const shot = mockShot();
    const result = await storeScreenshot(shot, Buffer.from('png'), mockDeps());
    assert.ok(result.url.includes('mobile'));
  });

  it('returns ok=false when upload throws', async () => {
    const result = await storeScreenshot(
      mockShot(), Buffer.from('png'),
      mockDeps({ upload: async () => { throw new Error('upload failed'); } }),
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('upload failed'));
  });

  it('uses injected deps when no explicit deps passed', async () => {
    _injectStorageDeps(mockDeps());
    const result = await storeScreenshot(mockShot(), Buffer.from('png'));
    assert.equal(result.ok, true);
  });

  it('never throws when upload fn throws', async () => {
    await assert.doesNotReject(() =>
      storeScreenshot(mockShot(), Buffer.from(''), mockDeps({ upload: async () => { throw new Error('X'); } })),
    );
  });
});

// ── getScreenshotUrl ──────────────────────────────────────────────────────────

describe('getScreenshotUrl', () => {
  it('returns url from getUrl fn', async () => {
    const url = await getScreenshotUrl('site_1/fix_1/mobile/before.png', mockDeps());
    assert.ok(url?.includes('site_1'));
  });

  it('returns null when getUrl returns null', async () => {
    const url = await getScreenshotUrl('missing.png', mockDeps({ getUrl: async () => null }));
    assert.equal(url, null);
  });

  it('returns null when getUrl throws', async () => {
    const url = await getScreenshotUrl(
      'key',
      mockDeps({ getUrl: async () => { throw new Error('err'); } }),
    );
    assert.equal(url, null);
  });

  it('uses injected deps when no explicit deps passed', async () => {
    _injectStorageDeps(mockDeps());
    const url = await getScreenshotUrl('site_1/fix_1/mobile/before.png');
    assert.ok(url !== undefined);
  });

  it('returns null by default (no deps)', async () => {
    const url = await getScreenshotUrl('some_key');
    assert.equal(url, null);
  });

  it('never throws when getUrl fn throws', async () => {
    await assert.doesNotReject(() =>
      getScreenshotUrl('k', mockDeps({ getUrl: async () => { throw new Error('X'); } })),
    );
  });
});

// ── listScreenshotsForFix ─────────────────────────────────────────────────────

describe('listScreenshotsForFix', () => {
  it('returns list of keys', async () => {
    const keys = await listScreenshotsForFix('site_1', 'fix_1', mockDeps());
    assert.ok(keys.length > 0);
  });

  it('prefix uses site_id/fix_id', async () => {
    const listed: string[] = [];
    await listScreenshotsForFix('site_1', 'fix_1', mockDeps({
      list: async (prefix) => { listed.push(prefix); return []; },
    }));
    assert.ok(listed[0]?.startsWith('site_1/fix_1/'));
  });

  it('returns empty array when list fn returns empty', async () => {
    const keys = await listScreenshotsForFix('s', 'f', mockDeps({ list: async () => [] }));
    assert.deepEqual(keys, []);
  });

  it('returns empty array when list fn throws', async () => {
    const keys = await listScreenshotsForFix(
      's', 'f',
      mockDeps({ list: async () => { throw new Error('err'); } }),
    );
    assert.deepEqual(keys, []);
  });

  it('uses injected deps when no explicit deps passed', async () => {
    _injectStorageDeps(mockDeps());
    const keys = await listScreenshotsForFix('site_1', 'fix_1');
    assert.ok(Array.isArray(keys));
  });

  it('returns empty array by default (no deps)', async () => {
    const keys = await listScreenshotsForFix('s', 'f');
    assert.deepEqual(keys, []);
  });

  it('never throws when list fn throws', async () => {
    await assert.doesNotReject(() =>
      listScreenshotsForFix('s', 'f', mockDeps({ list: async () => { throw new Error('X'); } })),
    );
  });
});
