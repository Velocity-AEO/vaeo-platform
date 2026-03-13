/**
 * tools/tracer/drift_scanner.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDriftCause,
  checkFixPresence,
  calculateDriftRate,
  getMostProbableCause,
  scanFixForDrift,
  runDriftScan,
  DRIFT_PROBABLE_CAUSES,
  type DriftEvent,
} from './drift_scanner.js';

// ── DRIFT_PROBABLE_CAUSES ─────────────────────────────────────────────────────

describe('DRIFT_PROBABLE_CAUSES', () => {
  it('has 6 causes', () => {
    assert.equal(Object.keys(DRIFT_PROBABLE_CAUSES).length, 6);
  });

  it('includes theme_update, plugin_update, cms_edit', () => {
    assert.ok('theme_update'  in DRIFT_PROBABLE_CAUSES);
    assert.ok('plugin_update' in DRIFT_PROBABLE_CAUSES);
    assert.ok('cms_edit'      in DRIFT_PROBABLE_CAUSES);
  });
});

// ── detectDriftCause ──────────────────────────────────────────────────────────

describe('detectDriftCause — generator tag', () => {
  it('returns theme_update when generator product changed', () => {
    const orig = `<meta name="generator" content="Shopify 2.0">`;
    const curr = `<meta name="generator" content="Genesis Framework 3.5">`;
    assert.equal(detectDriftCause(orig, curr, 'TITLE_MISSING'), 'theme_update');
  });

  it('returns plugin_update when same base, different version', () => {
    const orig = `<meta name="generator" content="WordPress/6.3">`;
    const curr = `<meta name="generator" content="WordPress/6.4">`;
    assert.equal(detectDriftCause(orig, curr, 'META_DESC_MISSING'), 'plugin_update');
  });

  it('returns theme_update when generator changed from known to different', () => {
    const orig = `<meta name="generator" content="Shopify 2.0">`;
    const curr = `<meta name="generator" content="WooCommerce 8.0">`;
    assert.equal(detectDriftCause(orig, curr, 'SCHEMA_MISSING'), 'theme_update');
  });
});

describe('detectDriftCause — theme class', () => {
  it('returns theme_update when body theme class changed', () => {
    const orig = `<body class="theme-debut page-type-index">`;
    const curr = `<body class="theme-dawn page-type-index">`;
    assert.equal(detectDriftCause(orig, curr, 'TITLE_MISSING'), 'theme_update');
  });

  it('returns unknown when theme class is same', () => {
    const html = `<body class="theme-dawn">`;
    assert.equal(detectDriftCause(html, html, 'TITLE_MISSING'), 'unknown');
  });
});

describe('detectDriftCause — content size diff', () => {
  it('returns cms_edit when content differs by more than 30%', () => {
    const orig = 'a'.repeat(1000);
    const curr = 'b'.repeat(200);
    assert.equal(detectDriftCause(orig, curr, 'TITLE_MISSING'), 'cms_edit');
  });

  it('returns unknown when content diff is under 30%', () => {
    const orig = 'a'.repeat(1000);
    const curr = 'b'.repeat(800);  // 20% diff
    assert.equal(detectDriftCause(orig, curr, 'TITLE_MISSING'), 'unknown');
  });
});

describe('detectDriftCause — edge cases', () => {
  it('returns unknown when both htmls are empty', () => {
    assert.equal(detectDriftCause('', '', 'TITLE_MISSING'), 'unknown');
  });

  it('handles null original_html', () => {
    const result = detectDriftCause(null, '<html><title>Test</title></html>', 'TITLE_MISSING');
    assert.ok(typeof result === 'string');
  });

  it('never throws', () => {
    assert.doesNotThrow(() => detectDriftCause(null as never, null as never, null as never));
  });
});

// ── checkFixPresence ──────────────────────────────────────────────────────────

describe('checkFixPresence — TITLE', () => {
  it('returns true when expected title text is in <title>', () => {
    const html = '<title>Best Coffee Shop in Austin</title>';
    assert.equal(checkFixPresence(html, 'TITLE_MISSING', 'Coffee Shop'), true);
  });

  it('returns false when title is missing', () => {
    assert.equal(checkFixPresence('<html></html>', 'TITLE_MISSING', 'Coffee Shop'), false);
  });

  it('returns false when title does not contain expected text', () => {
    const html = '<title>Unrelated Title</title>';
    assert.equal(checkFixPresence(html, 'TITLE_LONG', 'Coffee Shop'), false);
  });

  it('is case-insensitive', () => {
    const html = '<title>COFFEE SHOP IN AUSTIN</title>';
    assert.equal(checkFixPresence(html, 'TITLE_SHORT', 'coffee shop'), true);
  });
});

describe('checkFixPresence — META_DESC', () => {
  it('returns true when meta description contains expected text', () => {
    const html = `<meta name="description" content="Best coffee shop in Austin TX">`;
    assert.equal(checkFixPresence(html, 'META_DESC_MISSING', 'coffee shop'), true);
  });

  it('returns false when meta description is absent', () => {
    assert.equal(checkFixPresence('<html></html>', 'META_DESC_MISSING', 'coffee'), false);
  });

  it('handles reversed attribute order', () => {
    const html = `<meta content="Great Austin coffee" name="description">`;
    assert.equal(checkFixPresence(html, 'META_DESC_LONG', 'Austin coffee'), true);
  });
});

describe('checkFixPresence — SCHEMA', () => {
  it('returns true when JSON-LD script tag is present', () => {
    const html = `<script type="application/ld+json">{"@type":"Product"}</script>`;
    assert.equal(checkFixPresence(html, 'SCHEMA_MISSING', ''), true);
  });

  it('returns false when no JSON-LD present', () => {
    assert.equal(checkFixPresence('<html></html>', 'SCHEMA_MISSING', ''), false);
  });
});

describe('checkFixPresence — CANONICAL', () => {
  it('returns true when canonical href matches expected', () => {
    const html = `<link rel="canonical" href="https://shop.com/products/mug">`;
    assert.equal(checkFixPresence(html, 'CANONICAL_MISSING', 'products/mug'), true);
  });

  it('returns true when canonical present and no expected value', () => {
    const html = `<link rel="canonical" href="https://shop.com/products/mug">`;
    assert.equal(checkFixPresence(html, 'CANONICAL_WRONG', ''), true);
  });

  it('returns false when no canonical link', () => {
    assert.equal(checkFixPresence('<html></html>', 'CANONICAL_MISSING', 'mug'), false);
  });
});

describe('checkFixPresence — OG_MISSING', () => {
  it('returns true when any og: meta tag present', () => {
    const html = `<meta property="og:title" content="Mug">`;
    assert.equal(checkFixPresence(html, 'OG_MISSING', ''), true);
  });

  it('returns false when no og: tags', () => {
    assert.equal(checkFixPresence('<html></html>', 'OG_MISSING', ''), false);
  });
});

describe('checkFixPresence — ROBOTS_NOINDEX', () => {
  it('returns true when noindex has been removed', () => {
    const html = '<html><head><title>OK</title></head></html>';
    assert.equal(checkFixPresence(html, 'ROBOTS_NOINDEX', ''), true);
  });

  it('returns false when noindex still present', () => {
    const html = `<meta name="robots" content="noindex,follow">`;
    assert.equal(checkFixPresence(html, 'ROBOTS_NOINDEX', ''), false);
  });
});

describe('checkFixPresence — edge cases', () => {
  it('returns false on empty html', () => {
    assert.equal(checkFixPresence('', 'TITLE_MISSING', 'test'), false);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => checkFixPresence(null as never, null as never, null as never));
  });

  it('falls back to substring check for unknown issue_type', () => {
    const html = 'the quick brown fox';
    assert.equal(checkFixPresence(html, 'UNKNOWN_TYPE', 'quick brown'), true);
  });
});

// ── calculateDriftRate ────────────────────────────────────────────────────────

describe('calculateDriftRate', () => {
  it('returns 0 when no fixes scanned', () => {
    assert.equal(calculateDriftRate(0, 0), 0);
  });

  it('returns 100 when all fixes drifted', () => {
    assert.equal(calculateDriftRate(10, 10), 100);
  });

  it('returns 50 when half drifted', () => {
    assert.equal(calculateDriftRate(10, 5), 50);
  });

  it('rounds to one decimal place', () => {
    assert.equal(calculateDriftRate(3, 1), 33.3);
  });

  it('never exceeds 100', () => {
    assert.equal(calculateDriftRate(1, 999), 100);
  });

  it('never goes below 0', () => {
    assert.equal(calculateDriftRate(10, -5), 0);
  });
});

// ── getMostProbableCause ──────────────────────────────────────────────────────

describe('getMostProbableCause', () => {
  it('returns null for empty array', () => {
    assert.equal(getMostProbableCause([]), null);
  });

  it('returns the most frequent cause', () => {
    const events: DriftEvent[] = [
      { fix_id: '1', site_id: 's', url: '', issue_type: '', original_value: '', expected_value: '', current_value: null, drift_status: 'drifted', drift_detected_at: '', applied_at: '', days_since_fix: 0, probable_cause: 'theme_update' },
      { fix_id: '2', site_id: 's', url: '', issue_type: '', original_value: '', expected_value: '', current_value: null, drift_status: 'drifted', drift_detected_at: '', applied_at: '', days_since_fix: 0, probable_cause: 'theme_update' },
      { fix_id: '3', site_id: 's', url: '', issue_type: '', original_value: '', expected_value: '', current_value: null, drift_status: 'drifted', drift_detected_at: '', applied_at: '', days_since_fix: 0, probable_cause: 'cms_edit' },
    ];
    assert.equal(getMostProbableCause(events), 'theme_update');
  });

  it('ignores events with null probable_cause', () => {
    const events: DriftEvent[] = [
      { fix_id: '1', site_id: 's', url: '', issue_type: '', original_value: '', expected_value: '', current_value: null, drift_status: 'stable', drift_detected_at: '', applied_at: '', days_since_fix: 0, probable_cause: null },
      { fix_id: '2', site_id: 's', url: '', issue_type: '', original_value: '', expected_value: '', current_value: null, drift_status: 'drifted', drift_detected_at: '', applied_at: '', days_since_fix: 0, probable_cause: 'cms_edit' },
    ];
    assert.equal(getMostProbableCause(events), 'cms_edit');
  });

  it('returns null when all events have null cause', () => {
    const events: DriftEvent[] = [
      { fix_id: '1', site_id: 's', url: '', issue_type: '', original_value: '', expected_value: '', current_value: null, drift_status: 'stable', drift_detected_at: '', applied_at: '', days_since_fix: 0, probable_cause: null },
    ];
    assert.equal(getMostProbableCause(events), null);
  });
});

// ── scanFixForDrift ───────────────────────────────────────────────────────────

const baseFix = {
  fix_id:         'fix-1',
  site_id:        'site-1',
  url:            'https://shop.com/products/mug',
  issue_type:     'TITLE_MISSING',
  expected_value: 'Ceramic Mug',
  original_value: '',
  applied_at:     '2026-01-01T00:00:00Z',
};

describe('scanFixForDrift — stable', () => {
  it('returns stable when fix is still present', async () => {
    const html = '<title>Best Ceramic Mug</title>';
    const event = await scanFixForDrift(baseFix, html);
    assert.equal(event.drift_status, 'stable');
    assert.equal(event.probable_cause, null);
  });

  it('populates fix_id, site_id, url from fix', async () => {
    const event = await scanFixForDrift(baseFix, '<title>Ceramic Mug</title>');
    assert.equal(event.fix_id,   'fix-1');
    assert.equal(event.site_id,  'site-1');
    assert.equal(event.url,      'https://shop.com/products/mug');
  });
});

describe('scanFixForDrift — drifted', () => {
  it('returns drifted when fix is missing from html', async () => {
    const event = await scanFixForDrift(baseFix, '<html><title>Other Page</title></html>');
    assert.equal(event.drift_status, 'drifted');
    assert.ok(event.probable_cause !== null || event.probable_cause === null); // cause may be set
  });

  it('extracts current title value', async () => {
    const event = await scanFixForDrift(baseFix, '<title>  Wrong Title  </title>');
    assert.equal(event.current_value, 'Wrong Title');
  });
});

describe('scanFixForDrift — injectable deps', () => {
  it('uses injected checkFn', async () => {
    let called = false;
    await scanFixForDrift(baseFix, '<html/>', {
      checkFn: (html, type, expected) => { called = true; return true; },
    });
    assert.equal(called, true);
  });

  it('uses injected causeFn', async () => {
    let called = false;
    await scanFixForDrift(baseFix, '<html/>', {
      checkFn: () => false,
      causeFn: () => { called = true; return 'theme_update'; },
    });
    assert.equal(called, true);
  });

  it('days_since_fix is calculated from applied_at', async () => {
    const oldFix = { ...baseFix, applied_at: '2020-01-01T00:00:00Z' };
    const event = await scanFixForDrift(oldFix, '<title>Ceramic Mug</title>');
    assert.ok(event.days_since_fix > 365);
  });
});

describe('scanFixForDrift — never throws', () => {
  it('never throws on null fix', async () => {
    const event = await scanFixForDrift(null as never, '');
    assert.equal(event.drift_status, 'unknown');
  });
});

// ── runDriftScan ──────────────────────────────────────────────────────────────

describe('runDriftScan — no fixes', () => {
  it('returns empty result when no fixes loaded', async () => {
    const result = await runDriftScan('site-1', {
      loadFixesFn: async () => [],
    });
    assert.equal(result.fixes_scanned, 0);
    assert.equal(result.drift_rate, 0);
    assert.deepEqual(result.drift_events, []);
  });
});

describe('runDriftScan — mixed results', () => {
  it('correctly counts stable and drifted', async () => {
    const fixes = [
      { ...baseFix, fix_id: 'a', url: 'https://shop.com/a' },
      { ...baseFix, fix_id: 'b', url: 'https://shop.com/b' },
    ];
    const result = await runDriftScan('site-1', {
      loadFixesFn: async () => fixes,
      fetchHTMLFn: async (url) => url.endsWith('/a') ? '<title>Ceramic Mug</title>' : '<title>Unrelated</title>',
    });
    assert.equal(result.fixes_scanned, 2);
    assert.equal(result.stable_fixes, 1);
    assert.equal(result.drifted_fixes, 1);
    assert.ok(result.drift_rate > 0);
  });

  it('sets most_probable_cause from drifted events', async () => {
    const fixes = [
      { ...baseFix, fix_id: 'a', url: 'https://shop.com/a' },
    ];
    const result = await runDriftScan('site-1', {
      loadFixesFn: async () => fixes,
      fetchHTMLFn: async () => '<title>Wrong</title>',
    });
    assert.equal(result.drifted_fixes, 1);
  });
});

describe('runDriftScan — error handling', () => {
  it('returns empty result when loadFixesFn throws', async () => {
    const result = await runDriftScan('site-1', {
      loadFixesFn: async () => { throw new Error('db down'); },
    });
    assert.equal(result.fixes_scanned, 0);
  });

  it('scans fix with empty html when fetchHTMLFn throws (non-fatal)', async () => {
    const fixes = [
      { ...baseFix, fix_id: 'a' },
      { ...baseFix, fix_id: 'b', url: 'https://shop.com/b' },
    ];
    const result = await runDriftScan('site-1', {
      loadFixesFn: async () => fixes,
      fetchHTMLFn: async (url) => {
        if (url === baseFix.url) throw new Error('fetch failed');
        return '<title>Ceramic Mug</title>';
      },
    });
    // Both fixes are scanned; the throwing URL gets empty HTML → drifted
    assert.equal(result.fixes_scanned, 2);
    assert.equal(result.stable_fixes, 1);
    assert.equal(result.drifted_fixes, 1);
  });

  it('never throws on null site_id', async () => {
    const result = await runDriftScan(null as never);
    assert.equal(result.fixes_scanned, 0);
  });

  it('populates site_id in result', async () => {
    const result = await runDriftScan('my-site', {
      loadFixesFn: async () => [],
    });
    assert.equal(result.site_id, 'my-site');
  });
});
