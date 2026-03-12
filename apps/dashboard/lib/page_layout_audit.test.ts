import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkTapTarget,
  checkHorizontalOverflow,
  checkFontSize,
  checkContainerPadding,
  checkStackedLayout,
  checkImageAspectRatio,
  buildLayoutAudit,
  isAuditPassing,
} from './page_layout_audit.js';

// ── checkTapTarget ───────────────────────────────────────────────────────────

describe('checkTapTarget', () => {
  it('passes for 44px', () => {
    assert.equal(checkTapTarget(44).severity, 'pass');
  });

  it('passes for 48px', () => {
    assert.equal(checkTapTarget(48).severity, 'pass');
  });

  it('warns for 40px', () => {
    assert.equal(checkTapTarget(40).severity, 'warn');
  });

  it('fails for 30px', () => {
    assert.equal(checkTapTarget(30).severity, 'fail');
  });

  it('never throws on NaN', () => {
    assert.doesNotThrow(() => checkTapTarget(NaN));
  });
});

// ── checkHorizontalOverflow ──────────────────────────────────────────────────

describe('checkHorizontalOverflow', () => {
  it('passes when content fits viewport', () => {
    assert.equal(checkHorizontalOverflow(360, 375).severity, 'pass');
  });

  it('passes when content equals viewport', () => {
    assert.equal(checkHorizontalOverflow(375, 375).severity, 'pass');
  });

  it('fails when content overflows', () => {
    assert.equal(checkHorizontalOverflow(500, 375).severity, 'fail');
  });
});

// ── checkFontSize ────────────────────────────────────────────────────────────

describe('checkFontSize', () => {
  it('passes for 16px', () => {
    assert.equal(checkFontSize(16).severity, 'pass');
  });

  it('warns for 12px', () => {
    assert.equal(checkFontSize(12).severity, 'warn');
  });

  it('warns for 10px', () => {
    assert.equal(checkFontSize(10).severity, 'warn');
  });

  it('fails for 8px', () => {
    assert.equal(checkFontSize(8).severity, 'fail');
  });
});

// ── checkContainerPadding ────────────────────────────────────────────────────

describe('checkContainerPadding', () => {
  it('passes for 16px', () => {
    assert.equal(checkContainerPadding(16).severity, 'pass');
  });

  it('warns for 12px', () => {
    assert.equal(checkContainerPadding(12).severity, 'warn');
  });

  it('fails for 4px', () => {
    assert.equal(checkContainerPadding(4).severity, 'fail');
  });
});

// ── checkStackedLayout ───────────────────────────────────────────────────────

describe('checkStackedLayout', () => {
  it('passes when stacked on mobile', () => {
    assert.equal(checkStackedLayout(true, 375).severity, 'pass');
  });

  it('fails when not stacked on mobile', () => {
    assert.equal(checkStackedLayout(false, 375).severity, 'fail');
  });

  it('passes on desktop regardless', () => {
    assert.equal(checkStackedLayout(false, 1024).severity, 'pass');
  });
});

// ── checkImageAspectRatio ────────────────────────────────────────────────────

describe('checkImageAspectRatio', () => {
  it('passes for 16:9', () => {
    assert.equal(checkImageAspectRatio(160, 90).severity, 'pass');
  });

  it('warns for extreme ratio', () => {
    assert.equal(checkImageAspectRatio(400, 10).severity, 'warn');
  });

  it('warns for zero dimension', () => {
    assert.equal(checkImageAspectRatio(0, 100).severity, 'warn');
  });
});

// ── buildLayoutAudit ─────────────────────────────────────────────────────────

describe('buildLayoutAudit', () => {
  it('counts pass/warn/fail correctly', () => {
    const results = [
      checkTapTarget(44),
      checkFontSize(16),
      checkFontSize(10),
      checkTapTarget(20),
    ];
    const report = buildLayoutAudit('/client/test', results);
    assert.equal(report.pass_count, 2);
    assert.equal(report.warn_count, 1);
    assert.equal(report.fail_count, 1);
  });

  it('computes score as percent of passes', () => {
    const results = [
      checkTapTarget(44),
      checkTapTarget(48),
      checkTapTarget(50),
      checkTapTarget(20),
    ];
    const report = buildLayoutAudit('/test', results);
    assert.equal(report.score, 75);
  });

  it('handles empty results', () => {
    const report = buildLayoutAudit('/empty', []);
    assert.equal(report.score, 0);
    assert.equal(report.pass_count, 0);
  });
});

// ── isAuditPassing ───────────────────────────────────────────────────────────

describe('isAuditPassing', () => {
  it('returns true when no failures', () => {
    const report = buildLayoutAudit('/ok', [checkTapTarget(44), checkFontSize(16)]);
    assert.equal(isAuditPassing(report), true);
  });

  it('returns false when failures exist', () => {
    const report = buildLayoutAudit('/bad', [checkTapTarget(20)]);
    assert.equal(isAuditPassing(report), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isAuditPassing(null as unknown as any));
  });
});
