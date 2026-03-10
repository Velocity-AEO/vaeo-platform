/**
 * app/api/tenants/me/handler.test.ts
 *
 * Unit tests for handleGetTenant() and handleEnsureTenant().
 * No real DB calls — deps are inline fakes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGetTenant,
  handleEnsureTenant,
  type TenantRow,
  type TenantDeps,
} from './handler.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-0001';

const EXISTING_TENANT: TenantRow = {
  id:            'tenant-uuid-0001',
  name:          'Acme Corp',
  owner_user_id: USER_ID,
  plan:          'starter',
  created_at:    '2026-01-01T00:00:00.000Z',
};

function makeDeps(overrides: Partial<TenantDeps> = {}): TenantDeps {
  return {
    getTenantByUserId: async () => null,
    createTenant:      async (userId, name) => ({
      id:            'new-tenant-uuid',
      name,
      owner_user_id: userId,
      plan:          'starter',
      created_at:    new Date().toISOString(),
    }),
    ...overrides,
  };
}

// ── handleGetTenant ───────────────────────────────────────────────────────────

describe('handleGetTenant', () => {
  it('tenant exists → ok=true, status=200, tenant returned', async () => {
    const r = await handleGetTenant(USER_ID, makeDeps({ getTenantByUserId: async () => EXISTING_TENANT }));
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
    assert.deepEqual(r.tenant, EXISTING_TENANT);
  });

  it('no tenant → ok=false, status=404', async () => {
    const r = await handleGetTenant(USER_ID, makeDeps());
    assert.equal(r.ok, false);
    assert.equal(r.status, 404);
    assert.ok(r.error?.includes('not found') || r.error?.includes('No tenant'));
  });

  it('getTenantByUserId throws → ok=false, status=500, error message propagated', async () => {
    const r = await handleGetTenant(
      USER_ID,
      makeDeps({ getTenantByUserId: async () => { throw new Error('DB timeout'); } }),
    );
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
    assert.ok(r.error?.includes('DB timeout'));
  });
});

// ── handleEnsureTenant ────────────────────────────────────────────────────────

describe('handleEnsureTenant', () => {
  it('existing tenant → returns it, created=false, status=200', async () => {
    const r = await handleEnsureTenant(
      USER_ID,
      'New Name',
      makeDeps({ getTenantByUserId: async () => EXISTING_TENANT }),
    );
    assert.equal(r.ok, true);
    assert.equal(r.created, false);
    assert.equal(r.status, 200);
    assert.deepEqual(r.tenant, EXISTING_TENANT);
  });

  it('no existing tenant → creates one, created=true, status=201', async () => {
    const r = await handleEnsureTenant(USER_ID, 'My Agency', makeDeps());
    assert.equal(r.ok, true);
    assert.equal(r.created, true);
    assert.equal(r.status, 201);
    assert.equal(r.tenant?.name, 'My Agency');
    assert.equal(r.tenant?.owner_user_id, USER_ID);
  });

  it('empty name → defaults to "My Workspace"', async () => {
    const r = await handleEnsureTenant(USER_ID, '', makeDeps());
    assert.equal(r.ok, true);
    assert.equal(r.tenant?.name, 'My Workspace');
  });

  it('whitespace-only name → defaults to "My Workspace"', async () => {
    const r = await handleEnsureTenant(USER_ID, '   ', makeDeps());
    assert.equal(r.tenant?.name, 'My Workspace');
  });

  it('new tenant has correct owner_user_id', async () => {
    const r = await handleEnsureTenant(USER_ID, 'Test Co', makeDeps());
    assert.equal(r.tenant?.owner_user_id, USER_ID);
  });

  it('getTenantByUserId throws → ok=false, created=false, status=500', async () => {
    const r = await handleEnsureTenant(
      USER_ID,
      'Test',
      makeDeps({ getTenantByUserId: async () => { throw new Error('Connection lost'); } }),
    );
    assert.equal(r.ok, false);
    assert.equal(r.created, false);
    assert.equal(r.status, 500);
  });

  it('createTenant throws → ok=false, status=500', async () => {
    const r = await handleEnsureTenant(
      USER_ID,
      'Test',
      makeDeps({ createTenant: async () => { throw new Error('Insert failed'); } }),
    );
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
    assert.ok(r.error?.includes('Insert failed'));
  });

  it('created tenant has plan=starter', async () => {
    const r = await handleEnsureTenant(USER_ID, 'Agency', makeDeps());
    assert.equal(r.tenant?.plan, 'starter');
  });
});
