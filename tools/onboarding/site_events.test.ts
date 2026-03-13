/**
 * tools/onboarding/site_events.test.ts
 *
 * Tests for site events module.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordSiteEvent,
  hasSiteEvent,
  getSiteEvent,
  listSiteEvents,
  type SiteEvent,
  type SiteEventDeps,
} from './site_events.js';

// ── In-memory store for tests ───────────────────────────────────────────────

function makeStore() {
  const events: SiteEvent[] = [];
  const deps: SiteEventDeps = {
    insertFn: async (site_id, event_type, metadata) => {
      events.push({
        event_id: `evt-${events.length + 1}`,
        site_id,
        event_type: event_type as SiteEvent['event_type'],
        metadata,
        created_at: new Date().toISOString(),
      });
      return true;
    },
    queryFn: async (site_id, event_type) => {
      return events.find(e => e.site_id === site_id && e.event_type === event_type) ?? null;
    },
    listFn: async (site_id) => {
      return events.filter(e => e.site_id === site_id);
    },
  };
  return { events, deps };
}

// ── recordSiteEvent ─────────────────────────────────────────────────────────

describe('recordSiteEvent', () => {
  it('records an event', async () => {
    const { deps, events } = makeStore();
    const result = await recordSiteEvent('site-1', 'issues_viewed', {}, deps);
    assert.equal(result.ok, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, 'issues_viewed');
  });

  it('returns error for missing site_id', async () => {
    const result = await recordSiteEvent('', 'issues_viewed');
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  it('returns error for missing event_type', async () => {
    const result = await recordSiteEvent('site-1', '' as any);
    assert.equal(result.ok, false);
  });

  it('never throws on insert failure', async () => {
    const deps: SiteEventDeps = {
      insertFn: async () => { throw new Error('db down'); },
    };
    const result = await recordSiteEvent('site-1', 'issues_viewed', {}, deps);
    assert.equal(result.ok, false);
  });

  it('passes metadata through', async () => {
    const { deps, events } = makeStore();
    await recordSiteEvent('site-1', 'first_fix_applied', { fix_id: '123' }, deps);
    assert.deepEqual(events[0].metadata, { fix_id: '123' });
  });
});

// ── hasSiteEvent ────────────────────────────────────────────────────────────

describe('hasSiteEvent', () => {
  it('returns false when no events', async () => {
    const { deps } = makeStore();
    const has = await hasSiteEvent('site-1', 'issues_viewed', deps);
    assert.equal(has, false);
  });

  it('returns true after recording', async () => {
    const { deps } = makeStore();
    await recordSiteEvent('site-1', 'issues_viewed', {}, deps);
    const has = await hasSiteEvent('site-1', 'issues_viewed', deps);
    assert.equal(has, true);
  });

  it('returns false for different site', async () => {
    const { deps } = makeStore();
    await recordSiteEvent('site-1', 'issues_viewed', {}, deps);
    const has = await hasSiteEvent('site-2', 'issues_viewed', deps);
    assert.equal(has, false);
  });

  it('returns false for missing site_id', async () => {
    const has = await hasSiteEvent('', 'issues_viewed');
    assert.equal(has, false);
  });

  it('never throws on query failure', async () => {
    const deps: SiteEventDeps = {
      queryFn: async () => { throw new Error('db down'); },
    };
    const has = await hasSiteEvent('site-1', 'issues_viewed', deps);
    assert.equal(has, false);
  });
});

// ── getSiteEvent ────────────────────────────────────────────────────────────

describe('getSiteEvent', () => {
  it('returns null when not found', async () => {
    const { deps } = makeStore();
    const evt = await getSiteEvent('site-1', 'issues_viewed', deps);
    assert.equal(evt, null);
  });

  it('returns event when found', async () => {
    const { deps } = makeStore();
    await recordSiteEvent('site-1', 'gsc_connected', {}, deps);
    const evt = await getSiteEvent('site-1', 'gsc_connected', deps);
    assert.ok(evt);
    assert.equal(evt!.event_type, 'gsc_connected');
  });

  it('returns null for empty site_id', async () => {
    const evt = await getSiteEvent('', 'issues_viewed');
    assert.equal(evt, null);
  });

  it('never throws on failure', async () => {
    const deps: SiteEventDeps = {
      queryFn: async () => { throw new Error('db down'); },
    };
    const evt = await getSiteEvent('site-1', 'issues_viewed', deps);
    assert.equal(evt, null);
  });
});

// ── listSiteEvents ──────────────────────────────────────────────────────────

describe('listSiteEvents', () => {
  it('returns empty array when no events', async () => {
    const { deps } = makeStore();
    const list = await listSiteEvents('site-1', deps);
    assert.deepEqual(list, []);
  });

  it('returns events for site', async () => {
    const { deps } = makeStore();
    await recordSiteEvent('site-1', 'issues_viewed', {}, deps);
    await recordSiteEvent('site-1', 'gsc_connected', {}, deps);
    const list = await listSiteEvents('site-1', deps);
    assert.equal(list.length, 2);
  });

  it('filters by site_id', async () => {
    const { deps } = makeStore();
    await recordSiteEvent('site-1', 'issues_viewed', {}, deps);
    await recordSiteEvent('site-2', 'gsc_connected', {}, deps);
    const list = await listSiteEvents('site-1', deps);
    assert.equal(list.length, 1);
  });

  it('returns empty for missing site_id', async () => {
    const list = await listSiteEvents('');
    assert.deepEqual(list, []);
  });

  it('never throws on failure', async () => {
    const deps: SiteEventDeps = {
      listFn: async () => { throw new Error('db down'); },
    };
    const list = await listSiteEvents('site-1', deps);
    assert.deepEqual(list, []);
  });
});
