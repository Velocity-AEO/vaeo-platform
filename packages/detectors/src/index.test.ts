/**
 * packages/detectors/src/index.test.ts
 *
 * Unit tests for every detector in the VAEO detection engine.
 * All detectors are pure functions — no I/O, no network, no mocking needed.
 *
 * Tests:
 *   Technical error detectors (4)
 *   Metadata detectors (7)
 *   Image detectors (2)
 *   Schema detectors (3)
 *   runAllDetectors: sort, dedup, ActionLog (3)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detect404s,
  detect5xxs,
  detectRedirectChains,
  detectBrokenInternalLinks,
  detectMissingTitles,
  detectLongTitles,
  detectDuplicateTitles,
  detectMissingMetaDesc,
  detectLongMetaDesc,
  detectMissingH1,
  detectDuplicateH1,
  detectMissingAlt,
  detectMissingImageDimensions,
  detectMissingSchema,
  detectInvalidSchema,
  detectDuplicateSchema,
  runAllDetectors,
  type CrawlResultRow,
  type DetectorCtx,
} from './index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Captures process.stdout.write lines synchronously. */
function captureStdout(fn: () => void): string[] {
  const captured: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try { fn(); } finally { process.stdout.write = orig; }
  return captured;
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((line) => {
    const t = line.trim();
    if (!t.startsWith('{')) return [];
    try { return [JSON.parse(t) as Record<string, unknown>]; } catch { return []; }
  });
}

/** Baseline DetectorCtx for every test. */
const CTX: DetectorCtx = {
  run_id:    'run-d-001',
  tenant_id: 't-aaa',
  site_id:   's-bbb',
  cms:       'shopify',
};

/**
 * Returns a fully populated CrawlResultRow with sensible defaults.
 * Override only the fields relevant to the detector under test.
 */
function row(overrides: Partial<CrawlResultRow> = {}): CrawlResultRow {
  return {
    url:            'https://cococabanalife.com/products/sun-glow-bikini',
    status_code:    200,
    title:          'Sun Glow Bikini — Coco Cabana',
    meta_desc:      'Shop the Sun Glow Bikini in red, blue, and gold.',
    h1:             ['Sun Glow Bikini'],
    h2:             ['Product Details', 'Size Guide'],
    images:         [
      { src: '/cdn/bikini-red.jpg',  alt: 'Red Bikini',  width: '800', height: '600', size_kb: null },
      { src: '/cdn/bikini-blue.jpg', alt: 'Blue Bikini', width: '800', height: '600', size_kb: null },
    ],
    internal_links: [
      { href: '/collections/swimwear', anchor_text: 'Back', status_code: 200 },
    ],
    schema_blocks:  ['{"@context":"https://schema.org","@type":"Product","name":"Sun Glow Bikini"}'],
    canonical:      'https://cococabanalife.com/products/sun-glow-bikini',
    redirect_chain: [],
    load_time_ms:   320,
    ...overrides,
  };
}

// ── Technical error detectors ─────────────────────────────────────────────────

describe('detect404s', () => {
  it('emits ERR_404 for status_code 404', () => {
    const issues = detect404s([row({ status_code: 404 })], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'ERR_404');
    assert.equal(issues[0].risk_score, 8);
    assert.equal(issues[0].auto_fix,   false);
    assert.equal(issues[0].category,   'errors');
    assert.equal((issues[0].proposed_fix as Record<string, unknown>)['action'], 'map_redirect');
  });

  it('does NOT emit for 200 or other codes', () => {
    const issues = detect404s([row({ status_code: 200 }), row({ status_code: 301 })], CTX);
    assert.equal(issues.length, 0);
  });
});

describe('detect5xxs', () => {
  it('emits ERR_500 for status_code 500', () => {
    const issues = detect5xxs([row({ status_code: 500 })], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'ERR_500');
    assert.equal(issues[0].risk_score, 10);
    assert.equal(issues[0].auto_fix,   false);
    assert.equal((issues[0].proposed_fix as Record<string, unknown>)['action'], 'alert_operator');
  });

  it('emits for 503 as well', () => {
    const issues = detect5xxs([row({ status_code: 503 })], CTX);
    assert.equal(issues.length, 1);
    assert.equal((issues[0].issue_detail as Record<string, unknown>)['status_code'], 503);
  });

  it('does NOT emit for 200 or 404', () => {
    const issues = detect5xxs([row({ status_code: 200 }), row({ status_code: 404 })], CTX);
    assert.equal(issues.length, 0);
  });
});

