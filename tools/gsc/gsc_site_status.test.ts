import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGSCSiteStatus,
  getGSCStatusMessage,
  type GSCSiteStatus,
} from './gsc_site_status.js';

// ── buildGSCSiteStatus ────────────────────────────────────────────────────────

describe('buildGSCSiteStatus', () => {
  it('returns simulated when no property', () => {
    const result = buildGSCSiteStatus('s1', 'example.com', null, null);
    assert.equal(result.data_source, 'simulated');
    assert.equal(result.gsc_onboarded, false);
  });

  it('returns simulated when not verified', () => {
    const result = buildGSCSiteStatus('s1', 'example.com', {
      verified: false,
      account_id: 'acc_1',
      verified_at: null,
    }, null);
    assert.equal(result.data_source, 'simulated');
    assert.equal(result.gsc_onboarded, true);
    assert.equal(result.verified, false);
  });

  it('returns gsc_live when verified and synced', () => {
    const result = buildGSCSiteStatus('s1', 'example.com', {
      verified: true,
      account_id: 'acc_1',
      verified_at: '2026-01-01T00:00:00Z',
    }, {
      last_synced_at: '2026-03-10T00:00:00Z',
      ranking_count: 42,
    });
    assert.equal(result.data_source, 'gsc_live');
    assert.equal(result.verified, true);
    assert.equal(result.ranking_count, 42);
  });

  it('returns simulated when verified but no sync', () => {
    const result = buildGSCSiteStatus('s1', 'example.com', {
      verified: true,
      account_id: 'acc_1',
      verified_at: '2026-01-01T00:00:00Z',
    }, null);
    assert.equal(result.data_source, 'simulated');
    assert.equal(result.verified, true);
    assert.equal(result.last_synced_at, null);
  });

  it('includes site_id and domain', () => {
    const result = buildGSCSiteStatus('s1', 'example.com', null, null);
    assert.equal(result.site_id, 's1');
    assert.equal(result.domain, 'example.com');
  });

  it('includes account_id from property', () => {
    const result = buildGSCSiteStatus('s1', 'example.com', {
      verified: true,
      account_id: 'acc_42',
      verified_at: null,
    }, null);
    assert.equal(result.account_id, 'acc_42');
  });

  it('sets status_message automatically', () => {
    const result = buildGSCSiteStatus('s1', 'example.com', null, null);
    assert.ok(result.status_message.length > 0);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => buildGSCSiteStatus(null as any, null as any, null, null));
  });
});

// ── getGSCStatusMessage ───────────────────────────────────────────────────────

describe('getGSCStatusMessage', () => {
  it('returns setup message when not onboarded', () => {
    const msg = getGSCStatusMessage({
      gsc_onboarded: false, verified: false, last_synced_at: null, ranking_count: 0,
    } as GSCSiteStatus);
    assert.ok(msg.includes('setup'));
  });

  it('returns verifying message when onboarded but not verified', () => {
    const msg = getGSCStatusMessage({
      gsc_onboarded: true, verified: false, last_synced_at: null, ranking_count: 0,
    } as GSCSiteStatus);
    assert.ok(msg.includes('Verifying'));
  });

  it('returns syncing message when verified but no sync', () => {
    const msg = getGSCStatusMessage({
      gsc_onboarded: true, verified: true, last_synced_at: null, ranking_count: 0,
    } as GSCSiteStatus);
    assert.ok(msg.includes('syncing'));
  });

  it('returns live data message when verified and synced', () => {
    const msg = getGSCStatusMessage({
      gsc_onboarded: true, verified: true, last_synced_at: '2026-03-10', ranking_count: 100,
    } as GSCSiteStatus);
    assert.ok(msg.includes('Live GSC data'));
    assert.ok(msg.includes('100'));
  });

  it('includes keyword count in live message', () => {
    const msg = getGSCStatusMessage({
      gsc_onboarded: true, verified: true, last_synced_at: '2026-03-10', ranking_count: 55,
    } as GSCSiteStatus);
    assert.ok(msg.includes('55'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getGSCStatusMessage(null as any));
  });

  it('never throws on empty object', () => {
    assert.doesNotThrow(() => getGSCStatusMessage({} as any));
  });

  it('returns fallback for null input', () => {
    const msg = getGSCStatusMessage(null as any);
    assert.ok(msg.length > 0);
  });
});
