/**
 * tools/native/email_capture.test.ts
 *
 * Tests for email capture config and HTML generator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultEmailCaptureConfig,
  validateEmailCaptureConfig,
  generateEmailCaptureSnippet,
  type EmailCaptureConfig,
} from './email_capture.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function cfg(overrides?: Partial<EmailCaptureConfig>): EmailCaptureConfig {
  return { ...defaultEmailCaptureConfig(), ...overrides };
}

// ── defaultEmailCaptureConfig ────────────────────────────────────────────────

describe('defaultEmailCaptureConfig', () => {
  it('sets trigger to exit_intent', () => {
    assert.equal(defaultEmailCaptureConfig().trigger, 'exit_intent');
  });

  it('sets title to discount offer', () => {
    assert.ok(defaultEmailCaptureConfig().title.includes('10%'));
  });

  it('sets overlay_opacity to 0.6', () => {
    assert.equal(defaultEmailCaptureConfig().overlay_opacity, 0.6);
  });

  it('sets show_once_per_days to 7', () => {
    assert.equal(defaultEmailCaptureConfig().show_once_per_days, 7);
  });

  it('sets webhook_url to empty', () => {
    assert.equal(defaultEmailCaptureConfig().webhook_url, '');
  });

  it('sets gdpr_checkbox to false', () => {
    assert.equal(defaultEmailCaptureConfig().gdpr_checkbox, false);
  });
});

// ── validateEmailCaptureConfig ───────────────────────────────────────────────

describe('validateEmailCaptureConfig', () => {
  it('valid config passes', () => {
    const result = validateEmailCaptureConfig(cfg());
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('scroll_percent > 100 fails', () => {
    const result = validateEmailCaptureConfig(cfg({ trigger: 'scroll_percent', trigger_value: 150 }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('scroll_percent')));
  });

  it('overlay_opacity > 1 fails', () => {
    const result = validateEmailCaptureConfig(cfg({ overlay_opacity: 1.5 }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('overlay_opacity')));
  });

  it('empty title fails', () => {
    const result = validateEmailCaptureConfig(cfg({ title: '' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('title')));
  });

  it('empty button_text fails', () => {
    const result = validateEmailCaptureConfig(cfg({ button_text: '' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('button_text')));
  });

  it('border_radius > 50 fails', () => {
    const result = validateEmailCaptureConfig(cfg({ border_radius_px: 60 }));
    assert.equal(result.valid, false);
  });

  it('negative show_once_per_days fails', () => {
    const result = validateEmailCaptureConfig(cfg({ show_once_per_days: -1 }));
    assert.equal(result.valid, false);
  });

  it('background_color without # fails', () => {
    const result = validateEmailCaptureConfig(cfg({ background_color: 'ffffff' }));
    assert.equal(result.valid, false);
  });

  it('button_color without # fails', () => {
    const result = validateEmailCaptureConfig(cfg({ button_color: 'red' }));
    assert.equal(result.valid, false);
  });
});

// ── generateEmailCaptureSnippet ──────────────────────────────────────────────

describe('generateEmailCaptureSnippet', () => {
  const snippet = generateEmailCaptureSnippet(cfg(), 'test-popup');

  it('contains vaeo-email-capture wrapper', () => {
    assert.ok(snippet.includes('vaeo-email-capture'));
  });

  it('contains style block', () => {
    assert.ok(snippet.includes('<style>'));
  });

  it('contains script block', () => {
    assert.ok(snippet.includes('<script>'));
  });

  it('contains title text', () => {
    assert.ok(snippet.includes('Get 10% Off Your First Order'));
  });

  it('contains button_text', () => {
    assert.ok(snippet.includes('Get My Discount'));
  });

  it('contains placeholder_text', () => {
    assert.ok(snippet.includes('Enter your email address'));
  });

  it('contains name field when include_name_field=true', () => {
    const s = generateEmailCaptureSnippet(cfg({ include_name_field: true }), 'n');
    assert.ok(s.includes('vaeo-ec-name'));
    assert.ok(s.includes('Your name'));
  });

  it('no name field when include_name_field=false', () => {
    const s = generateEmailCaptureSnippet(cfg({ include_name_field: false }), 'n');
    assert.ok(!s.includes('vaeo-ec-name'));
  });

  it('contains gdpr checkbox when gdpr_checkbox=true', () => {
    const s = generateEmailCaptureSnippet(cfg({ gdpr_checkbox: true }), 'g');
    assert.ok(s.includes('vaeo-ec-gdpr'));
    assert.ok(s.includes('I agree to receive marketing emails'));
  });

  it('no gdpr when gdpr_checkbox=false', () => {
    const s = generateEmailCaptureSnippet(cfg({ gdpr_checkbox: false }), 'g');
    assert.ok(!s.includes('vaeo-ec-gdpr'));
  });

  it('contains webhook_url in script when set', () => {
    const s = generateEmailCaptureSnippet(cfg({ webhook_url: 'https://hooks.example.com/email' }), 'w');
    assert.ok(s.includes('https://hooks.example.com/email'));
    assert.ok(s.includes('fetch'));
  });

  it('no webhook fetch when webhook_url empty', () => {
    const s = generateEmailCaptureSnippet(cfg({ webhook_url: '' }), 'w');
    assert.ok(!s.includes('fetch('));
  });

  it('exit_intent in script when trigger=exit_intent', () => {
    const s = generateEmailCaptureSnippet(cfg({ trigger: 'exit_intent' }), 'e');
    assert.ok(s.includes('mouseleave'));
  });

  it('scroll in script when trigger=scroll_percent', () => {
    const s = generateEmailCaptureSnippet(cfg({ trigger: 'scroll_percent', trigger_value: 50 }), 's');
    assert.ok(s.includes('scroll'));
    assert.ok(s.includes('50'));
  });

  it('setTimeout in script when trigger=time_delay', () => {
    const s = generateEmailCaptureSnippet(cfg({ trigger: 'time_delay', trigger_value: 5 }), 't');
    assert.ok(s.includes('setTimeout'));
    assert.ok(s.includes('5000'));
  });

  it('show_close_button × present when true', () => {
    const s = generateEmailCaptureSnippet(cfg({ show_close_button: true }), 'c');
    assert.ok(s.includes('&times;'));
    assert.ok(s.includes('vaeo-ec-close'));
  });

  it('overlay_opacity value in CSS', () => {
    const s = generateEmailCaptureSnippet(cfg({ overlay_opacity: 0.8 }), 'o');
    assert.ok(s.includes('rgba(0,0,0,0.8)'));
  });

  it('snippet_name in comment', () => {
    const s = generateEmailCaptureSnippet(cfg(), 'my-popup');
    assert.ok(s.includes('snippet: my-popup'));
  });
});
