/**
 * tools/apps/environment_scanner.test.ts
 *
 * Tests for environment scanner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scanEnvironment } from './environment_scanner.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function htmlWith(...snippets: string[]): string {
  return `<html><head>${snippets.join('\n')}</head><body></body></html>`;
}

const KLAVIYO_SCRIPT = '<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>';
const INTERCOM_SCRIPT = '<script src="https://widget.intercom.io/widget/abc123"></script><div id="intercom-container"></div>';
const HEXTOM_SCRIPT = '<script src="https://cdn.hextom.com/free-shipping-bar/v2.js"></script><div class="hextom-fsb"></div>';
const AFTERPAY_SCRIPT = '<script src="https://js.afterpay.com/afterpay-1.x.js"></script><div class="afterpay-placement"></div>';
const INSTAFEED_SCRIPT = '<script src="https://instafeed.net/js/instafeed.min.js"></script>';
const HOTJAR_SCRIPT = '<script src="https://static.hotjar.com/c/hotjar-123.js"></script>';
const SMART_SEO_SCRIPT = '<script src="https://smart-seo.app/loader.js"></script>';

// ── Basic detection ──────────────────────────────────────────────────────────

describe('scanEnvironment — basic', () => {
  it('detects apps from script patterns', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(KLAVIYO_SCRIPT));
    assert.ok(scan.detected_apps.some((d) => d.fingerprint.app_id === 'klaviyo_popup'));
  });

  it('detects apps from domain patterns', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(INTERCOM_SCRIPT));
    assert.ok(scan.detected_apps.some((d) => d.fingerprint.app_id === 'intercom'));
  });

  it('detects apps from DOM patterns', () => {
    const html = htmlWith('<div class="hextom-fsb"></div>');
    const scan = scanEnvironment('s1', '/', html);
    assert.ok(scan.detected_apps.some((d) => d.fingerprint.app_id === 'hextom_shipping_bar'));
  });

  it('returns empty for HTML with no app signatures', () => {
    const scan = scanEnvironment('s1', '/', '<html><body><p>Clean page</p></body></html>');
    assert.equal(scan.total_apps_detected, 0);
  });

  it('sets site_id and url', () => {
    const scan = scanEnvironment('site-42', '/home', '<html></html>');
    assert.equal(scan.site_id, 'site-42');
    assert.equal(scan.url, '/home');
  });

  it('sets scanned_at to ISO date', () => {
    const scan = scanEnvironment('s1', '/', '<html></html>');
    assert.ok(scan.scanned_at.match(/^\d{4}-\d{2}-\d{2}T/));
  });
});

// ── Confidence levels ────────────────────────────────────────────────────────

describe('scanEnvironment — confidence', () => {
  it('assigns high confidence for 3+ matches', () => {
    // Intercom has script, domain, and DOM patterns
    const scan = scanEnvironment('s1', '/', htmlWith(INTERCOM_SCRIPT));
    const intercom = scan.detected_apps.find((d) => d.fingerprint.app_id === 'intercom');
    assert.ok(intercom);
    assert.equal(intercom.confidence, 'high');
  });

  it('assigns medium confidence for 2 matches', () => {
    // Hextom has script+domain+dom → but test with just 2
    const html = htmlWith('<script src="https://cdn.hextom.com/something.js"></script>');
    const scan = scanEnvironment('s1', '/', html);
    const hextom = scan.detected_apps.find((d) => d.fingerprint.app_id === 'hextom_shipping_bar');
    assert.ok(hextom);
    assert.equal(hextom.confidence, 'medium');
  });

  it('assigns low confidence for 1 match', () => {
    const html = htmlWith('<script>var instafeed = true;</script>');
    const scan = scanEnvironment('s1', '/', html);
    const app = scan.detected_apps.find((d) => d.fingerprint.app_id === 'instafeed');
    assert.ok(app);
    assert.equal(app.confidence, 'low');
  });
});

// ── Cost calculations ────────────────────────────────────────────────────────

describe('scanEnvironment — costs', () => {
  it('calculates estimated monthly spend', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(KLAVIYO_SCRIPT, INTERCOM_SCRIPT));
    assert.ok(scan.estimated_monthly_spend > 0);
  });

  it('calculates vaeo replacement savings', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(HEXTOM_SCRIPT, INSTAFEED_SCRIPT));
    assert.ok(scan.vaeo_replacement_savings > 0);
  });

  it('excludes regulatory exempt from replacement savings', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(AFTERPAY_SCRIPT));
    assert.equal(scan.vaeo_replacement_savings, 0);
  });
});

// ── Performance offenders ────────────────────────────────────────────────────

describe('scanEnvironment — performance', () => {
  it('lists high/critical impact apps as offenders', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(INTERCOM_SCRIPT, HOTJAR_SCRIPT));
    assert.ok(scan.performance_offenders.length >= 2);
  });

  it('does not include low impact apps as offenders', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(SMART_SEO_SCRIPT));
    assert.equal(scan.performance_offenders.length, 0);
  });
});

// ── Category counts ──────────────────────────────────────────────────────────

describe('scanEnvironment — categories', () => {
  it('counts detected apps per category', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(INTERCOM_SCRIPT, KLAVIYO_SCRIPT));
    assert.ok(scan.app_categories['chat'] >= 1);
    assert.ok(scan.app_categories['popup'] >= 1);
  });

  it('returns zero for undetected categories', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(INTERCOM_SCRIPT));
    assert.equal(scan.app_categories['inventory'], 0);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('scanEnvironment — edge cases', () => {
  it('handles empty HTML', () => {
    const scan = scanEnvironment('s1', '/', '');
    assert.equal(scan.total_apps_detected, 0);
  });

  it('counts regulatory exempt apps', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(AFTERPAY_SCRIPT));
    assert.ok(scan.regulatory_exempt_count >= 1);
  });

  it('counts replaceable apps', () => {
    const scan = scanEnvironment('s1', '/', htmlWith(HEXTOM_SCRIPT));
    assert.ok(scan.replaceable_count >= 1);
  });
});
