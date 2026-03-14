/**
 * tools/sandbox/wp_delta_verify.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractExpectedSignal,
  verifySignalPresent,
  verifyWPDelta,
  type WPDeltaVerifyConfig,
} from './wp_delta_verify.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const HTML_WITH_TITLE  = '<html><head><title>My Page Title</title></head></html>';
const HTML_WITH_META   = '<html><head><meta name="description" content="Great description here" /></head></html>';
const HTML_WITH_SCHEMA = '<html><head><script type="application/ld+json">{"@type":"Product"}</script></head></html>';
const HTML_WITH_OG     = '<html><head><meta property="og:title" content="OG Title Value" /></head></html>';
const HTML_WITH_CANON  = '<html><head><link rel="canonical" href="https://example.com/page" /></head></html>';
const HTML_BARE        = '<html><head></head><body></body></html>';

function cfg(issue_type: string, expected_value: string): WPDeltaVerifyConfig {
  return { issue_type, expected_value, url: 'https://x.com/' };
}

// ── extractExpectedSignal ─────────────────────────────────────────────────────

describe('extractExpectedSignal', () => {
  it('extracts title for TITLE_MISSING', () => {
    const v = extractExpectedSignal(HTML_WITH_TITLE, 'TITLE_MISSING');
    assert.equal(v, 'My Page Title');
  });

  it('extracts title for TITLE_LONG', () => {
    const v = extractExpectedSignal(HTML_WITH_TITLE, 'TITLE_LONG');
    assert.equal(v, 'My Page Title');
  });

  it('extracts meta description for META_DESC_MISSING', () => {
    const v = extractExpectedSignal(HTML_WITH_META, 'META_DESC_MISSING');
    assert.equal(v, 'Great description here');
  });

  it('extracts meta description for META_DESC_LONG', () => {
    const v = extractExpectedSignal(HTML_WITH_META, 'META_DESC_LONG');
    assert.equal(v, 'Great description here');
  });

  it('extracts JSON-LD schema for SCHEMA_MISSING', () => {
    const v = extractExpectedSignal(HTML_WITH_SCHEMA, 'SCHEMA_MISSING');
    assert.ok(v?.includes('@type'));
  });

  it('extracts og:title for OG_MISSING', () => {
    const v = extractExpectedSignal(HTML_WITH_OG, 'OG_MISSING');
    assert.equal(v, 'OG Title Value');
  });

  it('extracts canonical href for CANONICAL_MISSING', () => {
    const v = extractExpectedSignal(HTML_WITH_CANON, 'CANONICAL_MISSING');
    assert.equal(v, 'https://example.com/page');
  });

  it('returns null when title tag absent', () => {
    assert.equal(extractExpectedSignal(HTML_BARE, 'TITLE_MISSING'), null);
  });

  it('returns null for unknown issue_type', () => {
    assert.equal(extractExpectedSignal(HTML_WITH_TITLE, 'UNKNOWN_TYPE'), null);
  });

  it('returns null on empty html', () => {
    assert.equal(extractExpectedSignal('', 'TITLE_MISSING'), null);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => extractExpectedSignal(null as never, null as never));
  });
});

// ── verifySignalPresent ───────────────────────────────────────────────────────

describe('verifySignalPresent', () => {
  it('returns true when title contains expected value', () => {
    assert.equal(verifySignalPresent(HTML_WITH_TITLE, 'TITLE_MISSING', 'My Page'), true);
  });

  it('returns false when title does not match expected', () => {
    assert.equal(verifySignalPresent(HTML_WITH_TITLE, 'TITLE_MISSING', 'Other Title'), false);
  });

  it('is case-insensitive', () => {
    assert.equal(verifySignalPresent(HTML_WITH_TITLE, 'TITLE_MISSING', 'my page title'), true);
  });

  it('returns false when signal absent', () => {
    assert.equal(verifySignalPresent(HTML_BARE, 'TITLE_MISSING', 'anything'), false);
  });

  it('returns false for unknown issue_type', () => {
    assert.equal(verifySignalPresent(HTML_WITH_TITLE, 'UNKNOWN', 'whatever'), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => verifySignalPresent(null as never, null as never, null as never));
  });
});

// ── verifyWPDelta ─────────────────────────────────────────────────────────────

describe('verifyWPDelta', () => {
  it('returns verified=true when signal present in after', async () => {
    const result = await verifyWPDelta(HTML_BARE, HTML_WITH_TITLE, cfg('TITLE_MISSING', 'My Page Title'));
    assert.equal(result.verified, true);
  });

  it('returns verified=false when signal not in after', async () => {
    const result = await verifyWPDelta(HTML_BARE, HTML_BARE, cfg('TITLE_MISSING', 'My Page Title'));
    assert.equal(result.verified, false);
  });

  it('found_value reflects extracted content from after_html', async () => {
    const result = await verifyWPDelta(HTML_BARE, HTML_WITH_TITLE, cfg('TITLE_MISSING', 'My Page Title'));
    assert.ok(result.found_value?.includes('My Page Title'));
  });

  it('has verified_at timestamp', async () => {
    const result = await verifyWPDelta(HTML_BARE, HTML_WITH_TITLE, cfg('TITLE_MISSING', 'x'));
    assert.ok(result.verified_at.includes('T'));
  });

  it('returns issue_type on result', async () => {
    const result = await verifyWPDelta(HTML_BARE, HTML_WITH_META, cfg('META_DESC_MISSING', 'Great'));
    assert.equal(result.issue_type, 'META_DESC_MISSING');
  });

  it('returns expected_value on result', async () => {
    const result = await verifyWPDelta(HTML_BARE, HTML_WITH_TITLE, cfg('TITLE_MISSING', 'My Page Title'));
    assert.equal(result.expected_value, 'My Page Title');
  });

  it('uses custom verifyFn when provided', async () => {
    let called = false;
    await verifyWPDelta(HTML_BARE, HTML_BARE, cfg('TITLE_MISSING', 'x'), {
      verifyFn: () => { called = true; return true; },
    });
    assert.equal(called, true);
  });

  it('never throws when verifyFn throws', async () => {
    await assert.doesNotReject(() =>
      verifyWPDelta(HTML_BARE, HTML_BARE, cfg('TITLE_MISSING', 'x'), {
        verifyFn: () => { throw new Error('boom'); },
      }),
    );
  });

  it('returns verified=false when verifyFn throws', async () => {
    const result = await verifyWPDelta(HTML_BARE, HTML_BARE, cfg('TITLE_MISSING', 'x'), {
      verifyFn: () => { throw new Error('boom'); },
    });
    assert.equal(result.verified, false);
  });
});