describe('detectRedirectChains', () => {
  it('emits ERR_REDIRECT_CHAIN when redirect_chain.length > 2', () => {
    const issues = detectRedirectChains([
      row({ redirect_chain: ['/a', '/b', '/c'] }),  // length 3 — fires
    ], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'ERR_REDIRECT_CHAIN');
    assert.equal(issues[0].risk_score, 5);
    assert.equal(issues[0].auto_fix,   true);
    const fix = issues[0].proposed_fix as Record<string, unknown>;
    assert.equal(fix['action'],    'collapse_redirect');
    assert.equal(fix['final_url'], '/c');
  });

  it('does NOT emit when redirect_chain.length <= 2', () => {
    const issues = detectRedirectChains([
      row({ redirect_chain: [] }),        // 0
      row({ redirect_chain: ['/a'] }),    // 1
      row({ redirect_chain: ['/a', '/b'] }), // 2 — boundary
    ], CTX);
    assert.equal(issues.length, 0);
  });
});

describe('detectBrokenInternalLinks', () => {
  it('emits ERR_BROKEN_INTERNAL_LINK for internal link with status_code 404', () => {
    const issues = detectBrokenInternalLinks([
      row({
        internal_links: [
          { href: '/products/gone', anchor_text: 'Gone', status_code: 404 },
          { href: '/collections/ok', anchor_text: 'OK',  status_code: 200 },
        ],
      }),
    ], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'ERR_BROKEN_INTERNAL_LINK');
    assert.equal(issues[0].risk_score, 4);
    assert.equal((issues[0].proposed_fix as Record<string, unknown>)['broken_href'], '/products/gone');
  });

  it('emits one issue per broken link (multiple on same page)', () => {
    const issues = detectBrokenInternalLinks([
      row({
        internal_links: [
          { href: '/a', anchor_text: 'A', status_code: 404 },
          { href: '/b', anchor_text: 'B', status_code: 404 },
        ],
      }),
    ], CTX);
    assert.equal(issues.length, 2);
  });
});

// ── Metadata detectors ────────────────────────────────────────────────────────

describe('detectMissingTitles', () => {
  it('emits META_TITLE_MISSING when title is null', () => {
    const issues = detectMissingTitles([row({ title: null })], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'META_TITLE_MISSING');
    assert.equal(issues[0].risk_score, 3);
    assert.equal(issues[0].auto_fix,   true);
    assert.equal((issues[0].proposed_fix as Record<string, unknown>)['action'], 'generate_title');
  });

  it('emits META_TITLE_MISSING when title is empty string', () => {
    const issues = detectMissingTitles([row({ title: '' })], CTX);
    assert.equal(issues.length, 1);
  });

  it('emits META_TITLE_MISSING when title is whitespace only', () => {
    const issues = detectMissingTitles([row({ title: '   ' })], CTX);
    assert.equal(issues.length, 1);
  });

  it('does NOT emit when title is present', () => {
    const issues = detectMissingTitles([row({ title: 'Valid Title' })], CTX);
    assert.equal(issues.length, 0);
  });
});

describe('detectLongTitles', () => {
  it('emits META_TITLE_LONG when title.length > 60', () => {
    const long = 'A'.repeat(61);
    const issues = detectLongTitles([row({ title: long })], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'META_TITLE_LONG');
    const fix = issues[0].proposed_fix as Record<string, unknown>;
    assert.equal(fix['action'],         'truncate_title');
    assert.equal(fix['current_length'], 61);
    assert.equal(fix['truncate_at'],    60);
  });

  it('does NOT emit at exactly 60 chars (boundary)', () => {
    const issues = detectLongTitles([row({ title: 'A'.repeat(60) })], CTX);
    assert.equal(issues.length, 0);
  });
});

