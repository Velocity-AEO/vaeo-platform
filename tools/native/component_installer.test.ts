/**
 * tools/native/component_installer.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  installComponent,
  removeComponent,
  type ComponentInstallConfig,
} from './component_installer.ts';
import { createComponent } from './native_component.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeComponent() {
  return createComponent('site-1', 'shipping_bar', 'My Bar', { threshold: 50 });
}

function makeLiveConfig(overrides: Partial<ComponentInstallConfig> = {}): ComponentInstallConfig {
  return {
    site_id:              'site-1',
    platform:             'shopify',
    shopify_store_domain: 'mystore.myshopify.com',
    theme_file:           'layout/theme.liquid',
    inject_before:        '</body>',
    dry_run:              false,
    ...overrides,
  };
}

const SNIPPET_HTML = '<div id="vaeo-shipping-bar">test</div>';

// ── installComponent — happy path ─────────────────────────────────────────────

describe('installComponent — happy path', () => {
  it('returns success=true when both deps succeed', async () => {
    const r = await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig(),
      {
        writeSnippet: async () => ({ success: true }),
        updateTheme:  async () => ({ success: true, backup_key: 'bk-1' }),
      },
    );
    assert.equal(r.success, true);
  });

  it('component status → active on success', async () => {
    const r = await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig(),
      {
        writeSnippet: async () => ({ success: true }),
        updateTheme:  async () => ({ success: true }),
      },
    );
    assert.equal(r.component.status, 'active');
  });

  it('theme_file_updated=true on success', async () => {
    const r = await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig(),
      {
        writeSnippet: async () => ({ success: true }),
        updateTheme:  async () => ({ success: true }),
      },
    );
    assert.equal(r.theme_file_updated, true);
  });

  it('render_tag_injected=true on success', async () => {
    const r = await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig(),
      {
        writeSnippet: async () => ({ success: true }),
        updateTheme:  async () => ({ success: true }),
      },
    );
    assert.equal(r.render_tag_injected, true);
  });

  it('backup_key set from updateTheme result', async () => {
    const r = await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig(),
      {
        writeSnippet: async () => ({ success: true }),
        updateTheme:  async () => ({ success: true, backup_key: 'bk-abc' }),
      },
    );
    assert.equal(r.backup_key, 'bk-abc');
    assert.equal(r.rollback_available, true);
  });

  it('writeSnippet called with correct store_domain', async () => {
    let calledDomain = '';
    await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig(),
      {
        writeSnippet: async (d) => { calledDomain = d; return { success: true }; },
        updateTheme:  async () => ({ success: true }),
      },
    );
    assert.equal(calledDomain, 'mystore.myshopify.com');
  });

  it('writeSnippet called with snippet_name', async () => {
    const c = makeComponent();
    let calledName = '';
    await installComponent(c, SNIPPET_HTML, makeLiveConfig(), {
      writeSnippet: async (_, n) => { calledName = n; return { success: true }; },
      updateTheme:  async () => ({ success: true }),
    });
    assert.equal(calledName, c.snippet_name);
  });

  it('updateTheme called with correct args', async () => {
    const c = makeComponent();
    let calledFile = '', calledTag = '', calledInject = '';
    await installComponent(c, SNIPPET_HTML, makeLiveConfig(), {
      writeSnippet: async () => ({ success: true }),
      updateTheme:  async (_, f, t, i) => { calledFile = f; calledTag = t; calledInject = i; return { success: true }; },
    });
    assert.equal(calledFile, 'layout/theme.liquid');
    assert.equal(calledTag, c.render_tag);
    assert.equal(calledInject, '</body>');
  });
});

// ── installComponent — dry_run ────────────────────────────────────────────────

describe('installComponent — dry_run', () => {
  it('dry_run skips real writes', async () => {
    let writeCalled = false;
    await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig({ dry_run: true }),
      { writeSnippet: async () => { writeCalled = true; return { success: true }; } },
    );
    assert.equal(writeCalled, false);
  });

  it('dry_run returns success=true', async () => {
    const r = await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig({ dry_run: true }),
    );
    assert.equal(r.success, true);
    assert.equal(r.dry_run, true);
  });

  it('dry_run sets component status to active', async () => {
    const r = await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig({ dry_run: true }),
    );
    assert.equal(r.component.status, 'active');
  });
});

// ── installComponent — error handling ────────────────────────────────────────

describe('installComponent — error handling', () => {
  it('success=false when writeSnippet fails', async () => {
    const r = await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig(),
      { writeSnippet: async () => ({ success: false }) },
    );
    assert.equal(r.success, false);
  });

  it('component status → error when writeSnippet throws', async () => {
    const r = await installComponent(
      makeComponent(), SNIPPET_HTML, makeLiveConfig(),
      { writeSnippet: async () => { throw new Error('network error'); } },
    );
    assert.equal(r.success, false);
    assert.ok(r.error?.includes('network error'));
    assert.equal(r.component.status, 'error');
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      installComponent(
        null as never, null as never, null as never,
      ),
    );
  });
});

// ── removeComponent ───────────────────────────────────────────────────────────

describe('removeComponent', () => {
  it('calls deleteSnippet dep', async () => {
    let called = false;
    await removeComponent(makeComponent(), makeLiveConfig(), {
      deleteSnippet: async () => { called = true; return { success: true }; },
    });
    assert.equal(called, true);
  });

  it('calls revertTheme dep', async () => {
    let called = false;
    const c = { ...makeComponent(), installed_at: new Date().toISOString() };
    await removeComponent(c, makeLiveConfig(), {
      revertTheme:  async () => { called = true; return { success: true }; },
      deleteSnippet: async () => ({ success: true }),
    });
    assert.equal(called, true);
  });

  it('component status → disabled', async () => {
    const r = await removeComponent(makeComponent(), makeLiveConfig(), {
      deleteSnippet: async () => ({ success: true }),
    });
    assert.equal(r.component.status, 'disabled');
  });

  it('returns success=true on clean remove', async () => {
    const r = await removeComponent(makeComponent(), makeLiveConfig(), {
      deleteSnippet: async () => ({ success: true }),
      revertTheme:   async () => ({ success: true }),
    });
    assert.equal(r.success, true);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      removeComponent(null as never, null as never),
    );
  });
});
