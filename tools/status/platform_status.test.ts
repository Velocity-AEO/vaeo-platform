import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlatformStatus,
  getStatusBadgeColor,
  MONITORED_SERVICES,
  type StatusLevel,
  type PlatformStatus,
} from './platform_status.js';

// ── MONITORED_SERVICES ────────────────────────────────────────────────────────

describe('MONITORED_SERVICES', () => {
  it('contains at least 5 entries', () => {
    assert.ok(MONITORED_SERVICES.length >= 5);
  });

  it('includes Dashboard', () => {
    assert.ok(MONITORED_SERVICES.includes('Dashboard'));
  });

  it('includes Fix Engine', () => {
    assert.ok(MONITORED_SERVICES.includes('Fix Engine'));
  });
});

// ── getStatusBadgeColor ───────────────────────────────────────────────────────

describe('getStatusBadgeColor', () => {
  it('returns green for operational', () => {
    assert.equal(getStatusBadgeColor('operational'), 'green');
  });

  it('returns yellow for degraded', () => {
    assert.equal(getStatusBadgeColor('degraded'), 'yellow');
  });

  it('returns red for down', () => {
    assert.equal(getStatusBadgeColor('down'), 'red');
  });

  it('returns blue for maintenance', () => {
    assert.equal(getStatusBadgeColor('maintenance'), 'blue');
  });

  it('returns grey for unknown', () => {
    assert.equal(getStatusBadgeColor('bogus' as StatusLevel), 'grey');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getStatusBadgeColor(null as any));
  });
});

// ── buildPlatformStatus ───────────────────────────────────────────────────────

describe('buildPlatformStatus', () => {
  it('returns operational when no overrides', () => {
    const result = buildPlatformStatus();
    assert.equal(result.overall, 'operational');
  });

  it('includes all monitored services', () => {
    const result = buildPlatformStatus();
    assert.equal(result.services.length, MONITORED_SERVICES.length);
  });

  it('sets overall to down when any service is down', () => {
    const result = buildPlatformStatus({ 'Dashboard': 'down' });
    assert.equal(result.overall, 'down');
  });

  it('sets overall to degraded when any service is degraded', () => {
    const result = buildPlatformStatus({ 'API': 'degraded' });
    assert.equal(result.overall, 'degraded');
  });

  it('sets overall to maintenance when only maintenance', () => {
    const result = buildPlatformStatus({ 'Billing': 'maintenance' });
    assert.equal(result.overall, 'maintenance');
  });

  it('down takes priority over degraded', () => {
    const result = buildPlatformStatus({
      'Dashboard': 'degraded',
      'API': 'down',
    });
    assert.equal(result.overall, 'down');
  });

  it('includes checked_at timestamp', () => {
    const result = buildPlatformStatus();
    assert.ok(result.checked_at);
    assert.ok(result.checked_at.includes('T'));
  });

  it('includes human-readable message', () => {
    const result = buildPlatformStatus();
    assert.ok(result.message.includes('operational'));
  });

  it('service description mentions service name', () => {
    const result = buildPlatformStatus({ 'Dashboard': 'degraded' });
    const dashboard = result.services.find((s) => s.name === 'Dashboard');
    assert.ok(dashboard);
    assert.ok(dashboard!.description.includes('Dashboard'));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildPlatformStatus(null as any));
  });
});
