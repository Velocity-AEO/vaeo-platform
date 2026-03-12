import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgencyInvite,
  isInviteExpired,
  isInviteValid,
  getInviteStatusLabel,
  type AgencyInvite,
} from './agency_invite.js';

// ── buildAgencyInvite ─────────────────────────────────────────────────────────

describe('buildAgencyInvite', () => {
  it('sets expiry 7 days out', () => {
    const invite = buildAgencyInvite('ag1', 's1', 'bob@test.com');
    const expires = new Date(invite.expires_at);
    const now = Date.now();
    const diff = expires.getTime() - now;
    // Should be ~7 days (within 1 minute tolerance)
    assert.ok(diff > 6 * 24 * 60 * 60 * 1000);
    assert.ok(diff < 8 * 24 * 60 * 60 * 1000);
  });

  it('sets status to pending', () => {
    const invite = buildAgencyInvite('ag1', 's1', 'bob@test.com');
    assert.equal(invite.status, 'pending');
  });

  it('sets accepted_at to null', () => {
    const invite = buildAgencyInvite('ag1', 's1', 'bob@test.com');
    assert.equal(invite.accepted_at, null);
  });

  it('includes client_name when provided', () => {
    const invite = buildAgencyInvite('ag1', 's1', 'bob@test.com', 'Bob');
    assert.equal(invite.client_name, 'Bob');
  });

  it('sets client_name to null when not provided', () => {
    const invite = buildAgencyInvite('ag1', 's1', 'bob@test.com');
    assert.equal(invite.client_name, null);
  });

  it('generates invite_id', () => {
    const invite = buildAgencyInvite('ag1', 's1', 'bob@test.com');
    assert.ok(invite.invite_id.startsWith('inv_'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildAgencyInvite(null as any, null as any, null as any));
  });
});

// ── isInviteExpired ───────────────────────────────────────────────────────────

describe('isInviteExpired', () => {
  it('returns true for past expiry', () => {
    const invite: AgencyInvite = {
      invite_id: 'inv_1', agency_id: 'ag1', site_id: 's1',
      client_email: 'bob@test.com', client_name: null,
      invited_at: '2020-01-01T00:00:00Z',
      expires_at: '2020-01-08T00:00:00Z',
      accepted_at: null, status: 'pending',
    };
    assert.equal(isInviteExpired(invite), true);
  });

  it('returns true for expired status', () => {
    const invite: AgencyInvite = {
      invite_id: 'inv_1', agency_id: 'ag1', site_id: 's1',
      client_email: 'bob@test.com', client_name: null,
      invited_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      accepted_at: null, status: 'expired',
    };
    assert.equal(isInviteExpired(invite), true);
  });

  it('returns false for future expiry with pending status', () => {
    const invite = buildAgencyInvite('ag1', 's1', 'bob@test.com');
    assert.equal(isInviteExpired(invite), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isInviteExpired(null as any));
  });
});

// ── isInviteValid ─────────────────────────────────────────────────────────────

describe('isInviteValid', () => {
  it('returns true for valid pending invite', () => {
    const invite = buildAgencyInvite('ag1', 's1', 'bob@test.com');
    assert.equal(isInviteValid(invite), true);
  });

  it('returns false for expired invite', () => {
    const invite: AgencyInvite = {
      invite_id: 'inv_1', agency_id: 'ag1', site_id: 's1',
      client_email: 'bob@test.com', client_name: null,
      invited_at: '2020-01-01T00:00:00Z',
      expires_at: '2020-01-08T00:00:00Z',
      accepted_at: null, status: 'pending',
    };
    assert.equal(isInviteValid(invite), false);
  });

  it('returns false for accepted invite', () => {
    const invite = buildAgencyInvite('ag1', 's1', 'bob@test.com');
    invite.status = 'accepted';
    assert.equal(isInviteValid(invite), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isInviteValid(null as any));
  });
});

// ── getInviteStatusLabel ──────────────────────────────────────────────────────

describe('getInviteStatusLabel', () => {
  it('returns Pending for pending', () => {
    assert.equal(getInviteStatusLabel({ status: 'pending' } as AgencyInvite), 'Pending');
  });

  it('returns Accepted for accepted', () => {
    assert.equal(getInviteStatusLabel({ status: 'accepted' } as AgencyInvite), 'Accepted');
  });

  it('returns Expired for expired', () => {
    assert.equal(getInviteStatusLabel({ status: 'expired' } as AgencyInvite), 'Expired');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getInviteStatusLabel(null as any));
  });
});
