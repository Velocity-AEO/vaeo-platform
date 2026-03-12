/**
 * tools/apply/localbusiness_apply.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyLocalBusinessSchema } from './localbusiness_apply.ts';

const SCHEMA: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type':    'LocalBusiness',
  name:       'My Shop',
  telephone:  '555-000-1111',
};

const EXISTING_LB_SCHEMA = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness","name":"Old Name","telephone":"555-OLD-NMBR"}
</script>`;

function page(head: string, body = '<p>Content</p>'): string {
  return `<html><head>${head}</head><body>${body}</body></html>`;
}

describe('applyLocalBusinessSchema', () => {
  it('injects new schema before </head> when no existing schema', () => {
    const { html, applied, method } = applyLocalBusinessSchema(
      page('<title>Test</title>'),
      SCHEMA,
    );
    assert.equal(applied, true);
    assert.equal(method, 'injected_new');
    assert.ok(html.includes('application/ld+json'));
    assert.ok(html.includes('"LocalBusiness"'));
    assert.ok(html.includes('</head>'));
  });

  it('places injected script tag before </head>', () => {
    const { html } = applyLocalBusinessSchema(page('<title>T</title>'), SCHEMA);
    const scriptPos = html.indexOf('<script type="application/ld+json">');
    const headPos   = html.indexOf('</head>');
    assert.ok(scriptPos < headPos, 'script should appear before </head>');
  });

  it('replaces existing LocalBusiness schema', () => {
    const { html, applied, method } = applyLocalBusinessSchema(
      page(EXISTING_LB_SCHEMA),
      SCHEMA,
    );
    assert.equal(applied, true);
    assert.equal(method, 'replaced_existing');
    assert.ok(html.includes('"My Shop"'));
    assert.ok(!html.includes('"Old Name"'));
  });

  it('replaces existing Restaurant subtype schema', () => {
    const restaurantSchema = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","name":"Old Place"}</script>`;
    const { applied, method, html } = applyLocalBusinessSchema(
      page(restaurantSchema),
      { ...SCHEMA, '@type': 'Restaurant' },
    );
    assert.equal(applied, true);
    assert.equal(method, 'replaced_existing');
    assert.ok(!html.includes('"Old Place"'));
  });

  it('falls back to inject before </body> when no </head>', () => {
    const noHead = '<html><body><p>Content</p></body></html>';
    const { html, applied, method } = applyLocalBusinessSchema(noHead, SCHEMA);
    assert.equal(applied, true);
    assert.equal(method, 'injected_new');
    assert.ok(html.includes('application/ld+json'));
    assert.ok(html.indexOf('</body>') > html.indexOf('application/ld+json'));
  });

  it('returns applied=false with method=skipped when no injection point', () => {
    const bare = '<div>No head or body tags here</div>';
    const { html: out, applied, method } = applyLocalBusinessSchema(bare, SCHEMA);
    assert.equal(applied, false);
    assert.equal(method, 'skipped');
    assert.equal(out, bare);
  });

  it('returns applied=false for empty html', () => {
    const { applied, method } = applyLocalBusinessSchema('', SCHEMA);
    assert.equal(applied, false);
    assert.equal(method, 'skipped');
  });

  it('returns applied=false for null html', () => {
    const { applied } = applyLocalBusinessSchema(null as unknown as string, SCHEMA);
    assert.equal(applied, false);
  });

  it('injected JSON contains all schema fields', () => {
    const { html } = applyLocalBusinessSchema(page(''), SCHEMA);
    assert.ok(html.includes('"My Shop"'));
    assert.ok(html.includes('"555-000-1111"'));
  });

  it('only one JSON-LD script tag in result when replacing', () => {
    const { html } = applyLocalBusinessSchema(page(EXISTING_LB_SCHEMA), SCHEMA);
    const count = (html.match(/application\/ld\+json/g) ?? []).length;
    assert.equal(count, 1);
  });

  it('never throws on malformed existing schema', () => {
    const badSchema = '<script type="application/ld+json">{bad json}</script>';
    assert.doesNotThrow(() => applyLocalBusinessSchema(page(badSchema), SCHEMA));
  });

  it('never throws on invalid schema object', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    assert.doesNotThrow(() => applyLocalBusinessSchema(page(''), circular));
  });
});
