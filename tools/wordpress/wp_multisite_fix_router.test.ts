import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFixTargetSite,
  buildSubsiteFixConfig,
  applyMultisiteFix,
  type FixTarget,
  type WPSandboxConfig,
  type WPIssue,
} from './wp_multisite_fix_router.js';
import type { WPMultisiteConfig } from './wp_multisite_detector.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMultisiteConfig(overrides?: Partial<WPMultisiteConfig>): WPMultisiteConfig {
  return {
    is_multisite:   true,
    multisite_type: 'subdomain',
    main_site_url:  'https://main.com',
    subsites: [
      { site_id: 1, url: 'https://main.com',      name: 'Main', is_main: true },
      { site_id: 2, url: 'https://blog.main.com',  name: 'Blog', is_main: false },
      { site_id: 3, url: 'https://shop.main.com',  name: 'Shop', is_main: false },
    ],
    subsite_count: 3,
    detected_at:   new Date().toISOString(),
    ...overrides,
  };
}

function makeBaseConfig(): WPSandboxConfig {
  return {
    wp_url:       'https://main.com',
    username:     'admin',
    app_password: 'pass123',
    site_id:      'site_abc',
  };
}

function makeIssue(url: string): WPIssue {
  return { url, issue_type: 'SCHEMA_MISSING', severity: 'high' };
}

// ── resolveFixTargetSite ────────────────────────────────────────────────────

describe('resolveFixTargetSite', () => {
  it('returns correct subsite for subdomain match', () => {
    const target = resolveFixTargetSite('https://blog.main.com/page-1', makeMultisiteConfig());
    assert.equal(target.target_url, 'https://blog.main.com');
    assert.equal(target.is_subsite, true);
    assert.equal(target.subsite_name, 'Blog');
  });

  it('returns main site when no subsite matches', () => {
    const target = resolveFixTargetSite('https://main.com/about', makeMultisiteConfig());
    assert.equal(target.target_url, 'https://main.com');
    assert.equal(target.is_subsite, false);
    assert.equal(target.subsite_name, null);
  });

  it('handles subdomain type correctly', () => {
    const target = resolveFixTargetSite('https://shop.main.com/products', makeMultisiteConfig());
    assert.equal(target.target_url, 'https://shop.main.com');
    assert.equal(target.is_subsite, true);
    assert.equal(target.subsite_name, 'Shop');
  });

  it('handles subdirectory type correctly', () => {
    const config = makeMultisiteConfig({
      multisite_type: 'subdirectory',
      subsites: [
        { site_id: 1, url: 'https://main.com',       name: 'Main', is_main: true },
        { site_id: 2, url: 'https://main.com/blog',   name: 'Blog', is_main: false },
        { site_id: 3, url: 'https://main.com/shop',   name: 'Shop', is_main: false },
      ],
    });
    const target = resolveFixTargetSite('https://main.com/blog/post-1', config);
    assert.equal(target.target_url, 'https://main.com/blog');
    assert.equal(target.is_subsite, true);
    assert.equal(target.subsite_name, 'Blog');
  });

  it('returns main site for non-multisite config', () => {
    const config = makeMultisiteConfig({ is_multisite: false });
    const target = resolveFixTargetSite('https://blog.main.com/page', config);
    assert.equal(target.is_subsite, false);
    assert.equal(target.target_url, 'https://main.com');
  });

  it('returns main site when subsites array is empty', () => {
    const config = makeMultisiteConfig({ subsites: [] });
    const target = resolveFixTargetSite('https://blog.main.com/page', config);
    assert.equal(target.is_subsite, false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => resolveFixTargetSite(null as any, null as any));
  });
});

// ── buildSubsiteFixConfig ───────────────────────────────────────────────────

describe('buildSubsiteFixConfig', () => {
  it('replaces wp_url with target url', () => {
    const target: FixTarget = { target_url: 'https://blog.main.com', is_subsite: true, subsite_name: 'Blog' };
    const config = buildSubsiteFixConfig(target, makeBaseConfig());
    assert.equal(config.wp_url, 'https://blog.main.com');
  });

  it('keeps credentials from base config', () => {
    const target: FixTarget = { target_url: 'https://blog.main.com', is_subsite: true, subsite_name: 'Blog' };
    const config = buildSubsiteFixConfig(target, makeBaseConfig());
    assert.equal(config.username, 'admin');
    assert.equal(config.app_password, 'pass123');
    assert.equal(config.site_id, 'site_abc');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildSubsiteFixConfig(null as any, null as any));
  });
});

// ── applyMultisiteFix ───────────────────────────────────────────────────────

describe('applyMultisiteFix', () => {
  it('routes fix to correct subsite', async () => {
    let receivedUrl = '';
    const result = await applyMultisiteFix(
      makeIssue('https://blog.main.com/page-1'),
      makeMultisiteConfig(),
      makeBaseConfig(),
      {
        applyFn: async (issue, config) => {
          receivedUrl = config.wp_url;
          return { success: true, fix_url: issue.url, subsite_url: null };
        },
      },
    );
    assert.equal(receivedUrl, 'https://blog.main.com');
    assert.equal(result.subsite_url, 'https://blog.main.com');
    assert.equal(result.success, true);
  });

  it('returns subsite_url=null for main site fix', async () => {
    const result = await applyMultisiteFix(
      makeIssue('https://main.com/about'),
      makeMultisiteConfig(),
      makeBaseConfig(),
      {
        applyFn: async (issue) => ({ success: true, fix_url: issue.url, subsite_url: null }),
      },
    );
    assert.equal(result.subsite_url, null);
  });

  it('returns error on applyFn failure', async () => {
    const result = await applyMultisiteFix(
      makeIssue('https://blog.main.com/page'),
      makeMultisiteConfig(),
      makeBaseConfig(),
      {
        applyFn: async () => { throw new Error('apply failed'); },
      },
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('apply failed'));
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => applyMultisiteFix(null as any, null as any, null as any));
  });
});
