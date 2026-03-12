/**
 * tools/onboarding/site_registration.test.ts
 *
 * Tests for site registration — create site, connect Shopify, trigger crawl.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerSite,
  completeShopifyConnection,
  triggerFirstCrawl,
  type RegistrationDb,
} from './site_registration.js';

// ── Mock DB ───────────────────────────────────────────────────────────────────

function mockDb(options: {
  existing?: Record<string, unknown> | null;
  insertId?: string;
} = {}): { db: RegistrationDb; updates: Array<Record<string, unknown>>; inserts: Array<Record<string, unknown>[]> } {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>[]> = [];

  const db: RegistrationDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: options.existing ?? { extra_data: {} },
            error: null,
          }),
          maybeSingle: async () => ({
            data: options.existing ?? null,
            error: null,
          }),
        }),
      }),
      insert: (rows: Array<Record<string, unknown>>) => {
        inserts.push(rows);
        return {
          select: () => ({
            single: async () => ({
              data: { id: options.insertId ?? 'new-site-id' },
              error: null,
            }),
          }),
        };
      },
      update: (data: Record<string, unknown>) => {
        updates.push(data);
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
  return { db, updates, inserts };
}

function errorDb(): RegistrationDb {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => { throw new Error('DB down'); },
          maybeSingle: async () => { throw new Error('DB down'); },
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => { throw new Error('DB down'); },
        }),
      }),
      update: () => ({
        eq: async () => { throw new Error('DB down'); },
      }),
    }),
  };
}

// ── registerSite ──────────────────────────────────────────────────────────────

describe('registerSite', () => {
  it('creates new site and returns site_id', async () => {
    const { db } = mockDb({ insertId: 'abc-123' });
    const result = await registerSite({
      shop_domain: 'myshop.myshopify.com',
      tenant_id:   'tenant-1',
    }, db);
    assert.equal(result.ok, true);
    assert.equal(result.site_id, 'abc-123');
    assert.equal(result.already_exists, undefined);
  });

  it('returns already_exists when site exists', async () => {
    const { db } = mockDb({ existing: { id: 'existing-id' } });
    const result = await registerSite({
      shop_domain: 'myshop.myshopify.com',
      tenant_id:   'tenant-1',
    }, db);
    assert.equal(result.ok, true);
    assert.equal(result.already_exists, true);
    assert.equal(result.site_id, 'existing-id');
  });

  it('normalizes domain — strips protocol and trailing slash', async () => {
    const { db, inserts } = mockDb({ insertId: 'x' });
    await registerSite({
      shop_domain: 'https://MyShop.myshopify.com/',
      tenant_id:   'tenant-1',
    }, db);
    assert.equal(inserts[0]![0]!.site_url, 'https://myshop.myshopify.com');
  });

  it('sets platform to shopify', async () => {
    const { db, inserts } = mockDb({ insertId: 'x' });
    await registerSite({
      shop_domain: 'shop.com',
      tenant_id:   'tenant-1',
    }, db);
    assert.equal(inserts[0]![0]!.platform, 'shopify');
  });

  it('initializes onboarding in extra_data', async () => {
    const { db, inserts } = mockDb({ insertId: 'x' });
    await registerSite({
      shop_domain: 'shop.com',
      tenant_id:   'tenant-1',
    }, db);
    const extraData = inserts[0]![0]!.extra_data as Record<string, unknown>;
    const onboarding = extraData.onboarding as Record<string, unknown>;
    assert.equal(onboarding.current_step, 'connect_shopify');
    assert.ok(Array.isArray(onboarding.completed_steps));
  });

  it('returns error on DB failure', async () => {
    const result = await registerSite({
      shop_domain: 'shop.com',
      tenant_id:   'tenant-1',
    }, errorDb());
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  it('includes plan in extra_data', async () => {
    const { db, inserts } = mockDb({ insertId: 'x' });
    await registerSite({
      shop_domain: 'shop.com',
      tenant_id:   'tenant-1',
      plan:        'pro',
    }, db);
    const extraData = inserts[0]![0]!.extra_data as Record<string, unknown>;
    assert.equal(extraData.plan, 'pro');
  });
});

// ── completeShopifyConnection ─────────────────────────────────────────────────

describe('completeShopifyConnection', () => {
  it('stores access token in extra_data', async () => {
    const { db, updates } = mockDb();
    await completeShopifyConnection('site-1', 'shpat_xxx', db);
    assert.ok(updates.length >= 1);
    const firstUpdate = updates[0]!.extra_data as Record<string, unknown>;
    assert.equal(firstUpdate.shopify_access_token, 'shpat_xxx');
  });

  it('does not throw on DB error', async () => {
    await assert.doesNotReject(() =>
      completeShopifyConnection('site-1', 'tok', errorDb()),
    );
  });
});

// ── triggerFirstCrawl ─────────────────────────────────────────────────────────

describe('triggerFirstCrawl', () => {
  it('enqueues crawl job with priority 1', async () => {
    const jobs: Array<Record<string, unknown>> = [];
    const { db } = mockDb();
    const enqueue = async (job: Record<string, unknown>) => {
      jobs.push(job);
      return 'job-123';
    };
    const result = await triggerFirstCrawl('site-1', db, enqueue);
    assert.equal(result.job_id, 'job-123');
    assert.equal(jobs[0]!.type, 'crawl_site');
    assert.equal(jobs[0]!.priority, 1);
  });

  it('returns error when enqueue fails', async () => {
    const { db } = mockDb();
    const enqueue = async () => { throw new Error('Queue full'); };
    const result = await triggerFirstCrawl('site-1', db, enqueue);
    assert.ok(result.error);
    assert.ok(result.error!.includes('Queue full'));
  });

  it('returns job_id on success', async () => {
    const { db } = mockDb();
    const result = await triggerFirstCrawl('site-1', db, async () => 'crawl-456');
    assert.equal(result.job_id, 'crawl-456');
  });
});
