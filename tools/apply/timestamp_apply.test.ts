/**
 * tools/apply/timestamp_apply.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyTimestampFixes, type TimestampApplyResult } from './timestamp_apply.ts';
import type { TimestampPlan, TimestampFix } from '../optimize/timestamp_plan.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const NEW_VAL = '2026-03-11T12:00:00Z';

function makePlan(fixes: TimestampFix[]): TimestampPlan {
  return { site_id: 's1', url: 'https://ex.com/', fixes, timestamp: NEW_VAL };
}

function injectJsonldFix(): TimestampFix {
  return { type: 'inject_jsonld_date_modified', new_value: NEW_VAL, target: 'jsonld' };
}

function updateJsonldFix(current = '2025-01-01T00:00:00Z'): TimestampFix {
  return { type: 'update_jsonld_date_modified', current_value: current, new_value: NEW_VAL, target: 'jsonld' };
}

function injectOgFix(): TimestampFix {
  return { type: 'inject_og_modified_time', new_value: NEW_VAL, target: 'og' };
}

function updateOgFix(current = '2025-01-01T00:00:00Z'): TimestampFix {
  return { type: 'update_og_modified_time', current_value: current, new_value: NEW_VAL, target: 'og' };
}

const ARTICLE_JSONLD_HTML = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","name":"Test"}
</script>
</head><body></body></html>`;

const ARTICLE_WITH_DATE_HTML = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","name":"Test","dateModified":"2025-01-01T00:00:00Z"}
</script>
</head><body></body></html>`;

const WITH_OG_HTML = `<html><head>
<meta property="og:title" content="Test">
<meta property="og:description" content="Desc">
<meta property="article:modified_time" content="2025-01-01T00:00:00Z">
</head><body></body></html>`;

const WITH_OG_NO_MODIFIED_HTML = `<html><head>
<meta property="og:title" content="Test">
<meta property="og:url" content="https://ex.com/">
</head><body></body></html>`;

// ── Return shape ──────────────────────────────────────────────────────────────

describe('applyTimestampFixes — return shape', () => {
  it('returns html, applied, skipped arrays', () => {
    const r = applyTimestampFixes('<html><head></head></html>', makePlan([]));
    assert.ok(typeof r.html === 'string');
    assert.ok(Array.isArray(r.applied));
    assert.ok(Array.isArray(r.skipped));
  });

  it('returns original html when fixes array is empty', () => {
    const html = '<html><head></head></html>';
    const r = applyTimestampFixes(html, makePlan([]));
    assert.equal(r.html, html);
  });

  it('never throws on empty string', () => {
    assert.doesNotThrow(() => applyTimestampFixes('', makePlan([injectJsonldFix()])));
  });

  it('never throws on invalid html input', () => {
    assert.doesNotThrow(() => applyTimestampFixes('not html at all', makePlan([updateJsonldFix()])));
  });
});

// ── inject_jsonld_date_modified ───────────────────────────────────────────────

describe('applyTimestampFixes — inject_jsonld_date_modified', () => {
  it('injects dateModified into Article JSON-LD block', () => {
    const r = applyTimestampFixes(ARTICLE_JSONLD_HTML, makePlan([injectJsonldFix()]));
    assert.ok(r.html.includes(`"dateModified": "${NEW_VAL}"`));
    assert.equal(r.applied.length, 1);
    assert.equal(r.skipped.length, 0);
  });

  it('injects into WebPage @type block', () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"p"}</script></head></html>`;
    const r = applyTimestampFixes(html, makePlan([injectJsonldFix()]));
    assert.ok(r.html.includes('"dateModified"'));
    assert.equal(r.applied.length, 1);
  });

  it('injects into Product @type block', () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"p"}</script></head></html>`;
    const r = applyTimestampFixes(html, makePlan([injectJsonldFix()]));
    assert.ok(r.html.includes('"dateModified"'));
    assert.equal(r.applied.length, 1);
  });

  it('creates minimal WebPage block before </head> when no matching JSON-LD exists', () => {
    const html = `<html><head></head><body></body></html>`;
    const r = applyTimestampFixes(html, makePlan([injectJsonldFix()]));
    assert.ok(r.html.includes('application/ld+json'));
    assert.ok(r.html.includes('"WebPage"'));
    assert.ok(r.html.includes(`"dateModified": "${NEW_VAL}"`));
    assert.equal(r.applied.length, 1);
  });

  it('creates minimal WebPage block when JSON-LD exists but has no matching @type', () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","name":"Bob"}</script></head></html>`;
    const r = applyTimestampFixes(html, makePlan([injectJsonldFix()]));
    // Should still inject a minimal WebPage block
    assert.ok(r.html.includes('"dateModified"'));
    assert.equal(r.applied.length, 1);
  });

  it('skips inject if no <head> tag to anchor to (no matching block + no head)', () => {
    const html = `<body>no head tag at all</body>`;
    const r = applyTimestampFixes(html, makePlan([injectJsonldFix()]));
    // Cannot place the new block — should be skipped
    assert.equal(r.skipped.length, 1);
  });

  it('only injects once even when multiple matching JSON-LD blocks present', () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","name":"A"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","name":"B"}</script>
</head></html>`;
    const r = applyTimestampFixes(html, makePlan([injectJsonldFix()]));
    const count = (r.html.match(/"dateModified"/g) || []).length;
    assert.equal(count, 1);
    assert.equal(r.applied.length, 1);
  });
});

// ── update_jsonld_date_modified ───────────────────────────────────────────────

describe('applyTimestampFixes — update_jsonld_date_modified', () => {
  it('replaces existing dateModified value in JSON-LD', () => {
    const r = applyTimestampFixes(ARTICLE_WITH_DATE_HTML, makePlan([updateJsonldFix()]));
    assert.ok(r.html.includes(`"dateModified": "${NEW_VAL}"`));
    assert.ok(!r.html.includes('2025-01-01'));
    assert.equal(r.applied.length, 1);
    assert.equal(r.skipped.length, 0);
  });

  it('skips when no JSON-LD block contains dateModified', () => {
    const r = applyTimestampFixes(ARTICLE_JSONLD_HTML, makePlan([updateJsonldFix()]));
    assert.equal(r.skipped.length, 1);
    assert.equal(r.applied.length, 0);
  });
});

// ── inject_og_modified_time ───────────────────────────────────────────────────

describe('applyTimestampFixes — inject_og_modified_time', () => {
  it('inserts article:modified_time after last og: meta tag', () => {
    const r = applyTimestampFixes(WITH_OG_NO_MODIFIED_HTML, makePlan([injectOgFix()]));
    assert.ok(r.html.includes('article:modified_time'));
    assert.ok(r.html.includes(NEW_VAL));
    assert.equal(r.applied.length, 1);
  });

  it('inserts after <head> open tag when no og: meta tags present', () => {
    const html = `<html><head>\n<title>Test</title>\n</head><body></body></html>`;
    const r = applyTimestampFixes(html, makePlan([injectOgFix()]));
    assert.ok(r.html.includes('article:modified_time'));
    assert.ok(r.html.includes(NEW_VAL));
    assert.equal(r.applied.length, 1);
  });

  it('skips when no <head> tag and no og: tags to anchor to', () => {
    const html = `<body>no head</body>`;
    const r = applyTimestampFixes(html, makePlan([injectOgFix()]));
    assert.equal(r.skipped.length, 1);
  });
});

// ── update_og_modified_time ───────────────────────────────────────────────────

describe('applyTimestampFixes — update_og_modified_time', () => {
  it('replaces existing article:modified_time content', () => {
    const r = applyTimestampFixes(WITH_OG_HTML, makePlan([updateOgFix()]));
    assert.ok(r.html.includes(NEW_VAL));
    assert.ok(!r.html.includes('2025-01-01'));
    assert.equal(r.applied.length, 1);
    assert.equal(r.skipped.length, 0);
  });

  it('handles content-first attribute order', () => {
    const html = `<html><head><meta content="2025-01-01T00:00:00Z" property="article:modified_time"></head></html>`;
    const r = applyTimestampFixes(html, makePlan([updateOgFix()]));
    assert.ok(r.html.includes(NEW_VAL));
    assert.equal(r.applied.length, 1);
  });

  it('skips when article:modified_time tag is not present', () => {
    const html = `<html><head><meta property="og:title" content="Test"></head></html>`;
    const r = applyTimestampFixes(html, makePlan([updateOgFix()]));
    assert.equal(r.skipped.length, 1);
  });
});

// ── Mixed plan ────────────────────────────────────────────────────────────────

describe('applyTimestampFixes — mixed plan', () => {
  it('applies both jsonld inject and og inject from a two-fix plan', () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","name":"A"}</script>
<meta property="og:title" content="A">
</head><body></body></html>`;
    const r = applyTimestampFixes(html, makePlan([injectJsonldFix(), injectOgFix()]));
    assert.equal(r.applied.length, 2);
    assert.equal(r.skipped.length, 0);
    assert.ok(r.html.includes('"dateModified"'));
    assert.ok(r.html.includes('article:modified_time'));
  });

  it('accumulates skipped fixes correctly', () => {
    // No JSON-LD with dateModified, no article:modified_time → both updates skip
    const html = `<html><head></head></html>`;
    const r = applyTimestampFixes(html, makePlan([updateJsonldFix(), updateOgFix()]));
    assert.equal(r.skipped.length, 2);
    assert.equal(r.applied.length, 0);
  });

  it('unknown fix type goes to skipped', () => {
    const fix = { type: 'unknown_fix_type' as never, new_value: NEW_VAL, target: 'jsonld' as const };
    const r = applyTimestampFixes('<html><head></head></html>', makePlan([fix]));
    assert.equal(r.skipped.length, 1);
    assert.equal(r.applied.length, 0);
  });
});

// ── Guard against bad input ───────────────────────────────────────────────────

describe('applyTimestampFixes — bad inputs', () => {
  it('returns all fixes as skipped when html is not a string', () => {
    const r = applyTimestampFixes(null as unknown as string, makePlan([injectJsonldFix()]));
    assert.equal(r.applied.length, 0);
    assert.equal(r.skipped.length, 1);
  });

  it('returns empty result when plan has no fixes', () => {
    const r = applyTimestampFixes('<html><head></head></html>', makePlan([]));
    assert.equal(r.applied.length, 0);
    assert.equal(r.skipped.length, 0);
  });
});
