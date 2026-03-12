/**
 * tools/agency/agency_billing.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAgencyBill,
  getAgencyBillingSummary,
  isAgencyOverdue,
  formatAgencyAmount,
  AGENCY_PLAN_PRICES_CENTS,
  type AgencyBillingRecord,
} from './agency_billing.ts';
import { buildAgencyAccount, type AgencyAccount } from './agency_account.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function agency(plan: 'starter' | 'growth' | 'enterprise' = 'growth'): AgencyAccount {
  return buildAgencyAccount('Acme', 'user_1', plan);
}

const NOW   = '2026-03-01T00:00:00.000Z';
const LATER = '2026-03-31T00:00:00.000Z';

function record(status: AgencyBillingRecord['status'], amount_cents = 79_900): AgencyBillingRecord {
  return {
    billing_id:   'bill_1',
    agency_id:    'ag_1',
    period_start: NOW,
    period_end:   LATER,
    active_sites: 10,
    plan:         'growth',
    amount_cents,
    status,
  };
}

// ── AGENCY_PLAN_PRICES_CENTS ──────────────────────────────────────────────────

describe('AGENCY_PLAN_PRICES_CENTS', () => {
  it('starter = 29900', () => { assert.equal(AGENCY_PLAN_PRICES_CENTS.starter, 29_900); });
  it('growth = 79900',  () => { assert.equal(AGENCY_PLAN_PRICES_CENTS.growth,  79_900); });
  it('enterprise = 199900', () => { assert.equal(AGENCY_PLAN_PRICES_CENTS.enterprise, 199_900); });
});

// ── calculateAgencyBill ───────────────────────────────────────────────────────

describe('calculateAgencyBill', () => {
  it('uses correct plan price for starter', () => {
    const bill = calculateAgencyBill(agency('starter'), NOW, LATER);
    assert.equal(bill.amount_cents, 29_900);
  });

  it('uses correct plan price for growth', () => {
    const bill = calculateAgencyBill(agency('growth'), NOW, LATER);
    assert.equal(bill.amount_cents, 79_900);
  });

  it('uses correct plan price for enterprise', () => {
    const bill = calculateAgencyBill(agency('enterprise'), NOW, LATER);
    assert.equal(bill.amount_cents, 199_900);
  });

  it('sets status=pending', () => {
    const bill = calculateAgencyBill(agency(), NOW, LATER);
    assert.equal(bill.status, 'pending');
  });

  it('sets period_start', () => {
    const bill = calculateAgencyBill(agency(), NOW, LATER);
    assert.equal(bill.period_start, NOW);
  });

  it('sets period_end', () => {
    const bill = calculateAgencyBill(agency(), NOW, LATER);
    assert.equal(bill.period_end, LATER);
  });

  it('billing_id starts with bill_', () => {
    const bill = calculateAgencyBill(agency(), NOW, LATER);
    assert.ok(bill.billing_id.startsWith('bill_'));
  });

  it('never throws', () => {
    assert.doesNotThrow(() => calculateAgencyBill({} as AgencyAccount, '', ''));
  });
});

// ── getAgencyBillingSummary ───────────────────────────────────────────────────

describe('getAgencyBillingSummary', () => {
  it('total_billed_cents sums all records', () => {
    const s = getAgencyBillingSummary([record('paid', 100), record('pending', 200)]);
    assert.equal(s.total_billed_cents, 300);
  });

  it('total_paid_cents sums only paid', () => {
    const s = getAgencyBillingSummary([record('paid', 100), record('pending', 200)]);
    assert.equal(s.total_paid_cents, 100);
  });

  it('outstanding_cents includes pending + overdue', () => {
    const s = getAgencyBillingSummary([
      record('pending', 100),
      record('overdue', 200),
      record('paid', 300),
    ]);
    assert.equal(s.outstanding_cents, 300);
  });

  it('overdue_count counts overdue records', () => {
    const s = getAgencyBillingSummary([record('overdue'), record('overdue'), record('paid')]);
    assert.equal(s.overdue_count, 2);
  });

  it('all zeros on empty array', () => {
    const s = getAgencyBillingSummary([]);
    assert.deepEqual(s, { total_billed_cents: 0, total_paid_cents: 0, outstanding_cents: 0, overdue_count: 0 });
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getAgencyBillingSummary(null as never));
  });
});

// ── isAgencyOverdue ───────────────────────────────────────────────────────────

describe('isAgencyOverdue', () => {
  it('returns true when overdue record exists', () => {
    assert.equal(isAgencyOverdue([record('paid'), record('overdue')]), true);
  });

  it('returns false when all paid', () => {
    assert.equal(isAgencyOverdue([record('paid'), record('paid')]), false);
  });

  it('returns false on empty array', () => {
    assert.equal(isAgencyOverdue([]), false);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => isAgencyOverdue(null as never));
  });
});

// ── formatAgencyAmount ────────────────────────────────────────────────────────

describe('formatAgencyAmount', () => {
  it('formats 29900 as $299.00', () => {
    assert.equal(formatAgencyAmount(29_900), '$299.00');
  });

  it('formats 79900 as $799.00', () => {
    assert.equal(formatAgencyAmount(79_900), '$799.00');
  });

  it('formats 199900 as $1999.00', () => {
    assert.equal(formatAgencyAmount(199_900), '$1999.00');
  });

  it('formats 0 as $0.00', () => {
    assert.equal(formatAgencyAmount(0), '$0.00');
  });

  it('never throws', () => {
    assert.doesNotThrow(() => formatAgencyAmount(null as never));
  });
});
