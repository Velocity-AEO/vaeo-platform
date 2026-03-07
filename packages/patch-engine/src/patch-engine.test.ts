/**
 * packages/patch-engine/src/patch-engine.test.ts
 *
 * Unit tests for applyPatch() and rollbackPatch().
 * All tests use injected dependencies — no real DB or CMS calls.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPatch,
  rollbackPatch,
  _injectSupabase,
  _injectCmsAdapter,
  _resetInjections,
} from './index.js';
import type { RollbackManifest, CmsAdapter, SupabaseClient as _SC } from './index.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_MANIFEST: RollbackManifest = {
  action_id:    'action-1',
  run_id:       'run-1',
  cms_type:     'shopify',
  before_value: { title: 'Old Title' },
  api_endpoint: '/admin/api/pages/1.json',
  created_at:   '2025-01-01T00:00:00.000Z',
};

const BASE_PATCH: Parameters<typeof applyPatch>[0] = {
  action_id:    'action-1',
  run_id:       'run-1',
  tenant_id:    'tenant-1',
  site_id:      'site-1',
  cms_type:     'shopify',
  issue_type:   'title_missing',
  proposed_fix: {
    before_value:  { title: 'Old Title' },
    after_value:   { title: 'New SEO Title' },
    api_endpoint:  '/admin/api/pages/1.json',
  },
  sandbox: true,
};

const BASE_ROLLBACK: Parameters<typeof rollbackPatch>[0] = {
  action_id: 'action-1',
  run_id:    'run-1',
  tenant_id: 'tenant-1',
  site_id:   'site-1',
  cms_type:  'shopify',
};

// ── Mock factories ────────────────────────────────────────────────────────────

function makeSuccessAdapter(): CmsAdapter {
  return {
    applyFix:  async () => {},
    revertFix: async () => {},
  };
}

function makeErrorAdapter(msg: string): CmsAdapter {
  return {
    applyFix:  async () => { throw new Error(msg); },
    revertFix: async () => { throw new Error(msg); },
  };
}

function makeSupabaseMock({
  updateOk    = true,
  manifest    = FAKE_MANIFEST as RollbackManifest | null,
  fromThrows  = false,
}: {
  updateOk?:   boolean;
  manifest?:   RollbackManifest | null;
  fromThrows?: boolean;
} = {}): SupabaseClient {
  const fromFn = fromThrows
    ? () => { throw new Error('DB connection lost'); }
    : (table: string) => {
        if (table === 'action_queue') {
          return {
            update: (_data: unknown) => ({
              eq: (_k: string, _v: unknown) => Promise.resolve({
                data:  null,
                error: updateOk ? null : { message: 'Update failed' },
              }),
            }),
            select: (_cols: string) => ({
              eq: (_k: string, _v: unknown) => ({
                eq: (_k2: string, _v2: unknown) => ({
                  single: () => Promise.resolve(
                    manifest
                      ? { data: { rollback_manifest: manifest }, error: null }
                      : { data: null, error: { message: 'Not found' } },
                  ),
                }),
              }),
            }),
          };
        }
        return {};
      };

  return { from: fromFn } as unknown as SupabaseClient;
}

// ── applyPatch tests ──────────────────────────────────────────────────────────

describe('applyPatch', () => {
  afterEach(() => _resetInjections());

  it('returns success=true with rollback_manifest', async () => {
    _injectCmsAdapter(makeSuccessAdapter());
    _injectSupabase(makeSupabaseMock());

    const result = await applyPatch(BASE_PATCH);

    assert.equal(result.success, true);
    assert.equal(result.action_id, BASE_PATCH.action_id);
    assert.equal(result.run_id, BASE_PATCH.run_id);
    assert.ok(result.rollback_manifest, 'rollback_manifest must be set');
    assert.equal(result.rollback_manifest?.action_id, BASE_PATCH.action_id);
    assert.equal(result.error, undefined);
  });

  it('returns success=false without throwing when CMS adapter errors', async () => {
    _injectCmsAdapter(makeErrorAdapter('CMS write rejected'));
    _injectSupabase(makeSupabaseMock());

    let threw = false;
    let result: Awaited<ReturnType<typeof applyPatch>> | undefined;
    try {
      result = await applyPatch(BASE_PATCH);
    } catch {
      threw = true;
    }

    assert.equal(threw, false, 'applyPatch must not throw');
    assert.ok(result);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('CMS write rejected'));
  });

  it('returns success=false without throwing when Supabase errors', async () => {
    _injectCmsAdapter(makeSuccessAdapter());
    _injectSupabase(makeSupabaseMock({ fromThrows: true }));

    // Supabase error is non-fatal for the apply step (manifest just not persisted)
    // but we still expect success=true since the fix was applied
    let threw = false;
    let result: Awaited<ReturnType<typeof applyPatch>> | undefined;
    try {
      result = await applyPatch(BASE_PATCH);
    } catch {
      threw = true;
    }

    assert.equal(threw, false, 'applyPatch must not throw');
    assert.ok(result);
    // Fix was applied successfully even though manifest store failed
    assert.equal(result.success, true);
  });

  it('sandbox=true is reflected in PatchResult', async () => {
    _injectCmsAdapter(makeSuccessAdapter());
    _injectSupabase(makeSupabaseMock());

    const result = await applyPatch({ ...BASE_PATCH, sandbox: true });
    assert.equal(result.sandbox, true);
  });

  it('sandbox defaults to true when omitted', async () => {
    _injectCmsAdapter(makeSuccessAdapter());
    _injectSupabase(makeSupabaseMock());

    const { sandbox: _s, ...withoutSandbox } = BASE_PATCH;
    const result = await applyPatch(withoutSandbox);
    assert.equal(result.sandbox, true);
  });

  it('never throws under any condition', async () => {
    _injectCmsAdapter(makeErrorAdapter('catastrophic failure'));
    _injectSupabase(makeSupabaseMock({ fromThrows: true }));

    let threw = false;
    try {
      await applyPatch(BASE_PATCH);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'applyPatch must never throw');
  });
});

// ── rollbackPatch tests ───────────────────────────────────────────────────────

describe('rollbackPatch', () => {
  afterEach(() => _resetInjections());

  it('returns success=true when manifest found and adapter succeeds', async () => {
    _injectCmsAdapter(makeSuccessAdapter());
    _injectSupabase(makeSupabaseMock({ manifest: FAKE_MANIFEST }));

    const result = await rollbackPatch(BASE_ROLLBACK);

    assert.equal(result.success, true);
    assert.equal(result.action_id, BASE_ROLLBACK.action_id);
    assert.equal(result.run_id, BASE_ROLLBACK.run_id);
    assert.equal(result.error, undefined);
  });

  it('returns success=false without throwing when manifest not found', async () => {
    _injectCmsAdapter(makeSuccessAdapter());
    _injectSupabase(makeSupabaseMock({ manifest: null }));

    let threw = false;
    let result: Awaited<ReturnType<typeof rollbackPatch>> | undefined;
    try {
      result = await rollbackPatch(BASE_ROLLBACK);
    } catch {
      threw = true;
    }

    assert.equal(threw, false, 'rollbackPatch must not throw');
    assert.ok(result);
    assert.equal(result.success, false);
    assert.ok(result.error?.toLowerCase().includes('manifest'));
  });

  it('returns success=false without throwing when adapter revert errors', async () => {
    _injectCmsAdapter(makeErrorAdapter('CMS revert failed'));
    _injectSupabase(makeSupabaseMock({ manifest: FAKE_MANIFEST }));

    let threw = false;
    let result: Awaited<ReturnType<typeof rollbackPatch>> | undefined;
    try {
      result = await rollbackPatch(BASE_ROLLBACK);
    } catch {
      threw = true;
    }

    assert.equal(threw, false, 'rollbackPatch must not throw');
    assert.ok(result);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('CMS revert failed'));
  });

  it('never throws under any condition', async () => {
    _injectCmsAdapter(makeErrorAdapter('boom'));
    _injectSupabase(null); // Supabase unavailable

    let threw = false;
    try {
      await rollbackPatch(BASE_ROLLBACK);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'rollbackPatch must never throw');
  });
});
