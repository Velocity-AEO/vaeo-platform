/**
 * apps/dashboard/lib/auth_guard.test.ts
 *
 * Tests for client route auth guard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkClientAccess, type SiteRecord } from './auth_guard.js';

const SITE: SiteRecord = {
  site_id: 'site-1',
  user_id: 'user-abc',
  domain: 'myshop.com',
};

function loadSiteFound(site: SiteRecord = SITE) {
  return async () => site;
}

function loadSiteNull() {
  return async () => null;
}

function loadSiteThrows() {
  return async () => { throw new Error('db error'); };
}

// ── Allowed ──────────────────────────────────────────────────────────────────

describe('checkClientAccess — allowed', () => {
  it('returns allowed true when user owns site', async () => {
    const r = await checkClientAccess('user-abc', 'site-1', { loadSite: loadSiteFound() });
    assert.equal(r.allowed, true);
  });

  it('does not set reason when allowed', async () => {
    const r = await checkClientAccess('user-abc', 'site-1', { loadSite: loadSiteFound() });
    assert.equal(r.reason, undefined);
  });

  it('does not set redirect_to when allowed', async () => {
    const r = await checkClientAccess('user-abc', 'site-1', { loadSite: loadSiteFound() });
    assert.equal(r.redirect_to, undefined);
  });
});

// ── Not authenticated ────────────────────────────────────────────────────────

describe('checkClientAccess — not_authenticated', () => {
  it('returns not_authenticated when user_id is null', async () => {
    const r = await checkClientAccess(null, 'site-1', { loadSite: loadSiteFound() });
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'not_authenticated');
  });

  it('redirects to /login when not authenticated', async () => {
    const r = await checkClientAccess(null, 'site-1');
    assert.equal(r.redirect_to, '/login');
  });

  it('returns not_authenticated for empty string user_id', async () => {
    const r = await checkClientAccess('', 'site-1', { loadSite: loadSiteFound() });
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'not_authenticated');
  });
});

// ── Not authorized ───────────────────────────────────────────────────────────

describe('checkClientAccess — not_authorized', () => {
  it('returns not_authorized when user_id does not match', async () => {
    const r = await checkClientAccess('other-user', 'site-1', { loadSite: loadSiteFound() });
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'not_authorized');
  });

  it('redirects to /dashboard when not authorized', async () => {
    const r = await checkClientAccess('other-user', 'site-1', { loadSite: loadSiteFound() });
    assert.equal(r.redirect_to, '/dashboard');
  });
});

// ── Site not found ───────────────────────────────────────────────────────────

describe('checkClientAccess — site_not_found', () => {
  it('returns site_not_found when site missing', async () => {
    const r = await checkClientAccess('user-abc', 'nonexistent', { loadSite: loadSiteNull() });
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'site_not_found');
  });

  it('redirects to /dashboard when site not found', async () => {
    const r = await checkClientAccess('user-abc', 'nonexistent', { loadSite: loadSiteNull() });
    assert.equal(r.redirect_to, '/dashboard');
  });
});

// ── redirect_to always set on denial ─────────────────────────────────────────

describe('checkClientAccess — redirect always set', () => {
  it('redirect_to set for not_authenticated', async () => {
    const r = await checkClientAccess(null, 'x');
    assert.ok(r.redirect_to);
  });

  it('redirect_to set for not_authorized', async () => {
    const r = await checkClientAccess('wrong', 'site-1', { loadSite: loadSiteFound() });
    assert.ok(r.redirect_to);
  });

  it('redirect_to set for site_not_found', async () => {
    const r = await checkClientAccess('user-abc', 'x', { loadSite: loadSiteNull() });
    assert.ok(r.redirect_to);
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('checkClientAccess — never throws', () => {
  it('returns not_authenticated on loadSite error', async () => {
    const r = await checkClientAccess('user-abc', 'site-1', { loadSite: loadSiteThrows() as any });
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'not_authenticated');
  });

  it('handles missing deps gracefully', async () => {
    const r = await checkClientAccess('user-abc', 'site-1');
    assert.equal(r.allowed, false);
  });
});
