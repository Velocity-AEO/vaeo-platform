/**
 * tools/viewport/viewport_capture.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEWPORTS,
  buildScreenshotKey,
  buildCapturePair,
  type Viewport,
  type ViewportScreenshot,
} from './viewport_capture.ts';

// ── VIEWPORTS constant ────────────────────────────────────────────────────────

describe('VIEWPORTS', () => {
  it('has exactly 4 entries', () => {
    assert.equal(VIEWPORTS.length, 4);
  });

  it('includes mobile at width 375', () => {
    const v = VIEWPORTS.find((vp) => vp.name === 'mobile');
    assert.ok(v);
    assert.equal(v!.width, 375);
  });

  it('includes tablet at width 768', () => {
    const v = VIEWPORTS.find((vp) => vp.name === 'tablet');
    assert.ok(v);
    assert.equal(v!.width, 768);
  });

  it('includes laptop at width 1280', () => {
    const v = VIEWPORTS.find((vp) => vp.name === 'laptop');
    assert.ok(v);
    assert.equal(v!.width, 1280);
  });

  it('includes wide at width 1920', () => {
    const v = VIEWPORTS.find((vp) => vp.name === 'wide');
    assert.ok(v);
    assert.equal(v!.width, 1920);
  });

  it('all entries have name, width, height', () => {
    for (const vp of VIEWPORTS) {
      assert.ok(typeof vp.name === 'string' && vp.name.length > 0);
      assert.ok(typeof vp.width === 'number' && vp.width > 0);
      assert.ok(typeof vp.height === 'number' && vp.height > 0);
    }
  });

  it('names are unique', () => {
    const names = VIEWPORTS.map((vp) => vp.name);
    assert.equal(new Set(names).size, names.length);
  });
});

// ── buildScreenshotKey ───────────────────────────────────────────────────────

describe('buildScreenshotKey', () => {
  it('returns correct format for before', () => {
    const key = buildScreenshotKey('site_1', 'fix_1', 'mobile', 'before');
    assert.equal(key, 'site_1/fix_1/mobile/before.png');
  });

  it('returns correct format for after', () => {
    const key = buildScreenshotKey('site_1', 'fix_1', 'mobile', 'after');
    assert.equal(key, 'site_1/fix_1/mobile/after.png');
  });

  it('uses provided viewport name', () => {
    const key = buildScreenshotKey('s', 'f', 'laptop', 'before');
    assert.ok(key.includes('laptop'));
  });

  it('ends with .png', () => {
    const key = buildScreenshotKey('s', 'f', 'wide', 'after');
    assert.ok(key.endsWith('.png'));
  });

  it('uses site_id as first segment', () => {
    const key = buildScreenshotKey('my_site', 'fix_99', 'tablet', 'before');
    assert.ok(key.startsWith('my_site/'));
  });

  it('fix_id is second segment', () => {
    const key = buildScreenshotKey('s', 'fix_abc', 'tablet', 'before');
    assert.ok(key.includes('/fix_abc/'));
  });

  it('handles all four viewport names', () => {
    for (const vp of VIEWPORTS) {
      const key = buildScreenshotKey('s', 'f', vp.name, 'before');
      assert.ok(key.includes(vp.name));
    }
  });
});

// ── buildCapturePair ─────────────────────────────────────────────────────────

function mockShot(viewport: Viewport, stage: 'before' | 'after', success = true): ViewportScreenshot {
  return {
    viewport,
    stage,
    url: 'https://example.com/',
    key: buildScreenshotKey('s', 'f', viewport.name, stage),
    captured_at: new Date().toISOString(),
    success,
  };
}

function allShots(stage: 'before' | 'after', success = true): ViewportScreenshot[] {
  return VIEWPORTS.map((vp) => mockShot(vp, stage, success));
}

describe('buildCapturePair', () => {
  it('sets fix_id', () => {
    const pair = buildCapturePair('https://x.com/', 'fix_1', 'site_1', allShots('before'), allShots('after'));
    assert.equal(pair.fix_id, 'fix_1');
  });

  it('sets site_id', () => {
    const pair = buildCapturePair('https://x.com/', 'fix_1', 'site_1', allShots('before'), allShots('after'));
    assert.equal(pair.site_id, 'site_1');
  });

  it('sets url', () => {
    const pair = buildCapturePair('https://x.com/', 'fix_1', 'site_1', allShots('before'), allShots('after'));
    assert.equal(pair.url, 'https://x.com/');
  });

  it('all_viewports_clean = true when all 8 screenshots succeed', () => {
    const pair = buildCapturePair('https://x.com/', 'f', 's', allShots('before'), allShots('after'));
    assert.equal(pair.all_viewports_clean, true);
  });

  it('all_viewports_clean = false when a before shot fails', () => {
    const before = allShots('before');
    before[0] = mockShot(VIEWPORTS[0], 'before', false);
    const pair = buildCapturePair('https://x.com/', 'f', 's', before, allShots('after'));
    assert.equal(pair.all_viewports_clean, false);
  });

  it('all_viewports_clean = false when an after shot fails', () => {
    const after = allShots('after');
    after[2] = mockShot(VIEWPORTS[2], 'after', false);
    const pair = buildCapturePair('https://x.com/', 'f', 's', allShots('before'), after);
    assert.equal(pair.all_viewports_clean, false);
  });

  it('all_viewports_clean = false when fewer than 8 screenshots total', () => {
    const pair = buildCapturePair('https://x.com/', 'f', 's', allShots('before').slice(0, 2), allShots('after'));
    assert.equal(pair.all_viewports_clean, false);
  });

  it('all_viewports_clean = false on empty arrays', () => {
    const pair = buildCapturePair('https://x.com/', 'f', 's', [], []);
    assert.equal(pair.all_viewports_clean, false);
  });

  it('has captured_at ISO timestamp', () => {
    const pair = buildCapturePair('https://x.com/', 'f', 's', allShots('before'), allShots('after'));
    assert.ok(pair.captured_at.includes('T'));
  });

  it('preserves before array', () => {
    const before = allShots('before');
    const pair = buildCapturePair('https://x.com/', 'f', 's', before, allShots('after'));
    assert.equal(pair.before.length, 4);
  });

  it('preserves after array', () => {
    const after = allShots('after');
    const pair = buildCapturePair('https://x.com/', 'f', 's', allShots('before'), after);
    assert.equal(pair.after.length, 4);
  });

  it('never throws on empty arrays', () => {
    assert.doesNotThrow(() => buildCapturePair('https://x.com/', 'f', 's', [], []));
  });
});
