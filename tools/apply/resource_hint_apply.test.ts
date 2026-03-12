/**
 * tools/apply/resource_hint_apply.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyResourceHints,
  applyResourceHintsTheme,
  _injectFetch,
  _resetInjections,
} from './resource_hint_apply.ts';
import type { ResourceHintPlan } from '../optimize/resource_hint_plan.ts';

function emptyPlan(url = 'https://store.myshopify.com/'): ResourceHintPlan {
  return { url, entries: [], insert_html: '', domain_count: 0 };
}

function plan1(url = 'https://store.myshopify.com/'): ResourceHintPlan {
  return {
    url,
    entries: [
      {
        domain: 'www.googletagmanager.com',
        hint_type: 'preconnect',
        tag: '<link rel="preconnect" href="https://www.googletagmanager.com">',
        crossorigin: false,
        description: 'Add preconnect for Google Tag Manager',
      },
    ],
    insert_html: '<link rel="preconnect" href="https://www.googletagmanager.com">',
    domain_count: 1,
  };
}

function plan2(): ResourceHintPlan {
  return {
    url: 'https://store.myshopify.com/',
    entries: [
      {
        domain: 'fonts.googleapis.com',
        hint_type: 'preconnect',
        tag: '<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>',
        crossorigin: true,
        description: 'Add preconnect for Google Fonts',
      },
      {
        domain: 'fonts.gstatic.com',
        hint_type: 'dns-prefetch',
        tag: '<link rel="dns-prefetch" href="//fonts.gstatic.com">',
        crossorigin: false,
        description: 'Add dns-prefetch for Google Fonts files',
      },
    ],
    insert_html:
      '<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>\n<link rel="dns-prefetch" href="//fonts.gstatic.com">',
    domain_count: 2,
  };
}

// ── applyResourceHints ────────────────────────────────────────────────────────

describe('applyResourceHints', () => {
  it('returns original html unchanged when plan has no entries', () => {
    const html = '<html><head></head><body></body></html>';
    const r = applyResourceHints(html, emptyPlan());
    assert.equal(r.html, html);
    assert.equal(r.applied, false);
    assert.equal(r.injected_count, 0);
  });

  it('injects tags before </head>', () => {
    const html = '<html><head><title>T</title></head><body></body></html>';
    const r = applyResourceHints(html, plan1());
    assert.ok(r.html.includes('<link rel="preconnect" href="https://www.googletagmanager.com">'));
    assert.ok(r.html.indexOf('preconnect') < r.html.indexOf('</head>'));
    assert.equal(r.applied, true);
    assert.equal(r.injected_count, 1);
  });

  it('falls back to before </body> when no </head>', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const r = applyResourceHints(html, plan1());
    assert.ok(r.html.includes('preconnect'));
    assert.ok(r.html.indexOf('preconnect') < r.html.indexOf('</body>'));
    assert.equal(r.applied, true);
  });

  it('appends to end when no </head> or </body>', () => {
    const html = '<p>bare</p>';
    const r = applyResourceHints(html, plan1());
    assert.ok(r.html.includes('preconnect'));
    assert.equal(r.applied, true);
  });

  it('injects all entries from a multi-entry plan', () => {
    const html = '<html><head></head><body></body></html>';
    const r = applyResourceHints(html, plan2());
    assert.ok(r.html.includes('fonts.googleapis.com'));
    assert.ok(r.html.includes('fonts.gstatic.com'));
    assert.equal(r.injected_count, 2);
  });

  it('returns empty string safely on null input', () => {
    const r = applyResourceHints(null as unknown as string, plan1());
    assert.equal(r.applied, false);
    assert.equal(r.injected_count, 0);
  });

  it('preserves rest of head content', () => {
    const html = '<html><head><meta charset="utf-8"></head><body></body></html>';
    const r = applyResourceHints(html, plan1());
    assert.ok(r.html.includes('<meta charset="utf-8">'));
  });
});

// ── applyResourceHintsTheme ───────────────────────────────────────────────────

describe('applyResourceHintsTheme', () => {
  beforeEach(() => _resetInjections());

  it('returns ok=true already_injected=true when sentinel exists', async () => {
    const themeLiquid = `<html><head><!-- vaeo-resource-hints --></head></html>`;
    _injectFetch(async () => new Response(
      JSON.stringify({ asset: { value: themeLiquid } }),
      { status: 200 },
    ) as Response);
    const r = await applyResourceHintsTheme('shop.myshopify.com', 'tok', '123', plan1());
    assert.equal(r.ok, true);
    assert.equal(r.already_injected, true);
    assert.equal(r.injected_count, 0);
  });

  it('injects hints when sentinel absent', async () => {
    const themeLiquid = `<html><head><title>T</title></head></html>`;
    let written = '';
    _injectFetch(async (url: RequestInfo | URL, opts?: RequestInit) => {
      const method = (opts as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') {
        return new Response(JSON.stringify({ asset: { value: themeLiquid } }), { status: 200 }) as Response;
      }
      // PUT
      const body = JSON.parse((opts as RequestInit).body as string) as { asset: { value: string } };
      written = body.asset.value;
      return new Response(JSON.stringify({ asset: { key: 'layout/theme.liquid' } }), { status: 200 }) as Response;
    });
    const r = await applyResourceHintsTheme('shop.myshopify.com', 'tok', '123', plan1());
    assert.equal(r.ok, true);
    assert.equal(r.already_injected, false);
    assert.equal(r.injected_count, 1);
    assert.ok(written.includes('vaeo-resource-hints'));
    assert.ok(written.includes('googletagmanager.com'));
  });

  it('returns ok=true with injected_count=0 when plan has no entries', async () => {
    const r = await applyResourceHintsTheme('shop.myshopify.com', 'tok', '123', emptyPlan());
    assert.equal(r.ok, true);
    assert.equal(r.injected_count, 0);
  });

  it('returns ok=false when GET fails', async () => {
    _injectFetch(async () => new Response('', { status: 404 }) as Response);
    const r = await applyResourceHintsTheme('shop.myshopify.com', 'tok', '123', plan1());
    assert.equal(r.ok, false);
    assert.ok(r.error?.includes('404'));
  });

  it('returns ok=false when PUT fails', async () => {
    const themeLiquid = '<html><head></head></html>';
    _injectFetch(async (_url: RequestInfo | URL, opts?: RequestInit) => {
      const method = (opts as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') {
        return new Response(JSON.stringify({ asset: { value: themeLiquid } }), { status: 200 }) as Response;
      }
      return new Response('', { status: 422 }) as Response;
    });
    const r = await applyResourceHintsTheme('shop.myshopify.com', 'tok', '123', plan1());
    assert.equal(r.ok, false);
    assert.ok(r.error?.includes('422'));
  });

  it('never throws on fetch error', async () => {
    _injectFetch(async () => { throw new Error('network fail'); });
    const r = await applyResourceHintsTheme('shop.myshopify.com', 'tok', '123', plan1());
    assert.equal(r.ok, false);
    assert.ok(r.error?.includes('network fail'));
  });
});
