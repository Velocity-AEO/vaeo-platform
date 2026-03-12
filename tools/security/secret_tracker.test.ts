/**
 * tools/security/secret_tracker.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VAEO_SECRETS,
  getRotationStatus,
  generateRotationReport,
  type SecretEntry,
} from './secret_tracker.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REF = new Date('2026-03-11T00:00:00.000Z');

function makeSecret(overrides: Partial<SecretEntry>): SecretEntry {
  return {
    name:                   'TEST_SECRET',
    provider:               'doppler',
    rotation_interval_days: 90,
    is_overdue:             false,
    days_until_rotation:    45,
    description:            'test secret',
    ...overrides,
  };
}

// ── VAEO_SECRETS ──────────────────────────────────────────────────────────────

describe('VAEO_SECRETS', () => {
  it('contains all 7 required secrets', () => {
    const names = VAEO_SECRETS.map((s) => s.name);
    assert.ok(names.includes('ANTHROPIC_API_KEY'));
    assert.ok(names.includes('SHOPIFY_API_SECRET'));
    assert.ok(names.includes('SUPABASE_SERVICE_ROLE_KEY'));
    assert.ok(names.includes('NEXTAUTH_SECRET'));
    assert.ok(names.includes('STRIPE_SECRET_KEY'));
    assert.ok(names.includes('GOOGLE_CLIENT_SECRET'));
    assert.ok(names.includes('DATABASE_URL'));
    assert.equal(VAEO_SECRETS.length, 7);
  });

  it('ANTHROPIC_API_KEY has 90-day rotation interval', () => {
    const s = VAEO_SECRETS.find((s) => s.name === 'ANTHROPIC_API_KEY')!;
    assert.equal(s.rotation_interval_days, 90);
  });

  it('SHOPIFY_API_SECRET has 180-day rotation interval', () => {
    const s = VAEO_SECRETS.find((s) => s.name === 'SHOPIFY_API_SECRET')!;
    assert.equal(s.rotation_interval_days, 180);
  });

  it('DATABASE_URL has 365-day rotation interval', () => {
    const s = VAEO_SECRETS.find((s) => s.name === 'DATABASE_URL')!;
    assert.equal(s.rotation_interval_days, 365);
  });

  it('all secrets have provider set', () => {
    for (const s of VAEO_SECRETS) {
      assert.ok(['doppler', 'env', 'supabase'].includes(s.provider), `${s.name} has invalid provider`);
    }
  });

  it('SUPABASE_SERVICE_ROLE_KEY has provider=supabase', () => {
    const s = VAEO_SECRETS.find((s) => s.name === 'SUPABASE_SERVICE_ROLE_KEY')!;
    assert.equal(s.provider, 'supabase');
  });
});

// ── getRotationStatus ─────────────────────────────────────────────────────────

describe('getRotationStatus', () => {
  it('marks secret overdue when last_rotated + interval < referenceDate', () => {
    const s = makeSecret({ last_rotated: '2025-01-01' }); // >90 days before REF
    const r = getRotationStatus([s], REF);
    assert.equal(r.overdue.length, 1);
    assert.equal(r.due_soon.length, 0);
    assert.equal(r.ok.length, 0);
  });

  it('marks secret due_soon when within 30 days of rotation', () => {
    // 90-day interval; rotated 70 days before REF → 20 days until next rotation
    const rotatedAt = new Date(REF.getTime() - 70 * 86_400_000).toISOString().slice(0, 10);
    const s = makeSecret({ last_rotated: rotatedAt, name: 'ANTHROPIC_API_KEY' });
    const r = getRotationStatus([s], REF);
    assert.equal(r.due_soon.length, 1);
    assert.equal(r.overdue.length, 0);
  });

  it('marks secret ok when rotation is >30 days away', () => {
    // Rotated yesterday → 89 days until next rotation
    const rotatedAt = new Date(REF.getTime() - 86_400_000).toISOString().slice(0, 10);
    const s = makeSecret({ last_rotated: rotatedAt, name: 'ANTHROPIC_API_KEY' });
    const r = getRotationStatus([s], REF);
    assert.equal(r.ok.length, 1);
    assert.equal(r.overdue.length, 0);
    assert.equal(r.due_soon.length, 0);
  });

  it('marks secret overdue when never rotated (no last_rotated)', () => {
    const s = makeSecret({ last_rotated: undefined });
    const r = getRotationStatus([s], REF);
    assert.equal(r.overdue.length, 1);
  });

  it('produces correct summary string', () => {
    const overdue = makeSecret({ name: 'ANTHROPIC_API_KEY', last_rotated: '2020-01-01' });
    const ok = makeSecret({ name: 'STRIPE_SECRET_KEY', last_rotated: new Date(REF.getTime() - 86_400_000).toISOString().slice(0, 10), rotation_interval_days: 180 });
    const r = getRotationStatus([overdue, ok], REF);
    assert.ok(r.summary.includes('overdue'));
    assert.ok(r.summary.includes('ok'));
  });

  it('handles empty secrets list', () => {
    const r = getRotationStatus([], REF);
    assert.equal(r.overdue.length, 0);
    assert.equal(r.due_soon.length, 0);
    assert.equal(r.ok.length, 0);
    assert.ok(r.summary.length > 0);
  });

  it('summary is human-readable', () => {
    const s = makeSecret({ last_rotated: '2025-01-01', name: 'ANTHROPIC_API_KEY' });
    const r = getRotationStatus([s], REF);
    assert.ok(typeof r.summary === 'string');
    assert.ok(r.summary.length > 0);
  });
});

// ── generateRotationReport ────────────────────────────────────────────────────

describe('generateRotationReport', () => {
  it('returns a markdown string', () => {
    const secrets = [makeSecret({ name: 'ANTHROPIC_API_KEY' })];
    const report  = generateRotationReport(secrets);
    assert.ok(typeof report === 'string');
    assert.ok(report.includes('# Secret Rotation Report'));
  });

  it('includes overdue section for overdue secrets', () => {
    const s = makeSecret({ name: 'ANTHROPIC_API_KEY', last_rotated: '2020-01-01' });
    const r = generateRotationReport([s]);
    assert.ok(r.includes('Overdue'));
    assert.ok(r.includes('ANTHROPIC_API_KEY'));
  });

  it('includes OK section for healthy secrets', () => {
    const rotatedAt = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const s = makeSecret({ name: 'STRIPE_SECRET_KEY', last_rotated: rotatedAt, rotation_interval_days: 180 });
    const r = generateRotationReport([s]);
    assert.ok(r.includes('OK') || r.includes('ok'));
  });

  it('includes policy table with all secrets', () => {
    const secrets = VAEO_SECRETS;
    const r       = generateRotationReport(secrets);
    assert.ok(r.includes('| Secret |'));
    for (const s of secrets) {
      assert.ok(r.includes(s.name), `Report missing ${s.name}`);
    }
  });
});
