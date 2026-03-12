/**
 * apps/dashboard/lib/screenshot_strip_logic.test.ts
 *
 * Tests for viewport screenshot strip logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStripItems,
  getActiveViewport,
  getViewportLabel,
} from './screenshot_strip_logic.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function entry(name: string, width: number, key: string, success = true) {
  return { viewport: { name, width }, screenshot_key: key, success };
}

function fakeUrl(key: string): string | null {
  return `https://cdn.example.com/${key}`;
}

function nullUrl(_key: string): string | null {
  return null;
}

// ── getViewportLabel ─────────────────────────────────────────────────────────

describe('getViewportLabel', () => {
  it('returns Mobile (375px)', () => {
    assert.equal(getViewportLabel('mobile', 375), 'Mobile (375px)');
  });

  it('returns Tablet (768px)', () => {
    assert.equal(getViewportLabel('tablet', 768), 'Tablet (768px)');
  });

  it('returns Laptop (1280px)', () => {
    assert.equal(getViewportLabel('laptop', 1280), 'Laptop (1280px)');
  });

  it('returns Wide (1920px)', () => {
    assert.equal(getViewportLabel('wide', 1920), 'Wide (1920px)');
  });

  it('returns raw name for unknown viewport', () => {
    assert.equal(getViewportLabel('custom', 500), 'custom (500px)');
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getViewportLabel('', 0));
    assert.doesNotThrow(() => getViewportLabel(undefined as any, null as any));
  });
});

// ── buildStripItems ──────────────────────────────────────────────────────────

describe('buildStripItems', () => {
  it('matches before and after by viewport name', () => {
    const pair = {
      before: [entry('mobile', 375, 'b/mobile.png')],
      after:  [entry('mobile', 375, 'a/mobile.png')],
      all_viewports_clean: true,
    };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'mobile');
    assert.ok(items[0].before_url?.includes('b/mobile.png'));
    assert.ok(items[0].after_url?.includes('a/mobile.png'));
  });

  it('returns multiple viewport items in order', () => {
    const pair = {
      before: [
        entry('mobile', 375, 'b/m.png'),
        entry('tablet', 768, 'b/t.png'),
      ],
      after: [
        entry('mobile', 375, 'a/m.png'),
        entry('tablet', 768, 'a/t.png'),
      ],
      all_viewports_clean: true,
    };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items.length, 2);
    assert.equal(items[0].name, 'mobile');
    assert.equal(items[1].name, 'tablet');
  });

  it('sets clean=true when both before and after succeed', () => {
    const pair = {
      before: [entry('mobile', 375, 'b/m.png', true)],
      after:  [entry('mobile', 375, 'a/m.png', true)],
      all_viewports_clean: true,
    };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items[0].clean, true);
  });

  it('sets clean=false when before fails', () => {
    const pair = {
      before: [entry('mobile', 375, 'b/m.png', false)],
      after:  [entry('mobile', 375, 'a/m.png', true)],
      all_viewports_clean: false,
    };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items[0].clean, false);
  });

  it('sets clean=false when after fails', () => {
    const pair = {
      before: [entry('mobile', 375, 'b/m.png', true)],
      after:  [entry('mobile', 375, 'a/m.png', false)],
      all_viewports_clean: false,
    };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items[0].clean, false);
  });

  it('sets before_url to null when before screenshot failed', () => {
    const pair = {
      before: [entry('mobile', 375, 'b/m.png', false)],
      after:  [entry('mobile', 375, 'a/m.png', true)],
      all_viewports_clean: false,
    };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items[0].before_url, null);
  });

  it('sets after_url to null when after screenshot failed', () => {
    const pair = {
      before: [entry('mobile', 375, 'b/m.png', true)],
      after:  [entry('mobile', 375, 'a/m.png', false)],
      all_viewports_clean: false,
    };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items[0].after_url, null);
  });

  it('handles viewport only in before array', () => {
    const pair = {
      before: [entry('laptop', 1280, 'b/l.png')],
      after:  [],
      all_viewports_clean: false,
    };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items.length, 1);
    assert.equal(items[0].after_url, null);
    assert.equal(items[0].clean, false);
  });

  it('handles viewport only in after array', () => {
    const pair = {
      before: [],
      after:  [entry('wide', 1920, 'a/w.png')],
      all_viewports_clean: false,
    };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items.length, 1);
    assert.equal(items[0].before_url, null);
    assert.equal(items[0].clean, false);
  });

  it('returns empty array for empty pair', () => {
    const pair = { before: [], after: [], all_viewports_clean: true };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items.length, 0);
  });

  it('handles get_url returning null', () => {
    const pair = {
      before: [entry('mobile', 375, 'b/m.png', true)],
      after:  [entry('mobile', 375, 'a/m.png', true)],
      all_viewports_clean: true,
    };
    const items = buildStripItems(pair, nullUrl);
    assert.equal(items[0].before_url, null);
    assert.equal(items[0].after_url, null);
  });

  it('includes label from getViewportLabel', () => {
    const pair = {
      before: [entry('tablet', 768, 'b/t.png')],
      after:  [entry('tablet', 768, 'a/t.png')],
      all_viewports_clean: true,
    };
    const items = buildStripItems(pair, fakeUrl);
    assert.equal(items[0].label, 'Tablet (768px)');
  });

  it('never throws on null pair', () => {
    assert.doesNotThrow(() => buildStripItems(null as any, fakeUrl));
  });
});

// ── getActiveViewport ────────────────────────────────────────────────────────

describe('getActiveViewport', () => {
  const items = [
    { name: 'mobile', width: 375, before_url: 'b', after_url: 'a', clean: true, label: 'Mobile (375px)' },
    { name: 'tablet', width: 768, before_url: 'b', after_url: 'a', clean: true, label: 'Tablet (768px)' },
  ];

  it('returns matching item by name', () => {
    const result = getActiveViewport(items, 'tablet');
    assert.equal(result?.name, 'tablet');
  });

  it('returns first item when name not found', () => {
    const result = getActiveViewport(items, 'unknown');
    assert.equal(result?.name, 'mobile');
  });

  it('returns null for empty array', () => {
    const result = getActiveViewport([], 'mobile');
    assert.equal(result, null);
  });

  it('returns null for null items', () => {
    const result = getActiveViewport(null as any, 'mobile');
    assert.equal(result, null);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getActiveViewport(undefined as any, undefined as any));
  });
});
