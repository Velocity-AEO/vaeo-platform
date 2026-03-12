/**
 * tools/security/api_security.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySecurityChecks,
  SECURITY_PRESETS,
  type SecurityConfig,
  type SecurityRequest,
} from './api_security.ts';
import { createInMemoryStore } from './rate_limiter.ts';
import type { RateLimitConfig } from './rate_limiter.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function req(overrides: Partial<SecurityRequest> = {}): SecurityRequest {
  return {
    ip:        '1.2.3.4',
    headers:   {},
    body:      {},
    query:     {},
    tenant_id: 'tenant-1',
    ...overrides,
  };
}

const TIGHT_LIMIT: RateLimitConfig = {
  window_ms:    60_000,
  max_requests: 2,
  key_prefix:   'rl:test',
};

// ── rate limiting ─────────────────────────────────────────────────────────────

describe('rate limiting', () => {
  it('allows requests within limit', async () => {
    const store = createInMemoryStore();
    const cfg: SecurityConfig = { rate_limit: TIGHT_LIMIT };
    const r = await applySecurityChecks(req(), cfg, { store });
    assert.equal(r.ok, true);
  });

  it('blocks when rate limit exceeded', async () => {
    const store = createInMemoryStore();
    const cfg: SecurityConfig = { rate_limit: TIGHT_LIMIT };
    // Exhaust the limit
    await applySecurityChecks(req(), cfg, { store });
    await applySecurityChecks(req(), cfg, { store });
    const r = await applySecurityChecks(req(), cfg, { store });
    assert.equal(r.ok, false);
    assert.equal(r.status, 429);
    assert.ok(r.error!.includes('Rate limit'));
  });

  it('skips rate limit check when no store provided', async () => {
    const cfg: SecurityConfig = { rate_limit: TIGHT_LIMIT };
    // No store → skip check entirely → allowed
    const r = await applySecurityChecks(req(), cfg, {});
    assert.equal(r.ok, true);
  });

  it('falls back to tenant_id as identifier when no ip', async () => {
    const store = createInMemoryStore();
    const cfg: SecurityConfig = { rate_limit: TIGHT_LIMIT };
    const r = await applySecurityChecks(req({ ip: undefined }), cfg, { store });
    assert.equal(r.ok, true);
  });
});

// ── auth check ────────────────────────────────────────────────────────────────

describe('auth check', () => {
  it('returns 401 when no Authorization header', async () => {
    const cfg: SecurityConfig = { require_auth: true };
    const r = await applySecurityChecks(req({ headers: {} }), cfg);
    assert.equal(r.ok, false);
    assert.equal(r.status, 401);
  });

  it('passes when Authorization header present', async () => {
    const cfg: SecurityConfig = { require_auth: true };
    const r = await applySecurityChecks(req({ headers: { authorization: 'Bearer token123' } }), cfg);
    assert.equal(r.ok, true);
  });

  it('accepts x-api-key header as auth', async () => {
    const cfg: SecurityConfig = { require_auth: true };
    const r = await applySecurityChecks(req({ headers: { 'x-api-key': 'key123' } }), cfg);
    assert.equal(r.ok, true);
  });

  it('returns 401 for empty Authorization value', async () => {
    const cfg: SecurityConfig = { require_auth: true };
    const r = await applySecurityChecks(req({ headers: { authorization: '   ' } }), cfg);
    assert.equal(r.ok, false);
    assert.equal(r.status, 401);
  });
});

// ── body validation ───────────────────────────────────────────────────────────

describe('body validation', () => {
  it('returns 400 on invalid body', async () => {
    const cfg: SecurityConfig = {
      validate_body: { site_id: { type: 'uuid', required: true } },
    };
    const r = await applySecurityChecks(req({ body: { site_id: 'not-a-uuid' } }), cfg);
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.ok(r.error!.includes('Validation failed'));
  });

  it('returns sanitized_body on valid input', async () => {
    const cfg: SecurityConfig = {
      validate_body: { site_id: { type: 'uuid', required: true } },
    };
    const r = await applySecurityChecks(
      req({ body: { site_id: '550e8400-e29b-41d4-a716-446655440000' } }),
      cfg,
    );
    assert.equal(r.ok, true);
    assert.ok(r.sanitized_body);
    assert.ok('site_id' in r.sanitized_body!);
  });

  it('sanitizes body content when sanitize=true', async () => {
    const cfg: SecurityConfig = {
      validate_body: { name: { type: 'string', sanitize: true } },
    };
    const r = await applySecurityChecks(req({ body: { name: '<b>hello</b>' } }), cfg);
    assert.equal(r.ok, true);
    assert.equal(r.sanitized_body?.['name'], 'hello');
  });
});

// ── query validation ──────────────────────────────────────────────────────────

describe('query validation', () => {
  it('returns 400 on invalid query', async () => {
    const cfg: SecurityConfig = {
      validate_query: { limit: { type: 'number', min: 1, max: 100 } },
    };
    const r = await applySecurityChecks(req({ query: { limit: 9999 } }), cfg);
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  });

  it('returns sanitized_query on valid query', async () => {
    const cfg: SecurityConfig = {
      validate_query: { limit: { type: 'number', min: 1, max: 100 } },
    };
    const r = await applySecurityChecks(req({ query: { limit: 50 } }), cfg);
    assert.equal(r.ok, true);
    assert.equal(r.sanitized_query?.['limit'], 50);
  });
});

// ── audit logging ─────────────────────────────────────────────────────────────

describe('audit logging', () => {
  it('logs success event when log_audit=true', async () => {
    const events: unknown[] = [];
    const fakeDb = {
      from: () => ({
        insert: (row: unknown) => {
          events.push(row);
          return { select: () => ({ maybeSingle: async () => ({ data: { id: 'e1' }, error: null }) }) };
        },
      }),
    };
    const cfg: SecurityConfig = {
      log_audit:           true,
      audit_action:        'site.created',
      audit_resource_type: 'site',
    };
    const r = await applySecurityChecks(req(), cfg, { db: fakeDb });
    assert.equal(r.ok, true);
    assert.equal(events.length, 1);
  });

  it('skips audit when log_audit=false', async () => {
    const events: unknown[] = [];
    const fakeDb = {
      from: () => ({
        insert: (row: unknown) => { events.push(row); return { select: () => ({ maybeSingle: async () => ({ data: { id: 'e1' }, error: null }) }) }; },
      }),
    };
    const cfg: SecurityConfig = { log_audit: false };
    await applySecurityChecks(req(), cfg, { db: fakeDb });
    assert.equal(events.length, 0);
  });
});

// ── SECURITY_PRESETS ──────────────────────────────────────────────────────────

describe('SECURITY_PRESETS', () => {
  it('PUBLIC_READ does not require auth', () => {
    assert.equal(SECURITY_PRESETS['PUBLIC_READ']!.require_auth, false);
  });

  it('AUTHENTICATED_WRITE requires auth', () => {
    assert.equal(SECURITY_PRESETS['AUTHENTICATED_WRITE']!.require_auth, true);
  });

  it('CRAWL_TRIGGER uses api_crawl rate limit', () => {
    assert.equal(SECURITY_PRESETS['CRAWL_TRIGGER']!.rate_limit?.max_requests, 5);
  });

  it('EXPORT uses api_export rate limit', () => {
    assert.equal(SECURITY_PRESETS['EXPORT']!.rate_limit?.max_requests, 20);
  });

  it('never throws when called with null db', async () => {
    await assert.doesNotReject(() =>
      applySecurityChecks(req({ headers: { authorization: 'Bearer x' } }), SECURITY_PRESETS['AUTHENTICATED_WRITE']!, { db: null }),
    );
  });
});
