import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDateModifiedJSONLD,
  extractArticleModifiedOG,
  checkFreshnessSignalsInSync,
  auditFreshnessSignals,
  auditSiteFreshness,
} from './freshness_signal_auditor.js';

// ── extractDateModifiedJSONLD ────────────────────────────────────────────────

describe('extractDateModifiedJSONLD', () => {
  it('returns value when present', () => {
    const html = '<script type="application/ld+json">{"dateModified":"2025-12-01T10:00:00Z"}</script>';
    assert.equal(extractDateModifiedJSONLD(html), '2025-12-01T10:00:00Z');
  });

  it('returns null when absent', () => {
    assert.equal(extractDateModifiedJSONLD('<html><body>No date</body></html>'), null);
  });

  it('returns null for empty string', () => {
    assert.equal(extractDateModifiedJSONLD(''), null);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => extractDateModifiedJSONLD(null as any));
  });
});

// ── extractArticleModifiedOG ─────────────────────────────────────────────────

describe('extractArticleModifiedOG', () => {
  it('returns value when present', () => {
    const html = '<meta property="article:modified_time" content="2025-12-01T10:00:00Z">';
    assert.equal(extractArticleModifiedOG(html), '2025-12-01T10:00:00Z');
  });

  it('returns null when absent', () => {
    assert.equal(extractArticleModifiedOG('<html><body>No OG</body></html>'), null);
  });

  it('returns null for empty string', () => {
    assert.equal(extractArticleModifiedOG(''), null);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => extractArticleModifiedOG(null as any));
  });
});

// ── checkFreshnessSignalsInSync ──────────────────────────────────────────────

describe('checkFreshnessSignalsInSync', () => {
  it('returns true when both match within 24h', () => {
    assert.equal(checkFreshnessSignalsInSync('2025-12-01T10:00:00Z', '2025-12-01T12:00:00Z'), true);
  });

  it('returns false when mismatched beyond 24h', () => {
    assert.equal(checkFreshnessSignalsInSync('2025-12-01T00:00:00Z', '2025-12-03T00:00:00Z'), false);
  });

  it('returns false when jsonld is null', () => {
    assert.equal(checkFreshnessSignalsInSync(null, '2025-12-01T00:00:00Z'), false);
  });

  it('returns false when og is null', () => {
    assert.equal(checkFreshnessSignalsInSync('2025-12-01T00:00:00Z', null), false);
  });

  it('returns false when both null', () => {
    assert.equal(checkFreshnessSignalsInSync(null, null), false);
  });

  it('never throws on invalid dates', () => {
    assert.doesNotThrow(() => checkFreshnessSignalsInSync('not-a-date', 'also-not'));
  });
});

// ── auditFreshnessSignals ────────────────────────────────────────────────────

describe('auditFreshnessSignals', () => {
  it('freshness_score=100 when both present and synced', () => {
    const html = `<script type="application/ld+json">{"dateModified":"2025-12-01T10:00:00Z"}</script>
                  <meta property="article:modified_time" content="2025-12-01T11:00:00Z">`;
    const result = auditFreshnessSignals(html, 'https://x.com/page');
    assert.equal(result.freshness_score, 100);
    assert.equal(result.signals_in_sync, true);
  });

  it('freshness_score=0 when neither present', () => {
    const result = auditFreshnessSignals('<html><body>No dates</body></html>', 'https://x.com/page');
    assert.equal(result.freshness_score, 0);
  });

  it('freshness_score=50 when only one present', () => {
    const html = '<script type="application/ld+json">{"dateModified":"2025-12-01T10:00:00Z"}</script>';
    const result = auditFreshnessSignals(html, 'https://x.com/page');
    assert.equal(result.freshness_score, 50);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => auditFreshnessSignals(null as any, null as any));
  });
});

// ── auditSiteFreshness ───────────────────────────────────────────────────────

describe('auditSiteFreshness', () => {
  it('returns empty on error', async () => {
    const result = await auditSiteFreshness('site1', {
      loadPagesFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result.pages_audited, 0);
  });

  it('returns correct counts', async () => {
    const result = await auditSiteFreshness('site1', {
      loadPagesFn: async () => [
        { html: '<script type="application/ld+json">{"dateModified":"2025-12-01T10:00:00Z"}</script><meta property="article:modified_time" content="2025-12-01T11:00:00Z">', url: 'https://x.com/a' },
        { html: '<html>no dates</html>', url: 'https://x.com/b' },
      ],
    });
    assert.equal(result.pages_audited, 2);
    assert.equal(result.pages_with_both_signals, 1);
    assert.equal(result.pages_missing_signals, 1);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => auditSiteFreshness(null as any));
  });
});
