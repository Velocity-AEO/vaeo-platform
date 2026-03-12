/**
 * tools/native/shipping_bar_orchestrator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deployShippingBar,
  removeShippingBar,
} from './shipping_bar_orchestrator.ts';
import { createComponent } from './native_component.ts';

// ── deployShippingBar ─────────────────────────────────────────────────────────

describe('deployShippingBar', () => {
  const mockDeps = {
    writeSnippet: async () => ({ success: true }),
    updateTheme:  async () => ({ success: true, backup_key: 'bk-1' }),
  };

  it('returns component, install_result, snippet_html', async () => {
    const r = await deployShippingBar('site-1', 'mystore.myshopify.com', {}, false, mockDeps);
    assert.ok(r.component);
    assert.ok(r.install_result);
    assert.ok(r.snippet_html.length > 0);
  });

  it('install_result.success=true on happy path', async () => {
    const r = await deployShippingBar('site-1', 'mystore.myshopify.com', {}, false, mockDeps);
    assert.equal(r.install_result.success, true);
  });

  it('component.component_type is shipping_bar', async () => {
    const r = await deployShippingBar('site-1', 'mystore.myshopify.com', {}, false, mockDeps);
    assert.equal(r.component.component_type, 'shipping_bar');
  });

  it('config merges with defaults — custom threshold reflected in snippet', async () => {
    const r = await deployShippingBar('site-1', 'store.myshopify.com', { threshold_amount: 75 }, false, mockDeps);
    assert.ok(r.snippet_html.includes('75'));
  });

  it('default config used when no config provided', async () => {
    const r = await deployShippingBar('s', 'store.myshopify.com', undefined, false, mockDeps);
    assert.ok(r.snippet_html.includes('50')); // default threshold
  });

  it('invalid config — success=false, error set', async () => {
    const r = await deployShippingBar('s', 'store.myshopify.com', { threshold_amount: -1 }, false, mockDeps);
    assert.equal(r.install_result.success, false);
    assert.ok(r.install_result.error?.includes('Invalid'));
  });

  it('dry_run=true flows through to install_result', async () => {
    const r = await deployShippingBar('s', 'store.myshopify.com', {}, true);
    assert.equal(r.install_result.dry_run, true);
  });

  it('snippet_html is non-empty on success', async () => {
    const r = await deployShippingBar('s', 'store.myshopify.com', {}, false, mockDeps);
    assert.ok(r.snippet_html.length > 100);
  });

  it('snippet_html contains vaeo-shipping-bar', async () => {
    const r = await deployShippingBar('s', 'store.myshopify.com', {}, false, mockDeps);
    assert.ok(r.snippet_html.includes('vaeo-shipping-bar'));
  });

  it('writeSnippet dep is called', async () => {
    let called = false;
    await deployShippingBar('s', 'store.myshopify.com', {}, false, {
      writeSnippet: async () => { called = true; return { success: true }; },
      updateTheme:  async () => ({ success: true }),
    });
    assert.equal(called, true);
  });

  it('updateTheme dep is called', async () => {
    let called = false;
    await deployShippingBar('s', 'store.myshopify.com', {}, false, {
      writeSnippet: async () => ({ success: true }),
      updateTheme:  async () => { called = true; return { success: true }; },
    });
    assert.equal(called, true);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      deployShippingBar(null as never, null as never, null as never),
    );
  });

  it('component.site_id set correctly', async () => {
    const r = await deployShippingBar('my-site-123', 'store.myshopify.com', {}, false, mockDeps);
    assert.equal(r.component.site_id, 'my-site-123');
  });
});

// ── removeShippingBar ─────────────────────────────────────────────────────────

describe('removeShippingBar', () => {
  it('returns success=true', async () => {
    const c = createComponent('s', 'shipping_bar', 'Bar', {});
    const r = await removeShippingBar(c, 'store.myshopify.com', {
      deleteSnippet: async () => ({ success: true }),
    });
    assert.equal(r.success, true);
  });

  it('calls removeComponent (deleteSnippet dep invoked)', async () => {
    let called = false;
    const c = createComponent('s', 'shipping_bar', 'Bar', {});
    await removeShippingBar(c, 'store.myshopify.com', {
      deleteSnippet: async () => { called = true; return { success: true }; },
    });
    assert.equal(called, true);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      removeShippingBar(null as never, null as never),
    );
  });
});
