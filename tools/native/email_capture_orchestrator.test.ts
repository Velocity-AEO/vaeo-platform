/**
 * tools/native/email_capture_orchestrator.test.ts
 *
 * Tests for email capture orchestrator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deployEmailCapture,
  removeEmailCapture,
  type EmailCaptureDeployDeps,
} from './email_capture_orchestrator.js';
import type { NativeComponent } from './native_component.js';

// ── Mock deps ────────────────────────────────────────────────────────────────

function mockDeps(): EmailCaptureDeployDeps {
  return {
    writeSnippet: async () => ({ success: true }),
    updateTheme: async () => ({ success: true }),
  };
}

function mockComponent(): NativeComponent {
  return {
    component_id: 'comp_test',
    site_id: 'site_1',
    component_type: 'email_capture',
    name: 'Email Capture Popup',
    status: 'active',
    config: {},
    snippet_name: 'vaeo-email-capture-test',
    render_tag: "{%- render 'vaeo-email-capture-test' -%}",
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    version: '1.0.0',
  };
}

// ── deployEmailCapture ───────────────────────────────────────────────────────

describe('deployEmailCapture — happy path', () => {
  it('returns active component on success', async () => {
    const result = await deployEmailCapture('site_1', 'test.myshopify.com', {}, false, mockDeps());
    assert.equal(result.component.status, 'active');
    assert.equal(result.install_result.success, true);
  });

  it('generates snippet_html', async () => {
    const result = await deployEmailCapture('site_1', 'test.myshopify.com', {}, false, mockDeps());
    assert.ok(result.snippet_html.includes('vaeo-email-capture'));
    assert.ok(result.snippet_html.length > 100);
  });

  it('sets installed_at', async () => {
    const result = await deployEmailCapture('site_1', 'test.myshopify.com', {}, false, mockDeps());
    assert.ok(result.component.installed_at);
  });

  it('component type is email_capture', async () => {
    const result = await deployEmailCapture('site_1', 'test.myshopify.com', {}, false, mockDeps());
    assert.equal(result.component.component_type, 'email_capture');
  });
});

describe('deployEmailCapture — config merge', () => {
  it('merges partial config with defaults', async () => {
    const result = await deployEmailCapture('site_1', 'test.myshopify.com', { title: 'Custom Title' }, false, mockDeps());
    assert.ok(result.snippet_html.includes('Custom Title'));
    assert.ok(result.snippet_html.includes('Get My Discount')); // default button_text
  });

  it('uses all defaults when no config provided', async () => {
    const result = await deployEmailCapture('site_1', 'test.myshopify.com', undefined, false, mockDeps());
    assert.ok(result.snippet_html.includes('Get 10% Off'));
  });
});

describe('deployEmailCapture — validation', () => {
  it('returns error on invalid config', async () => {
    const result = await deployEmailCapture('site_1', 'test.myshopify.com', { title: '', button_text: '' }, false, mockDeps());
    assert.equal(result.component.status, 'error');
    assert.equal(result.install_result.success, false);
    assert.ok(result.install_result.error!.includes('title'));
  });
});

describe('deployEmailCapture — dry_run', () => {
  it('generates snippet but does not install', async () => {
    let writeCalled = false;
    const result = await deployEmailCapture('site_1', 'test.myshopify.com', {}, true, {
      writeSnippet: async () => { writeCalled = true; return { success: true }; },
    });
    assert.equal(writeCalled, false);
    assert.ok(result.snippet_html.length > 0);
    assert.equal(result.install_result.success, true);
  });
});

describe('deployEmailCapture — write failure', () => {
  it('returns error when snippet write fails', async () => {
    const result = await deployEmailCapture('site_1', 'test.myshopify.com', {}, false, {
      writeSnippet: async () => ({ success: false }),
    });
    assert.equal(result.component.status, 'error');
    assert.equal(result.install_result.success, false);
  });

  it('returns error when theme update fails', async () => {
    const result = await deployEmailCapture('site_1', 'test.myshopify.com', {}, false, {
      writeSnippet: async () => ({ success: true }),
      updateTheme: async () => ({ success: false }),
    });
    assert.equal(result.component.status, 'error');
  });
});

// ── removeEmailCapture ───────────────────────────────────────────────────────

describe('removeEmailCapture', () => {
  it('returns success with mock deps', async () => {
    const result = await removeEmailCapture(mockComponent(), 'test.myshopify.com');
    assert.equal(result.success, true);
  });

  it('calls removeSnippet with snippet_name', async () => {
    let calledWith = '';
    await removeEmailCapture(mockComponent(), 'test.myshopify.com', {
      removeSnippet: async (name) => { calledWith = name; return { success: true }; },
    });
    assert.equal(calledWith, 'vaeo-email-capture-test');
  });

  it('handles removal error gracefully', async () => {
    const result = await removeEmailCapture(mockComponent(), 'test.myshopify.com', {
      removeSnippet: async () => { throw new Error('API error'); },
    });
    assert.equal(result.success, false);
    assert.ok(result.error!.includes('API error'));
  });

  it('calls removeFromTheme with render_tag', async () => {
    let tagUsed = '';
    await removeEmailCapture(mockComponent(), 'test.myshopify.com', {
      removeFromTheme: async (_file, tag) => { tagUsed = tag; return { success: true }; },
    });
    assert.ok(tagUsed.includes('vaeo-email-capture-test'));
  });
});
