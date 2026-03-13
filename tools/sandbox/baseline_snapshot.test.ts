/**
 * tools/sandbox/baseline_snapshot.test.ts
 *
 * Tests for capturePageBaseline, diffBaselines, calculateBaselineSeverity,
 * saveBaselineSnapshot, loadLatestBaseline.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  capturePageBaseline,
  diffBaselines,
  calculateBaselineSeverity,
  saveBaselineSnapshot,
  loadLatestBaseline,
  type BaselineSnapshot,
  type BaselineDiff,
} from './baseline_snapshot.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSnap(overrides: Partial<BaselineSnapshot> = {}): BaselineSnapshot {
  return {
    id:                 '',
    site_id:            'site_1',
    snapshot_date:      '2026-03-10',
    url:                'https://example.com/',
    title:              'Home',
    meta_description:   'A description',
    canonical:          'https://example.com/',
    has_schema:         true,
    schema_types:       ['Product'],
    has_og_tags:        true,
    has_canonical:      true,
    is_noindex:         false,
    h1_count:           1,
    word_count:         200,
    image_count:        3,
    images_missing_alt: 0,
    internal_links:     5,
    external_links:     2,
    mobile_lighthouse:  85,
    page_size_bytes:    4096,
    captured_at:        '2026-03-10T00:00:00Z',
    ...overrides,
  };
}

const TITLE_HTML = '<html><head><title>My Page Title</title></head><body></body></html>';
const META_HTML  = '<html><head><meta name="description" content="Page description here" /></head><body></body></html>';
const SCHEMA_HTML = '<html><head><script type="application/ld+json">{"@type":"Product","@context":"https://schema.org"}</script></head></html>';
const OG_HTML    = '<html><head><meta property="og:title" content="OG Title" /></head></html>';
const NOINDEX_HTML = '<html><head><meta name="robots" content="noindex,follow" /></head></html>';
const H1_HTML    = '<html><body><h1>Title One</h1><h1>Title Two</h1><p>text</p></body></html>';
const IMG_HTML   = '<html><body><img src="a.jpg" alt="ok"><img src="b.jpg" alt=""><img src="c.jpg"></body></html>';

// ── capturePageBaseline ───────────────────────────────────────────────────────

describe('capturePageBaseline', () => {
  it('extracts title', () => {
    const snap = capturePageBaseline('https://x.com', TITLE_HTML, {}, null);
    assert.equal(snap.title, 'My Page Title');
  });

  it('returns null title for missing <title>', () => {
    const snap = capturePageBaseline('https://x.com', '<html></html>', {}, null);
    assert.equal(snap.title, null);
  });

  it('extracts meta description', () => {
    const snap = capturePageBaseline('https://x.com', META_HTML, {}, null);
    assert.equal(snap.meta_description, 'Page description here');
  });

  it('returns null meta_description when missing', () => {
    const snap = capturePageBaseline('https://x.com', '<html></html>', {}, null);
    assert.equal(snap.meta_description, null);
  });

  it('detects schema presence', () => {
    const snap = capturePageBaseline('https://x.com', SCHEMA_HTML, {}, null);
    assert.equal(snap.has_schema, true);
  });

  it('reports no schema when absent', () => {
    const snap = capturePageBaseline('https://x.com', '<html></html>', {}, null);
    assert.equal(snap.has_schema, false);
  });

  it('extracts schema types', () => {
    const snap = capturePageBaseline('https://x.com', SCHEMA_HTML, {}, null);
    assert.deepEqual(snap.schema_types, ['Product']);
  });

  it('returns empty schema_types when no schema', () => {
    const snap = capturePageBaseline('https://x.com', '<html></html>', {}, null);
    assert.deepEqual(snap.schema_types, []);
  });

  it('detects og tags', () => {
    const snap = capturePageBaseline('https://x.com', OG_HTML, {}, null);
    assert.equal(snap.has_og_tags, true);
  });

  it('reports no og tags when absent', () => {
    const snap = capturePageBaseline('https://x.com', '<html></html>', {}, null);
    assert.equal(snap.has_og_tags, false);
  });

  it('detects noindex', () => {
    const snap = capturePageBaseline('https://x.com', NOINDEX_HTML, {}, null);
    assert.equal(snap.is_noindex, true);
  });

  it('reports not noindex when absent', () => {
    const snap = capturePageBaseline('https://x.com', '<html></html>', {}, null);
    assert.equal(snap.is_noindex, false);
  });

  it('counts h1 tags', () => {
    const snap = capturePageBaseline('https://x.com', H1_HTML, {}, null);
    assert.equal(snap.h1_count, 2);
  });

  it('counts images', () => {
    const snap = capturePageBaseline('https://x.com', IMG_HTML, {}, null);
    assert.equal(snap.image_count, 3);
  });

  it('counts images missing alt', () => {
    const snap = capturePageBaseline('https://x.com', IMG_HTML, {}, null);
    // b.jpg has empty alt, c.jpg has no alt → 2 missing
    assert.equal(snap.images_missing_alt, 2);
  });

  it('sets mobile_lighthouse from argument', () => {
    const snap = capturePageBaseline('https://x.com', '', {}, 78);
    assert.equal(snap.mobile_lighthouse, 78);
  });

  it('sets mobile_lighthouse to null when not provided', () => {
    const snap = capturePageBaseline('https://x.com', '', {}, null);
    assert.equal(snap.mobile_lighthouse, null);
  });

  it('extracts canonical', () => {
    const html = '<html><head><link rel="canonical" href="https://example.com/" /></head></html>';
    const snap = capturePageBaseline('https://x.com', html, {}, null);
    assert.equal(snap.canonical, 'https://example.com/');
    assert.equal(snap.has_canonical, true);
  });

  it('counts internal links', () => {
    const html = '<html><body><a href="/about">About</a><a href="/contact">Contact</a></body></html>';
    const snap = capturePageBaseline('https://x.com', html, {}, null);
    assert.equal(snap.internal_links, 2);
  });

  it('counts external links', () => {
    const html = '<html><body><a href="https://google.com">G</a><a href="http://example.com">E</a></body></html>';
    const snap = capturePageBaseline('https://x.com', html, {}, null);
    assert.equal(snap.external_links, 2);
  });

  it('uses content-length header for page_size_bytes when present', () => {
    const snap = capturePageBaseline('https://x.com', '<html></html>', { 'content-length': '1234' }, null);
    assert.equal(snap.page_size_bytes, 1234);
  });

  it('never throws on empty html', () => {
    assert.doesNotThrow(() => capturePageBaseline('https://x.com', '', {}, null));
  });

  it('never throws on null html', () => {
    assert.doesNotThrow(() => capturePageBaseline('https://x.com', null as any, {}, null));
  });
});

// ── diffBaselines ─────────────────────────────────────────────────────────────

describe('diffBaselines', () => {
  it('returns empty changes for identical snapshots', () => {
    const snap = makeSnap();
    const diff = diffBaselines(snap, snap);
    assert.equal(diff.changes.length, 0);
  });

  it('detects changed fields', () => {
    const curr = makeSnap({ title: 'New Title' });
    const prev = makeSnap({ title: 'Old Title' });
    const diff = diffBaselines(curr, prev);
    const titleChange = diff.changes.find(c => c.field === 'title');
    assert.ok(titleChange);
    assert.equal(titleChange?.change_type, 'changed');
  });

  it('detects added fields (prev null → curr value)', () => {
    const curr = makeSnap({ canonical: 'https://example.com/' });
    const prev = makeSnap({ canonical: null });
    const diff = diffBaselines(curr, prev);
    const canonChange = diff.changes.find(c => c.field === 'canonical');
    assert.equal(canonChange?.change_type, 'added');
  });

  it('detects removed fields (prev value → curr null)', () => {
    const curr = makeSnap({ title: null });
    const prev = makeSnap({ title: 'Old Title' });
    const diff = diffBaselines(curr, prev);
    const titleChange = diff.changes.find(c => c.field === 'title');
    assert.equal(titleChange?.change_type, 'removed');
  });

  it('classifies noindex add as degraded', () => {
    const curr = makeSnap({ is_noindex: true });
    const prev = makeSnap({ is_noindex: false });
    const diff = diffBaselines(curr, prev);
    const change = diff.changes.find(c => c.field === 'is_noindex');
    assert.equal(change?.change_type, 'degraded');
  });

  it('classifies noindex removal as improved', () => {
    const curr = makeSnap({ is_noindex: false });
    const prev = makeSnap({ is_noindex: true });
    const diff = diffBaselines(curr, prev);
    const change = diff.changes.find(c => c.field === 'is_noindex');
    assert.equal(change?.change_type, 'improved');
  });

  it('classifies schema removal as degraded', () => {
    const curr = makeSnap({ has_schema: false });
    const prev = makeSnap({ has_schema: true });
    const diff = diffBaselines(curr, prev);
    const change = diff.changes.find(c => c.field === 'has_schema');
    assert.equal(change?.change_type, 'degraded');
  });

  it('classifies schema addition as improved', () => {
    const curr = makeSnap({ has_schema: true });
    const prev = makeSnap({ has_schema: false });
    const diff = diffBaselines(curr, prev);
    const change = diff.changes.find(c => c.field === 'has_schema');
    assert.equal(change?.change_type, 'improved');
  });

  it('classifies lighthouse drop as degraded', () => {
    const curr = makeSnap({ mobile_lighthouse: 60 });
    const prev = makeSnap({ mobile_lighthouse: 80 });
    const diff = diffBaselines(curr, prev);
    const change = diff.changes.find(c => c.field === 'mobile_lighthouse');
    assert.equal(change?.change_type, 'degraded');
  });

  it('classifies lighthouse gain as improved', () => {
    const curr = makeSnap({ mobile_lighthouse: 90 });
    const prev = makeSnap({ mobile_lighthouse: 70 });
    const diff = diffBaselines(curr, prev);
    const change = diff.changes.find(c => c.field === 'mobile_lighthouse');
    assert.equal(change?.change_type, 'improved');
  });

  it('net_change=worse when degradations > improvements', () => {
    const curr = makeSnap({ is_noindex: true, has_schema: false });
    const prev = makeSnap({ is_noindex: false, has_schema: true });
    const diff = diffBaselines(curr, prev);
    assert.equal(diff.net_change, 'worse');
  });

  it('net_change=better when improvements > degradations', () => {
    const curr = makeSnap({ is_noindex: false, has_schema: true, mobile_lighthouse: 90 });
    const prev = makeSnap({ is_noindex: true,  has_schema: false, mobile_lighthouse: 70 });
    const diff = diffBaselines(curr, prev);
    assert.equal(diff.net_change, 'better');
  });

  it('net_change=neutral when equal degradations and improvements', () => {
    const curr = makeSnap({ is_noindex: true, has_schema: true });
    const prev = makeSnap({ is_noindex: false, has_schema: false });
    const diff = diffBaselines(curr, prev);
    assert.equal(diff.net_change, 'neutral');
  });

  it('sets degradation_count correctly', () => {
    const curr = makeSnap({ is_noindex: true, has_schema: false });
    const prev = makeSnap({ is_noindex: false, has_schema: true });
    const diff = diffBaselines(curr, prev);
    assert.equal(diff.degradation_count, 2);
  });

  it('sets improvement_count correctly', () => {
    const curr = makeSnap({ mobile_lighthouse: 90 });
    const prev = makeSnap({ mobile_lighthouse: 70 });
    const diff = diffBaselines(curr, prev);
    assert.equal(diff.improvement_count, 1);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => diffBaselines(null as any, null as any));
  });
});

// ── calculateBaselineSeverity ─────────────────────────────────────────────────

describe('calculateBaselineSeverity', () => {
  function makeDiff(overrides: Partial<BaselineDiff> = {}): BaselineDiff {
    return {
      url:               'https://example.com/',
      site_id:           'site_1',
      snapshot_date:     '2026-03-10',
      previous_date:     '2026-03-03',
      changes:           [],
      degradation_count: 0,
      improvement_count: 0,
      net_change:        'neutral',
      severity:          'none',
      ...overrides,
    };
  }

  it('returns none for no changes', () => {
    const diff = makeDiff();
    assert.equal(calculateBaselineSeverity(diff), 'none');
  });

  it('returns critical for noindex added (degraded)', () => {
    const diff = makeDiff({
      changes: [{ field: 'is_noindex', previous_value: false, current_value: true, change_type: 'degraded' }],
      degradation_count: 1,
    });
    assert.equal(calculateBaselineSeverity(diff), 'critical');
  });

  it('returns critical for schema removed (degraded)', () => {
    const diff = makeDiff({
      changes: [{ field: 'has_schema', previous_value: true, current_value: false, change_type: 'degraded' }],
      degradation_count: 1,
    });
    assert.equal(calculateBaselineSeverity(diff), 'critical');
  });

  it('returns high for lighthouse drop > 10', () => {
    const diff = makeDiff({
      changes: [{ field: 'mobile_lighthouse', previous_value: 85, current_value: 70, change_type: 'degraded' }],
      degradation_count: 1,
    });
    assert.equal(calculateBaselineSeverity(diff), 'high');
  });

  it('returns high for canonical removed', () => {
    const diff = makeDiff({
      changes: [{ field: 'has_canonical', previous_value: true, current_value: false, change_type: 'degraded' }],
      degradation_count: 1,
    });
    assert.equal(calculateBaselineSeverity(diff), 'high');
  });

  it('returns medium for lighthouse drop 5-10', () => {
    const diff = makeDiff({
      changes: [{ field: 'mobile_lighthouse', previous_value: 80, current_value: 74, change_type: 'degraded' }],
      degradation_count: 1,
    });
    assert.equal(calculateBaselineSeverity(diff), 'medium');
  });

  it('returns medium for >= 3 total changes', () => {
    const diff = makeDiff({
      changes: [
        { field: 'title', previous_value: 'A', current_value: 'B', change_type: 'changed' },
        { field: 'word_count', previous_value: 100, current_value: 200, change_type: 'changed' },
        { field: 'h1_count', previous_value: 1, current_value: 2, change_type: 'changed' },
      ],
    });
    assert.equal(calculateBaselineSeverity(diff), 'medium');
  });

  it('returns low for 1-2 minor changes', () => {
    const diff = makeDiff({
      changes: [
        { field: 'title', previous_value: 'A', current_value: 'B', change_type: 'changed' },
      ],
    });
    assert.equal(calculateBaselineSeverity(diff), 'low');
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => calculateBaselineSeverity(null as any));
  });
});

// ── saveBaselineSnapshot ──────────────────────────────────────────────────────

describe('saveBaselineSnapshot', () => {
  it('calls saveFn with snapshot', async () => {
    let saved: any = null;
    const snap = makeSnap();
    await saveBaselineSnapshot(snap, { saveFn: async (s) => { saved = s; return true; } });
    assert.equal(saved?.url, snap.url);
  });

  it('returns true on success', async () => {
    const result = await saveBaselineSnapshot(makeSnap(), { saveFn: async () => true });
    assert.equal(result, true);
  });

  it('returns false when saveFn throws', async () => {
    const result = await saveBaselineSnapshot(makeSnap(), {
      saveFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(result, false);
  });

  it('returns false when snapshot has no site_id', async () => {
    const result = await saveBaselineSnapshot(makeSnap({ site_id: '' }), {
      saveFn: async () => true,
    });
    assert.equal(result, false);
  });

  it('returns false on null snapshot', async () => {
    const result = await saveBaselineSnapshot(null as any);
    assert.equal(result, false);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => saveBaselineSnapshot(null as any));
  });
});

// ── loadLatestBaseline ────────────────────────────────────────────────────────

describe('loadLatestBaseline', () => {
  it('returns snapshot from loadFn', async () => {
    const snap = makeSnap();
    const result = await loadLatestBaseline('site_1', 'https://example.com/', {
      loadFn: async () => snap,
    });
    assert.equal(result?.url, snap.url);
  });

  it('returns null when loadFn returns null', async () => {
    const result = await loadLatestBaseline('site_1', 'https://example.com/', {
      loadFn: async () => null,
    });
    assert.equal(result, null);
  });

  it('returns null when loadFn throws', async () => {
    const result = await loadLatestBaseline('site_1', 'https://example.com/', {
      loadFn: async () => { throw new Error('db fail'); },
    });
    assert.equal(result, null);
  });

  it('returns null for empty site_id', async () => {
    const result = await loadLatestBaseline('', 'https://example.com/');
    assert.equal(result, null);
  });

  it('returns null for empty url', async () => {
    const result = await loadLatestBaseline('site_1', '');
    assert.equal(result, null);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => loadLatestBaseline(null as any, null as any));
  });
});
