import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBreakpointClass,
  isMobile,
  getTruncatedText,
  getColumnCount,
  shouldStackLayout,
} from './mobile_layout.js';

// ── getBreakpointClass ───────────────────────────────────────────────────────

describe('getBreakpointClass', () => {
  it('returns mobile for 375 (iPhone SE)', () => {
    assert.equal(getBreakpointClass(375), 'mobile');
  });

  it('returns mobile for 320', () => {
    assert.equal(getBreakpointClass(320), 'mobile');
  });

  it('returns mobile for 767', () => {
    assert.equal(getBreakpointClass(767), 'mobile');
  });

  it('returns tablet for 768 (iPad)', () => {
    assert.equal(getBreakpointClass(768), 'tablet');
  });

  it('returns tablet for 1023', () => {
    assert.equal(getBreakpointClass(1023), 'tablet');
  });

  it('returns desktop for 1024', () => {
    assert.equal(getBreakpointClass(1024), 'desktop');
  });

  it('returns desktop for 1280', () => {
    assert.equal(getBreakpointClass(1280), 'desktop');
  });

  it('returns mobile for 0', () => {
    assert.equal(getBreakpointClass(0), 'mobile');
  });

  it('never throws on NaN', () => {
    assert.doesNotThrow(() => getBreakpointClass(NaN));
  });
});

// ── isMobile ─────────────────────────────────────────────────────────────────

describe('isMobile', () => {
  it('returns true for 375', () => {
    assert.equal(isMobile(375), true);
  });

  it('returns false for 768', () => {
    assert.equal(isMobile(768), false);
  });

  it('returns false for 1280', () => {
    assert.equal(isMobile(1280), false);
  });

  it('returns true for 0', () => {
    assert.equal(isMobile(0), true);
  });
});

// ── getTruncatedText ─────────────────────────────────────────────────────────

describe('getTruncatedText', () => {
  it('truncates long text on mobile to 40 chars', () => {
    const long = 'A'.repeat(60);
    const result = getTruncatedText(long, 100, true);
    assert.equal(result.length, 43); // 40 + '...'
    assert.ok(result.endsWith('...'));
  });

  it('truncates to max_chars on desktop', () => {
    const long = 'B'.repeat(60);
    const result = getTruncatedText(long, 50, false);
    assert.equal(result.length, 53); // 50 + '...'
  });

  it('preserves short text on mobile', () => {
    assert.equal(getTruncatedText('short', 100, true), 'short');
  });

  it('preserves short text on desktop', () => {
    assert.equal(getTruncatedText('short', 100, false), 'short');
  });

  it('respects max_chars < 40 on mobile', () => {
    const text = 'A'.repeat(30);
    const result = getTruncatedText(text, 20, true);
    assert.equal(result.length, 23); // 20 + '...'
  });

  it('never throws on empty string', () => {
    assert.equal(getTruncatedText('', 10, true), '');
  });

  it('never throws on null text', () => {
    assert.doesNotThrow(() => getTruncatedText(null as unknown as string, 10, true));
  });
});

// ── getColumnCount ───────────────────────────────────────────────────────────

describe('getColumnCount', () => {
  it('returns 1 on mobile', () => {
    assert.equal(getColumnCount(true, false), 1);
  });

  it('returns 2 on tablet', () => {
    assert.equal(getColumnCount(false, true), 2);
  });

  it('returns 4 on desktop', () => {
    assert.equal(getColumnCount(false, false), 4);
  });
});

// ── shouldStackLayout ────────────────────────────────────────────────────────

describe('shouldStackLayout', () => {
  it('returns true on mobile', () => {
    assert.equal(shouldStackLayout(true), true);
  });

  it('returns false on desktop', () => {
    assert.equal(shouldStackLayout(false), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => shouldStackLayout(null as unknown as boolean));
  });
});