describe('detectDuplicateTitles', () => {
  it('emits META_TITLE_DUPLICATE for each URL sharing a title', () => {
    const shared = 'Shared Page Title';
    const issues = detectDuplicateTitles([
      row({ url: 'https://x.com/a', title: shared }),
      row({ url: 'https://x.com/b', title: shared }),
      row({ url: 'https://x.com/c', title: 'Unique Title' }),
    ], CTX);
    assert.equal(issues.length, 2, 'one issue per duplicate URL');
    assert.ok(issues.every((i) => i.issue_type === 'META_TITLE_DUPLICATE'));
    const urls = issues.map((i) => i.url).sort();
    assert.deepEqual(urls, ['https://x.com/a', 'https://x.com/b']);
    const fix = issues[0].proposed_fix as Record<string, unknown>;
    assert.ok(Array.isArray(fix['duplicate_urls']));
    assert.equal((fix['duplicate_urls'] as string[]).length, 2);
  });

  it('is case-insensitive for duplicate detection', () => {
    const issues = detectDuplicateTitles([
      row({ url: 'https://x.com/a', title: 'Hello World' }),
      row({ url: 'https://x.com/b', title: 'hello world' }),
    ], CTX);
    assert.equal(issues.length, 2);
  });

  it('does NOT emit when all titles are unique', () => {
    const issues = detectDuplicateTitles([
      row({ url: 'https://x.com/a', title: 'Title A' }),
      row({ url: 'https://x.com/b', title: 'Title B' }),
    ], CTX);
    assert.equal(issues.length, 0);
  });
});

describe('detectMissingMetaDesc', () => {
  it('emits META_DESC_MISSING when meta_desc is null', () => {
    const issues = detectMissingMetaDesc([row({ meta_desc: null })], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'META_DESC_MISSING');
  });

  it('emits META_DESC_MISSING when meta_desc is empty string', () => {
    const issues = detectMissingMetaDesc([row({ meta_desc: '' })], CTX);
    assert.equal(issues.length, 1);
  });
});

describe('detectLongMetaDesc', () => {
  it('emits META_DESC_LONG when meta_desc.length > 155', () => {
    const issues = detectLongMetaDesc([row({ meta_desc: 'A'.repeat(156) })], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'META_DESC_LONG');
    const fix = issues[0].proposed_fix as Record<string, unknown>;
    assert.equal(fix['truncate_at'], 155);
  });

  it('does NOT emit at exactly 155 chars (boundary)', () => {
    const issues = detectLongMetaDesc([row({ meta_desc: 'A'.repeat(155) })], CTX);
    assert.equal(issues.length, 0);
  });
});

describe('detectMissingH1', () => {
  it('emits H1_MISSING when h1 array is empty', () => {
    const issues = detectMissingH1([row({ h1: [] })], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'H1_MISSING');
    assert.equal(issues[0].risk_score, 4);
    assert.equal((issues[0].proposed_fix as Record<string, unknown>)['action'], 'promote_strongest_heading');
  });

  it('emits H1_MISSING when h1 is null', () => {
    const issues = detectMissingH1([row({ h1: null })], CTX);
    assert.equal(issues.length, 1);
  });

  it('does NOT emit when h1 has one entry', () => {
    const issues = detectMissingH1([row({ h1: ['Main Heading'] })], CTX);
    assert.equal(issues.length, 0);
  });
});

describe('detectDuplicateH1', () => {
  it('emits H1_DUPLICATE when h1.length > 1', () => {
    const issues = detectDuplicateH1([row({ h1: ['First', 'Second'] })], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'H1_DUPLICATE');
    assert.equal(issues[0].risk_score, 5);
    const fix = issues[0].proposed_fix as Record<string, unknown>;
    assert.equal(fix['action'], 'demote_extras_to_h2');
    assert.equal(fix['count'],  2);
  });

  it('does NOT emit when h1 has exactly one entry', () => {
    const issues = detectDuplicateH1([row({ h1: ['Only Heading'] })], CTX);
    assert.equal(issues.length, 0);
  });
});

// ── Image detectors ───────────────────────────────────────────────────────────

