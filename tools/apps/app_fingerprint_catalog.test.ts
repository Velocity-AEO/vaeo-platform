/**
 * tools/apps/app_fingerprint_catalog.test.ts
 *
 * Tests for app fingerprint catalog.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_FINGERPRINT_CATALOG,
  getAppById,
  getAppsByCategory,
  getReplaceableApps,
  getRegulatoryExemptApps,
  type AppFingerprint,
  type AppCategory,
} from './app_fingerprint_catalog.js';

// ── Catalog completeness ─────────────────────────────────────────────────────

describe('APP_FINGERPRINT_CATALOG — completeness', () => {
  it('has at least 30 apps', () => {
    assert.ok(APP_FINGERPRINT_CATALOG.length >= 30);
  });

  it('all apps have unique app_id', () => {
    const ids = APP_FINGERPRINT_CATALOG.map((a) => a.app_id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('all apps have non-empty name and description', () => {
    for (const app of APP_FINGERPRINT_CATALOG) {
      assert.ok(app.name.length > 0, `${app.app_id} missing name`);
      assert.ok(app.description.length > 0, `${app.app_id} missing description`);
    }
  });

  it('all apps have at least one detection pattern', () => {
    for (const app of APP_FINGERPRINT_CATALOG) {
      const total =
        app.script_patterns.length +
        app.domain_patterns.length +
        app.dom_patterns.length +
        app.cookie_patterns.length;
      assert.ok(total > 0, `${app.app_id} has no detection patterns`);
    }
  });

  it('all apps have valid performance_impact', () => {
    const valid = ['low', 'medium', 'high', 'critical'];
    for (const app of APP_FINGERPRINT_CATALOG) {
      assert.ok(valid.includes(app.performance_impact), `${app.app_id} invalid impact`);
    }
  });

  it('all apps have valid category', () => {
    const validCategories: AppCategory[] = [
      'seo', 'shipping', 'reviews', 'upsell', 'popup',
      'chat', 'social', 'loyalty', 'analytics', 'email',
      'payments', 'inventory', 'forms', 'other',
    ];
    for (const app of APP_FINGERPRINT_CATALOG) {
      assert.ok(validCategories.includes(app.category), `${app.app_id} invalid category`);
    }
  });
});

// ── Category coverage ────────────────────────────────────────────────────────

describe('APP_FINGERPRINT_CATALOG — categories', () => {
  it('covers shipping category', () => {
    assert.ok(getAppsByCategory('shipping').length >= 2);
  });

  it('covers reviews category', () => {
    assert.ok(getAppsByCategory('reviews').length >= 4);
  });

  it('covers chat category', () => {
    assert.ok(getAppsByCategory('chat').length >= 3);
  });

  it('covers analytics category', () => {
    assert.ok(getAppsByCategory('analytics').length >= 3);
  });

  it('covers payments category', () => {
    assert.ok(getAppsByCategory('payments').length >= 3);
  });

  it('covers popup category', () => {
    assert.ok(getAppsByCategory('popup').length >= 3);
  });
});

// ── getAppById ───────────────────────────────────────────────────────────────

describe('getAppById', () => {
  it('returns app by id', () => {
    const app = getAppById('intercom');
    assert.ok(app);
    assert.equal(app.name, 'Intercom');
    assert.equal(app.category, 'chat');
  });

  it('returns undefined for unknown id', () => {
    assert.equal(getAppById('nonexistent_app'), undefined);
  });
});

// ── getReplaceableApps ───────────────────────────────────────────────────────

describe('getReplaceableApps', () => {
  it('returns only replaceable apps', () => {
    const apps = getReplaceableApps();
    assert.ok(apps.length > 0);
    assert.ok(apps.every((a) => a.replaceable_by_vaeo === true));
  });

  it('includes hextom shipping bar', () => {
    const apps = getReplaceableApps();
    assert.ok(apps.some((a) => a.app_id === 'hextom_shipping_bar'));
  });
});

// ── getRegulatoryExemptApps ──────────────────────────────────────────────────

describe('getRegulatoryExemptApps', () => {
  it('returns only regulatory exempt apps', () => {
    const apps = getRegulatoryExemptApps();
    assert.ok(apps.length > 0);
    assert.ok(apps.every((a) => a.regulatory_exempt === true));
  });

  it('includes payment providers', () => {
    const apps = getRegulatoryExemptApps();
    assert.ok(apps.some((a) => a.app_id === 'afterpay'));
    assert.ok(apps.some((a) => a.app_id === 'klarna'));
  });

  it('payment apps are not replaceable', () => {
    const apps = getRegulatoryExemptApps();
    assert.ok(apps.every((a) => a.replaceable_by_vaeo === false));
  });
});
