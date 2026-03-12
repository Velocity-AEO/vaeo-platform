/**
 * tools/agency/agency_roster.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRosterEntry,
  filterActiveRoster,
  getRosterByPlatform,
  searchRoster,
  getRosterSummary,
  loadAgencyRoster,
  type AgencyClientSite,
} from './agency_roster.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function entry(overrides?: Partial<AgencyClientSite>): AgencyClientSite {
  return {
    roster_id:    'rst_1',
    agency_id:    'ag_1',
    site_id:      'site_1',
    domain:       'example.com',
    platform:     'shopify',
    added_at:     new Date().toISOString(),
    active:       true,
    client_name:  'Acme Corp',
    client_email: 'acme@example.com',
    notes:        null,
    ...overrides,
  };
}

// ── buildRosterEntry ──────────────────────────────────────────────────────────

describe('buildRosterEntry', () => {
  it('sets agency_id', () => {
    const e = buildRosterEntry('ag_1', 's1', 'x.com', 'shopify');
    assert.equal(e.agency_id, 'ag_1');
  });

  it('sets site_id', () => {
    const e = buildRosterEntry('ag_1', 's1', 'x.com', 'shopify');
    assert.equal(e.site_id, 's1');
  });

  it('sets domain', () => {
    const e = buildRosterEntry('ag_1', 's1', 'x.com', 'shopify');
    assert.equal(e.domain, 'x.com');
  });

  it('sets platform', () => {
    const e = buildRosterEntry('ag_1', 's1', 'x.com', 'wordpress');
    assert.equal(e.platform, 'wordpress');
  });

  it('sets active=true', () => {
    const e = buildRosterEntry('ag_1', 's1', 'x.com', 'shopify');
    assert.equal(e.active, true);
  });

  it('sets client_name when provided', () => {
    const e = buildRosterEntry('ag_1', 's1', 'x.com', 'shopify', 'My Client');
    assert.equal(e.client_name, 'My Client');
  });

  it('client_name is null when not provided', () => {
    const e = buildRosterEntry('ag_1', 's1', 'x.com', 'shopify');
    assert.equal(e.client_name, null);
  });

  it('sets client_email when provided', () => {
    const e = buildRosterEntry('ag_1', 's1', 'x.com', 'shopify', 'N', 'c@x.com');
    assert.equal(e.client_email, 'c@x.com');
  });

  it('roster_id starts with rst_', () => {
    const e = buildRosterEntry('ag_1', 's1', 'x.com', 'shopify');
    assert.ok(e.roster_id.startsWith('rst_'));
  });

  it('notes is null by default', () => {
    const e = buildRosterEntry('ag_1', 's1', 'x.com', 'shopify');
    assert.equal(e.notes, null);
  });

  it('never throws', () => {
    assert.doesNotThrow(() =>
      buildRosterEntry(null as never, null as never, null as never, null as never),
    );
  });
});

// ── filterActiveRoster ────────────────────────────────────────────────────────

describe('filterActiveRoster', () => {
  it('returns only active entries', () => {
    const roster = [entry({ active: true }), entry({ active: false, roster_id: 'r2' })];
    assert.equal(filterActiveRoster(roster).length, 1);
  });

  it('excludes inactive entries', () => {
    const roster = [entry({ active: false })];
    assert.equal(filterActiveRoster(roster).length, 0);
  });

  it('returns all when all active', () => {
    const roster = [entry(), entry({ roster_id: 'r2' })];
    assert.equal(filterActiveRoster(roster).length, 2);
  });

  it('returns empty array on empty input', () => {
    assert.deepEqual(filterActiveRoster([]), []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => filterActiveRoster(null as never));
  });
});

// ── getRosterByPlatform ───────────────────────────────────────────────────────

describe('getRosterByPlatform', () => {
  it('filters shopify entries', () => {
    const roster = [
      entry({ platform: 'shopify', roster_id: 'r1' }),
      entry({ platform: 'wordpress', roster_id: 'r2' }),
    ];
    assert.equal(getRosterByPlatform(roster, 'shopify').length, 1);
  });

  it('filters wordpress entries', () => {
    const roster = [
      entry({ platform: 'shopify', roster_id: 'r1' }),
      entry({ platform: 'wordpress', roster_id: 'r2' }),
      entry({ platform: 'wordpress', roster_id: 'r3' }),
    ];
    assert.equal(getRosterByPlatform(roster, 'wordpress').length, 2);
  });

  it('returns empty when no match', () => {
    const roster = [entry({ platform: 'shopify' })];
    assert.equal(getRosterByPlatform(roster, 'wordpress').length, 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getRosterByPlatform(null as never, 'shopify'));
  });
});

// ── searchRoster ──────────────────────────────────────────────────────────────

describe('searchRoster', () => {
  it('finds by domain', () => {
    const roster = [entry({ domain: 'mystore.com' }), entry({ domain: 'other.com', roster_id: 'r2' })];
    assert.equal(searchRoster(roster, 'mystore').length, 1);
  });

  it('finds by client_name', () => {
    const roster = [
      entry({ client_name: 'Acme Corp', roster_id: 'r1' }),
      entry({ client_name: 'Foo Inc', roster_id: 'r2' }),
    ];
    assert.equal(searchRoster(roster, 'Acme').length, 1);
  });

  it('is case-insensitive for domain', () => {
    const roster = [entry({ domain: 'MyStore.COM' })];
    assert.equal(searchRoster(roster, 'mystore').length, 1);
  });

  it('is case-insensitive for client_name', () => {
    const roster = [entry({ client_name: 'ACME CORP' })];
    assert.equal(searchRoster(roster, 'acme').length, 1);
  });

  it('returns all when query is empty', () => {
    const roster = [entry(), entry({ roster_id: 'r2' })];
    assert.equal(searchRoster(roster, '').length, 2);
  });

  it('returns empty when no match', () => {
    const roster = [entry({ domain: 'x.com', client_name: 'X Corp' })];
    assert.equal(searchRoster(roster, 'zzz').length, 0);
  });

  it('never throws on null roster', () => {
    assert.doesNotThrow(() => searchRoster(null as never, 'q'));
  });
});

// ── getRosterSummary ──────────────────────────────────────────────────────────

describe('getRosterSummary', () => {
  it('total equals array length', () => {
    const s = getRosterSummary([entry(), entry({ roster_id: 'r2' })]);
    assert.equal(s.total, 2);
  });

  it('counts active correctly', () => {
    const s = getRosterSummary([entry({ active: true }), entry({ roster_id: 'r2', active: false })]);
    assert.equal(s.active, 1);
  });

  it('counts shopify correctly', () => {
    const s = getRosterSummary([
      entry({ platform: 'shopify', roster_id: 'r1' }),
      entry({ platform: 'wordpress', roster_id: 'r2' }),
    ]);
    assert.equal(s.shopify, 1);
    assert.equal(s.wordpress, 1);
  });

  it('all zeros on empty', () => {
    const s = getRosterSummary([]);
    assert.deepEqual(s, { total: 0, active: 0, shopify: 0, wordpress: 0 });
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getRosterSummary(null as never));
  });
});

// ── loadAgencyRoster ──────────────────────────────────────────────────────────

describe('loadAgencyRoster', () => {
  it('returns roster from loadFn', async () => {
    const list = await loadAgencyRoster('ag_1', {
      loadFn: async () => [entry()],
    });
    assert.equal(list.length, 1);
  });

  it('returns [] on error', async () => {
    const list = await loadAgencyRoster('ag_1', {
      loadFn: async () => { throw new Error('db fail'); },
    });
    assert.deepEqual(list, []);
  });

  it('never throws when loadFn throws', async () => {
    await assert.doesNotReject(() =>
      loadAgencyRoster('ag_1', { loadFn: async () => { throw new Error('X'); } }),
    );
  });
});