describe('detectMissingAlt', () => {
  it('emits IMG_ALT_MISSING for image with empty alt', () => {
    const issues = detectMissingAlt([
      row({
        images: [
          { src: '/img/hero.jpg', alt: '', width: '1200', height: '600', size_kb: null },
        ],
      }),
    ], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'IMG_ALT_MISSING');
    assert.equal(issues[0].risk_score, 2);
    assert.equal((issues[0].proposed_fix as Record<string, unknown>)['image_src'], '/img/hero.jpg');
  });

  it('emits one issue per image with missing alt (multiple on same page)', () => {
    const issues = detectMissingAlt([
      row({
        images: [
          { src: '/a.jpg', alt: '',          width: null, height: null, size_kb: null },
          { src: '/b.jpg', alt: 'Present',   width: null, height: null, size_kb: null },
          { src: '/c.jpg', alt: '',          width: null, height: null, size_kb: null },
        ],
      }),
    ], CTX);
    assert.equal(issues.length, 2, 'only images with empty alt fire');
    const srcs = issues.map((i) => (i.proposed_fix as Record<string, unknown>)['image_src']).sort();
    assert.deepEqual(srcs, ['/a.jpg', '/c.jpg']);
  });

  it('does NOT emit when all images have alt text', () => {
    const issues = detectMissingAlt([row()], CTX);
    assert.equal(issues.length, 0);
  });
});

describe('detectMissingImageDimensions', () => {
  it('emits IMG_DIMENSIONS_MISSING for image with null width', () => {
    const issues = detectMissingImageDimensions([
      row({
        images: [
          { src: '/img/hero.jpg', alt: 'Hero', width: null, height: '600', size_kb: null },
        ],
      }),
    ], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'IMG_DIMENSIONS_MISSING');
  });

  it('emits for null height as well', () => {
    const issues = detectMissingImageDimensions([
      row({
        images: [
          { src: '/img/hero.jpg', alt: 'Hero', width: '1200', height: null, size_kb: null },
        ],
      }),
    ], CTX);
    assert.equal(issues.length, 1);
  });
});

// ── Schema detectors ──────────────────────────────────────────────────────────

describe('detectMissingSchema', () => {
  it('emits SCHEMA_MISSING when schema_blocks is empty array', () => {
    const issues = detectMissingSchema([row({ schema_blocks: [] })], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'SCHEMA_MISSING');
    assert.equal(issues[0].risk_score, 3);
    assert.equal((issues[0].proposed_fix as Record<string, unknown>)['action'], 'generate_from_template');
  });

  it('emits SCHEMA_MISSING when schema_blocks is null', () => {
    const issues = detectMissingSchema([row({ schema_blocks: null })], CTX);
    assert.equal(issues.length, 1);
  });

  it('does NOT emit when schema_blocks has content', () => {
    const issues = detectMissingSchema([row()], CTX); // default has 1 schema block
    assert.equal(issues.length, 0);
  });
});

describe('detectInvalidSchema', () => {
  it('emits SCHEMA_INVALID_JSON when a block fails JSON.parse', () => {
    const issues = detectInvalidSchema([
      row({ schema_blocks: ['{ invalid json here !!!'] }),
    ], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'SCHEMA_INVALID_JSON');
    assert.equal(issues[0].risk_score, 4);
    assert.equal((issues[0].proposed_fix as Record<string, unknown>)['action'], 'fix_syntax_errors');
  });

  it('does NOT emit for valid JSON', () => {
    const issues = detectInvalidSchema([
      row({ schema_blocks: ['{"@type":"Product","name":"Bikini"}'] }),
    ], CTX);
    assert.equal(issues.length, 0);
  });

  it('emits one issue per invalid block', () => {
    const issues = detectInvalidSchema([
      row({ schema_blocks: ['{ bad1', '{ bad2', '{"@type":"valid"}'] }),
    ], CTX);
    assert.equal(issues.length, 2);
  });
});

describe('detectDuplicateSchema', () => {
  it('emits SCHEMA_DUPLICATE when 2 blocks share the same @type', () => {
    const issues = detectDuplicateSchema([
      row({
        schema_blocks: [
          '{"@context":"https://schema.org","@type":"Product","name":"A"}',
          '{"@context":"https://schema.org","@type":"Product","name":"B"}',
        ],
      }),
    ], CTX);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].issue_type, 'SCHEMA_DUPLICATE');
    assert.equal(issues[0].risk_score, 4);
    assert.equal(
      (issues[0].issue_detail as Record<string, unknown>)['duplicate_type'],
      'Product',
    );
    assert.equal(
      (issues[0].proposed_fix as Record<string, unknown>)['action'],
      'merge_into_single_block',
    );
  });

  it('does NOT emit when @types are all different', () => {
    const issues = detectDuplicateSchema([
      row({
        schema_blocks: [
          '{"@type":"Product"}',
          '{"@type":"BreadcrumbList"}',
        ],
      }),
    ], CTX);
    assert.equal(issues.length, 0);
  });
});

