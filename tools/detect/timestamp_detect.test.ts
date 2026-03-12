/**
 * tools/detect/timestamp_detect.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectTimestampSignals } from './timestamp_detect.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonLd(obj: Record<string, unknown>): string {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

function ogMeta(value: string): string {
  return `<meta property="article:modified_time" content="${value}">`;
}

// ── Basic detection ───────────────────────────────────────────────────────────

describe('detectTimestampSignals — no signals', () => {
  it('returns all false for empty HTML', () => {
    const r = detectTimestampSignals('');
    assert.equal(r.has_jsonld_date_modified,  false);
    assert.equal(r.has_og_modified_time,      false);
    assert.equal(r.has_jsonld_date_published,  false);
    assert.equal(r.needs_injection,           true);
  });

  it('returns all false for plain text', () => {
    const r = detectTimestampSignals('<html><body>Hello</body></html>');
    assert.equal(r.has_jsonld_date_modified, false);
    assert.equal(r.needs_injection, true);
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => detectTimestampSignals(null as any));
  });

  it('never throws on undefined input', () => {
    assert.doesNotThrow(() => detectTimestampSignals(undefined as any));
  });

  it('returns needs_injection=true when both signals missing', () => {
    const r = detectTimestampSignals('<html><head></head></html>');
    assert.equal(r.needs_injection, true);
  });
});

// ── JSON-LD detection ─────────────────────────────────────────────────────────

describe('detectTimestampSignals — JSON-LD', () => {
  it('detects dateModified in Article JSON-LD', () => {
    const html = `<html><head>${jsonLd({ '@type': 'Article', dateModified: '2025-01-15T12:00:00Z' })}</head></html>`;
    const r = detectTimestampSignals(html);
    assert.equal(r.has_jsonld_date_modified, true);
    assert.equal(r.current_date_modified, '2025-01-15T12:00:00Z');
  });

  it('detects dateModified in WebPage JSON-LD', () => {
    const html = jsonLd({ '@type': 'WebPage', dateModified: '2024-06-01T00:00:00Z' });
    const r = detectTimestampSignals(html);
    assert.equal(r.has_jsonld_date_modified, true);
    assert.equal(r.current_date_modified, '2024-06-01T00:00:00Z');
  });

  it('detects datePublished separately', () => {
    const html = jsonLd({ '@type': 'Article', datePublished: '2024-01-01T00:00:00Z' });
    const r = detectTimestampSignals(html);
    assert.equal(r.has_jsonld_date_published, true);
    assert.equal(r.has_jsonld_date_modified,  false);
  });

  it('detects both dateModified and datePublished', () => {
    const html = jsonLd({
      '@type': 'Article',
      datePublished: '2024-01-01T00:00:00Z',
      dateModified:  '2024-06-01T00:00:00Z',
    });
    const r = detectTimestampSignals(html);
    assert.equal(r.has_jsonld_date_modified,  true);
    assert.equal(r.has_jsonld_date_published, true);
  });

  it('handles malformed JSON-LD gracefully', () => {
    const html = '<script type="application/ld+json">{ broken json </script>';
    assert.doesNotThrow(() => detectTimestampSignals(html));
    const r = detectTimestampSignals(html);
    assert.equal(r.has_jsonld_date_modified, false);
  });

  it('handles JSON-LD array with @graph', () => {
    const html = `<script type="application/ld+json">[{"@type":"WebSite"},{"@type":"Article","dateModified":"2025-03-01T00:00:00Z"}]</script>`;
    const r = detectTimestampSignals(html);
    assert.equal(r.has_jsonld_date_modified, true);
    assert.equal(r.current_date_modified, '2025-03-01T00:00:00Z');
  });

  it('does not detect dateModified in non-ld+json script', () => {
    const html = '<script type="text/javascript">var dateModified = "2025-01-01";</script>';
    const r = detectTimestampSignals(html);
    assert.equal(r.has_jsonld_date_modified, false);
  });
});

// ── OG meta detection ─────────────────────────────────────────────────────────

describe('detectTimestampSignals — OG meta', () => {
  it('detects article:modified_time OG tag', () => {
    const html = `<html><head>${ogMeta('2025-02-20T10:00:00+00:00')}</head></html>`;
    const r = detectTimestampSignals(html);
    assert.equal(r.has_og_modified_time, true);
    assert.equal(r.current_og_modified_time, '2025-02-20T10:00:00+00:00');
  });

  it('does not detect other OG meta tags as modified_time', () => {
    const html = '<meta property="og:title" content="Test">';
    const r = detectTimestampSignals(html);
    assert.equal(r.has_og_modified_time, false);
  });

  it('extracts content value from OG tag', () => {
    const val = '2025-11-01T08:30:00Z';
    const html = `<meta property="article:modified_time" content="${val}">`;
    const r = detectTimestampSignals(html);
    assert.equal(r.current_og_modified_time, val);
  });
});

// ── needs_injection logic ─────────────────────────────────────────────────────

describe('needs_injection', () => {
  it('false when both JSON-LD and OG signals present', () => {
    const html = [
      jsonLd({ '@type': 'Article', dateModified: '2025-01-01T00:00:00Z' }),
      ogMeta('2025-01-01T00:00:00Z'),
    ].join('\n');
    const r = detectTimestampSignals(html);
    assert.equal(r.needs_injection, false);
  });

  it('true when only JSON-LD signal present', () => {
    const html = jsonLd({ '@type': 'Article', dateModified: '2025-01-01T00:00:00Z' });
    const r = detectTimestampSignals(html);
    assert.equal(r.needs_injection, true); // OG still missing
  });

  it('true when only OG signal present', () => {
    const html = ogMeta('2025-01-01T00:00:00Z');
    const r = detectTimestampSignals(html);
    assert.equal(r.needs_injection, true); // JSON-LD still missing
  });
});
