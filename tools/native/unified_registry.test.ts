import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPONENT_REGISTRY,
  getComponent,
  listComponents,
  type ComponentRegistryEntry,
} from './unified_registry.js';

describe('COMPONENT_REGISTRY', () => {
  it('has exactly 3 entries', () => {
    assert.equal(COMPONENT_REGISTRY.length, 3);
  });

  it('contains shipping_bar', () => {
    const entry = COMPONENT_REGISTRY.find((e) => e.component_type === 'shipping_bar');
    assert.ok(entry);
    assert.equal(entry.display_name, 'Shipping Bar');
  });

  it('contains email_capture', () => {
    const entry = COMPONENT_REGISTRY.find((e) => e.component_type === 'email_capture');
    assert.ok(entry);
    assert.equal(entry.display_name, 'Email Capture Popup');
  });

  it('contains social_feed', () => {
    const entry = COMPONENT_REGISTRY.find((e) => e.component_type === 'social_feed');
    assert.ok(entry);
    assert.equal(entry.display_name, 'Social Feed Widget');
  });

  it('every entry has all required fields', () => {
    for (const entry of COMPONENT_REGISTRY) {
      assert.ok(entry.component_type);
      assert.ok(entry.display_name);
      assert.ok(entry.description);
      assert.equal(typeof entry.deploy, 'function');
      assert.equal(typeof entry.remove, 'function');
      assert.equal(typeof entry.default_config, 'function');
      assert.equal(typeof entry.validate, 'function');
    }
  });

  it('display_names are non-empty strings', () => {
    for (const entry of COMPONENT_REGISTRY) {
      assert.equal(typeof entry.display_name, 'string');
      assert.ok(entry.display_name.length > 0);
    }
  });

  it('descriptions are non-empty strings', () => {
    for (const entry of COMPONENT_REGISTRY) {
      assert.equal(typeof entry.description, 'string');
      assert.ok(entry.description.length > 0);
    }
  });
});

describe('getComponent', () => {
  it('finds shipping_bar by type', () => {
    const entry = getComponent('shipping_bar');
    assert.ok(entry);
    assert.equal(entry.component_type, 'shipping_bar');
  });

  it('finds email_capture by type', () => {
    const entry = getComponent('email_capture');
    assert.ok(entry);
    assert.equal(entry.component_type, 'email_capture');
  });

  it('finds social_feed by type', () => {
    const entry = getComponent('social_feed');
    assert.ok(entry);
    assert.equal(entry.component_type, 'social_feed');
  });

  it('returns undefined for unknown type', () => {
    const entry = getComponent('unknown_widget' as any);
    assert.equal(entry, undefined);
  });
});

describe('listComponents', () => {
  it('returns all 3 components', () => {
    const list = listComponents();
    assert.equal(list.length, 3);
  });

  it('returns array of ComponentRegistryEntry objects', () => {
    const list = listComponents();
    for (const entry of list) {
      assert.ok(entry.component_type);
      assert.ok(entry.deploy);
    }
  });
});

describe('default_config', () => {
  it('shipping_bar default_config returns object with threshold', () => {
    const entry = getComponent('shipping_bar')!;
    const cfg = entry.default_config();
    assert.equal(typeof cfg, 'object');
    assert.ok('threshold' in cfg || 'threshold_cents' in cfg || Object.keys(cfg).length > 0);
  });

  it('email_capture default_config returns object', () => {
    const entry = getComponent('email_capture')!;
    const cfg = entry.default_config();
    assert.equal(typeof cfg, 'object');
    assert.ok(Object.keys(cfg).length > 0);
  });

  it('social_feed default_config returns object with feed_type', () => {
    const entry = getComponent('social_feed')!;
    const cfg = entry.default_config();
    assert.equal(typeof cfg, 'object');
    assert.ok('feed_type' in cfg);
  });
});

describe('validate', () => {
  it('shipping_bar validate returns valid for default config', () => {
    const entry = getComponent('shipping_bar')!;
    const result = entry.validate(entry.default_config());
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('email_capture validate returns valid for default config', () => {
    const entry = getComponent('email_capture')!;
    const result = entry.validate(entry.default_config());
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('social_feed validate returns valid for config with feed_url', () => {
    const entry = getComponent('social_feed')!;
    const cfg = { ...entry.default_config(), feed_url: 'https://feed.example.com/rss' };
    const result = entry.validate(cfg);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('social_feed validate catches empty feed_url', () => {
    const entry = getComponent('social_feed')!;
    const result = entry.validate({ ...entry.default_config(), feed_url: '' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });
});

describe('deploy', () => {
  it('shipping_bar deploy dry_run succeeds', async () => {
    const entry = getComponent('shipping_bar')!;
    const result = await entry.deploy('site1', 'test.myshopify.com', undefined, true);
    assert.ok(result.component);
    assert.ok(result.snippet_html);
    assert.ok(result.install_result);
  });

  it('email_capture deploy dry_run succeeds', async () => {
    const entry = getComponent('email_capture')!;
    const result = await entry.deploy('site1', 'test.myshopify.com', undefined, true);
    assert.ok(result.component);
    assert.ok(result.snippet_html);
  });

  it('social_feed deploy dry_run succeeds', async () => {
    const entry = getComponent('social_feed')!;
    const result = await entry.deploy('site1', 'test.myshopify.com', { feed_url: 'https://feed.example.com/rss' }, true);
    assert.ok(result.component);
    assert.ok(result.snippet_html.includes('vaeo-social-feed'));
  });
});