// ── runAllDetectors ───────────────────────────────────────────────────────────

describe('runAllDetectors', () => {
  it('returns issues sorted by risk_score descending', () => {
    // 5xx = risk 10, 404 = risk 8, H1_DUPLICATE = risk 5, META_TITLE_MISSING = risk 3
    const rows: CrawlResultRow[] = [
      row({ url: 'https://x.com/a', status_code: 500, title: null, h1: ['x', 'y'] }),
      row({ url: 'https://x.com/b', status_code: 404 }),
    ];
    const issues = runAllDetectors(rows, CTX);
    const scores = issues.map((i) => i.risk_score);
    for (let i = 1; i < scores.length; i++) {
      assert.ok(
        scores[i] <= scores[i - 1],
        `expected descending order at index ${i}: ${scores[i - 1]} >= ${scores[i]}`,
      );
    }
    // Verify the highest-risk issue is first
    assert.equal(scores[0], 10, '5xx (risk 10) must be first');
  });

  it('deduplicates identical issues (same url + issue_type + proposed_fix)', () => {
    // Two invalid schema blocks on the same page → same proposed_fix → should collapse to 1
    const rows: CrawlResultRow[] = [
      row({
        url:           'https://x.com/p',
        schema_blocks: ['{ bad1 }', '{ bad2 }'],  // two invalid blocks
      }),
    ];
    const issues = runAllDetectors(rows, CTX);
    const invalidJsonIssues = issues.filter((i) => i.issue_type === 'SCHEMA_INVALID_JSON');
    assert.equal(
      invalidJsonIssues.length,
      1,
      'two invalid schema blocks on the same page must collapse to one issue',
    );
  });

  it('stamps run_id, tenant_id, site_id, cms on every issue', () => {
    const rows = [row({ status_code: 404 })];
    const issues = runAllDetectors(rows, CTX);
    assert.ok(issues.length > 0);
    for (const issue of issues) {
      assert.equal(issue.run_id,    CTX.run_id);
      assert.equal(issue.tenant_id, CTX.tenant_id);
      assert.equal(issue.site_id,   CTX.site_id);
      assert.equal(issue.cms,       CTX.cms);
    }
  });

  it('writes detectors:start ActionLog entry with url_count', () => {
    const rows = [row(), row({ url: 'https://x.com/b' })];
    const lines = captureStdout(() => { runAllDetectors(rows, CTX); });
    const entries = parseLines(lines);
    const start = entries.find((e) => e['stage'] === 'detectors:start');
    assert.ok(start, 'detectors:start must be present');
    assert.equal(start['status'], 'pending');
    assert.equal((start['metadata'] as Record<string, unknown>)['url_count'], 2);
  });

  it('writes detectors:complete ActionLog entry with total_issues and by_category', () => {
    const rows = [
      row({ url: 'https://x.com/a', status_code: 404 }),         // errors
      row({ url: 'https://x.com/b', title: null }),               // metadata
      row({ url: 'https://x.com/c', schema_blocks: [] }),         // schema
    ];
    const lines = captureStdout(() => { runAllDetectors(rows, CTX); });
    const entries = parseLines(lines);
    const complete = entries.find((e) => e['stage'] === 'detectors:complete');
    assert.ok(complete, 'detectors:complete must be present');
    assert.equal(complete['status'], 'ok');
    const meta = complete['metadata'] as Record<string, unknown>;
    assert.ok((meta['total_issues'] as number) >= 3);
    const byCat = meta['by_category'] as Record<string, number>;
    assert.ok(byCat['errors']   >= 1);
    assert.ok(byCat['metadata'] >= 1);
    assert.ok(byCat['schema']   >= 1);
  });

  it('returns empty array for empty input', () => {
    const issues = runAllDetectors([], CTX);
    assert.equal(issues.length, 0);
  });
});
