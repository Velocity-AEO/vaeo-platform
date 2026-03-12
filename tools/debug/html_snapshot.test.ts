/**
 * tools/debug/html_snapshot.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureSnapshot,
  diffSnapshots,
  shouldCaptureSnapshot,
} from './html_snapshot.ts';

// ── captureSnapshot ───────────────────────────────────────────────────────────

describe('captureSnapshot', () => {
  it('returns trimmed html for normal input', () => {
    const snap = captureSnapshot('  <p>Hello</p>  ');
    assert.equal(snap, '<p>Hello</p>');
  });

  it('returns empty string for empty input', () => {
    assert.equal(captureSnapshot(''), '');
  });

  it('returns empty string for null input', () => {
    assert.equal(captureSnapshot(null as unknown as string), '');
  });

  it('truncates at 50,000 chars with a truncation marker', () => {
    const big = 'x'.repeat(60_000);
    const snap = captureSnapshot(big);
    assert.ok(snap.length < 60_000);
    assert.ok(snap.includes('[snapshot truncated]'));
  });

  it('does not truncate html under 50,000 chars', () => {
    const html = '<html>' + 'a'.repeat(1000) + '</html>';
    const snap = captureSnapshot(html);
    assert.equal(snap, html);
  });

  it('never throws on non-string input', () => {
    assert.doesNotThrow(() => captureSnapshot(42 as unknown as string));
  });
});

// ── diffSnapshots ─────────────────────────────────────────────────────────────

describe('diffSnapshots', () => {
  it('returns No changes detected when before === after', () => {
    const html = '<html><head></head><body>hello</body></html>';
    const d = diffSnapshots(html, html);
    assert.equal(d.change_summary, 'No changes detected');
    assert.equal(d.changed_lines, 0);
  });

  it('counts added lines (lines in after but not before)', () => {
    const before = 'line1\nline2';
    const after  = 'line1\nline2\nline3';
    const d = diffSnapshots(before, after);
    assert.equal(d.added_lines, 1);
  });

  it('counts removed lines (lines in before but not after)', () => {
    const before = 'line1\nline2\nline3';
    const after  = 'line1\nline2';
    const d = diffSnapshots(before, after);
    assert.equal(d.removed_lines, 1);
  });

  it('changed_lines = added + removed', () => {
    const before = 'a\nb\nc';
    const after  = 'a\nd\ne';
    const d = diffSnapshots(before, after);
    assert.equal(d.changed_lines, d.added_lines + d.removed_lines);
  });

  it('change_summary includes counts when there are changes', () => {
    const before = 'line1\nline2';
    const after  = 'line1\nline3';
    const d = diffSnapshots(before, after);
    assert.ok(d.change_summary.includes('added'));
    assert.ok(d.change_summary.includes('removed'));
  });

  it('preserves before and after in result', () => {
    const before = '<p>before</p>';
    const after  = '<p>after</p>';
    const d = diffSnapshots(before, after);
    assert.equal(d.before, before);
    assert.equal(d.after, after);
  });

  it('never throws on empty strings', () => {
    assert.doesNotThrow(() => diffSnapshots('', ''));
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() =>
      diffSnapshots(null as unknown as string, null as unknown as string),
    );
  });
});

// ── shouldCaptureSnapshot ─────────────────────────────────────────────────────

describe('shouldCaptureSnapshot', () => {
  it('returns true for fix_applied with debug_mode=true', () => {
    assert.equal(shouldCaptureSnapshot('fix_applied', true), true);
  });

  it('returns true for fix_failed with debug_mode=true', () => {
    assert.equal(shouldCaptureSnapshot('fix_failed', true), true);
  });

  it('returns false for fix_applied with debug_mode=false', () => {
    assert.equal(shouldCaptureSnapshot('fix_applied', false), false);
  });

  it('returns false for decision even with debug_mode=true', () => {
    assert.equal(shouldCaptureSnapshot('decision', true), false);
  });

  it('returns false for learning_write with debug_mode=true', () => {
    assert.equal(shouldCaptureSnapshot('learning_write', true), false);
  });

  it('never throws on invalid input', () => {
    assert.doesNotThrow(() =>
      shouldCaptureSnapshot(null as unknown as string, null as unknown as boolean),
    );
  });
});
