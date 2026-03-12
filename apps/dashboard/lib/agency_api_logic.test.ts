/**
 * apps/dashboard/lib/agency_api_logic.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgencyCreateRequest,
  getAgencyPlanLabel,
  getAgencyPlanPrice,
} from './agency_api_logic.ts';

// ── buildAgencyCreateRequest ──────────────────────────────────────────────────

describe('buildAgencyCreateRequest', () => {
  it('sets agency_name', () => {
    const req = buildAgencyCreateRequest('My Agency', 'starter');
    assert.equal(req.agency_name, 'My Agency');
  });

  it('sets plan', () => {
    const req = buildAgencyCreateRequest('N', 'growth');
    assert.equal(req.plan, 'growth');
  });

  it('sets enterprise plan', () => {
    const req = buildAgencyCreateRequest('N', 'enterprise');
    assert.equal(req.plan, 'enterprise');
  });

  it('never throws', () => {
    assert.doesNotThrow(() => buildAgencyCreateRequest(null as never, null as never));
  });
});

// ── getAgencyPlanLabel ────────────────────────────────────────────────────────

describe('getAgencyPlanLabel', () => {
  it('starter label includes 10', () => {
    const label = getAgencyPlanLabel('starter');
    assert.ok(label.includes('10'));
    assert.ok(label.toLowerCase().includes('starter'));
  });

  it('growth label includes 50', () => {
    const label = getAgencyPlanLabel('growth');
    assert.ok(label.includes('50'));
    assert.ok(label.toLowerCase().includes('growth'));
  });

  it('enterprise label includes 200', () => {
    const label = getAgencyPlanLabel('enterprise');
    assert.ok(label.includes('200'));
    assert.ok(label.toLowerCase().includes('enterprise'));
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getAgencyPlanLabel(null as never));
  });
});

// ── getAgencyPlanPrice ────────────────────────────────────────────────────────

describe('getAgencyPlanPrice', () => {
  it('starter returns $299.00/mo', () => {
    assert.equal(getAgencyPlanPrice('starter'), '$299.00/mo');
  });

  it('growth returns $799.00/mo', () => {
    assert.equal(getAgencyPlanPrice('growth'), '$799.00/mo');
  });

  it('enterprise returns $1999.00/mo', () => {
    assert.equal(getAgencyPlanPrice('enterprise'), '$1999.00/mo');
  });

  it('includes /mo suffix', () => {
    const price = getAgencyPlanPrice('growth');
    assert.ok(price.endsWith('/mo'));
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getAgencyPlanPrice(null as never));
  });
});
