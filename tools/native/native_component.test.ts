/**
 * tools/native/native_component.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createComponent,
  updateComponentStatus,
  buildComponentResult,
  type NativeComponent,
} from './native_component.ts';

// ── createComponent ───────────────────────────────────────────────────────────

describe('createComponent', () => {
  it('sets component_id as UUID', () => {
    const c = createComponent('site1', 'shipping_bar', 'My Bar', {});
    assert.match(c.component_id, /^[0-9a-f-]{36}$/);
  });

  it('sets site_id', () => {
    const c = createComponent('site-abc', 'shipping_bar', 'Bar', {});
    assert.equal(c.site_id, 'site-abc');
  });

  it('sets component_type', () => {
    const c = createComponent('s', 'email_capture', 'Capture', {});
    assert.equal(c.component_type, 'email_capture');
  });

  it('sets name', () => {
    const c = createComponent('s', 'shipping_bar', 'My Shipping Bar', {});
    assert.equal(c.name, 'My Shipping Bar');
  });

  it('status is draft', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    assert.equal(c.status, 'draft');
  });

  it('version is 1.0.0', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    assert.equal(c.version, '1.0.0');
  });

  it('snippet_name format: vaeo-{type_with_hyphens}-{8chars}', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    assert.ok(c.snippet_name.startsWith('vaeo-shipping-bar-'), `got: ${c.snippet_name}`);
    assert.equal(c.snippet_name.length, 'vaeo-shipping-bar-'.length + 8);
  });

  it('snippet_name uses hyphens not underscores', () => {
    const c = createComponent('s', 'email_capture', 'n', {});
    assert.ok(c.snippet_name.startsWith('vaeo-email-capture-'));
    assert.ok(!c.snippet_name.includes('_'));
  });

  it('render_tag wraps snippet_name in render tag', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    assert.equal(c.render_tag, `{%- render '${c.snippet_name}' -%}`);
  });

  it('config stored as-is', () => {
    const cfg = { foo: 'bar', num: 42 };
    const c = createComponent('s', 'shipping_bar', 'n', cfg);
    assert.deepEqual(c.config, cfg);
  });

  it('created_at and updated_at are valid ISO', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    assert.ok(!isNaN(new Date(c.created_at).getTime()));
    assert.ok(!isNaN(new Date(c.updated_at).getTime()));
  });

  it('never throws', () => {
    assert.doesNotThrow(() =>
      createComponent(null as unknown as string, 'shipping_bar', null as unknown as string, null as unknown as Record<string, unknown>),
    );
  });
});

// ── updateComponentStatus ─────────────────────────────────────────────────────

describe('updateComponentStatus', () => {
  it('returns new object (immutable)', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    const updated = updateComponentStatus(c, 'active');
    assert.notEqual(c, updated);
    assert.equal(c.status, 'draft');
    assert.equal(updated.status, 'active');
  });

  it('sets new status', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    assert.equal(updateComponentStatus(c, 'disabled').status, 'disabled');
  });

  it('sets error when provided', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    const updated = updateComponentStatus(c, 'error', 'something failed');
    assert.equal(updated.error, 'something failed');
  });

  it('clears error when not provided', () => {
    const c: NativeComponent = { ...createComponent('s', 'shipping_bar', 'n', {}), error: 'old' };
    const updated = updateComponentStatus(c, 'active');
    assert.equal(updated.error, undefined);
  });

  it('updates updated_at', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    const before = c.updated_at;
    const updated = updateComponentStatus(c, 'active');
    assert.ok(updated.updated_at >= before);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => updateComponentStatus(null as unknown as NativeComponent, 'active'));
  });
});

// ── buildComponentResult ──────────────────────────────────────────────────────

describe('buildComponentResult', () => {
  it('sets success', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    const r = buildComponentResult(c, true, 'created', 'done');
    assert.equal(r.success, true);
  });

  it('sets action', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    const r = buildComponentResult(c, true, 'updated', 'msg');
    assert.equal(r.action, 'updated');
  });

  it('sets message', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    const r = buildComponentResult(c, true, 'created', 'Install successful');
    assert.equal(r.message, 'Install successful');
  });

  it('sets snippet_html when provided', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    const r = buildComponentResult(c, true, 'created', 'ok', '<div>html</div>');
    assert.equal(r.snippet_html, '<div>html</div>');
  });

  it('snippet_html absent when not provided', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    const r = buildComponentResult(c, true, 'created', 'ok');
    assert.equal(r.snippet_html, undefined);
  });

  it('sets error when provided', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    const r = buildComponentResult(c, false, 'created', 'fail', undefined, 'oops');
    assert.equal(r.error, 'oops');
  });

  it('executed_at is valid ISO', () => {
    const c = createComponent('s', 'shipping_bar', 'n', {});
    const r = buildComponentResult(c, true, 'created', 'ok');
    assert.ok(!isNaN(new Date(r.executed_at).getTime()));
  });
});
