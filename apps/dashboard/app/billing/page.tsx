'use client';

import { useEffect, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface BillingState {
  tenant_id: string;
  plan: string;
  billing_status: string;
  current_period_end?: string;
  sites_used: number;
  sites_limit: number;
  crawls_used: number;
  crawls_limit: number;
  fixes_used: number;
  fixes_limit: number;
  sites_pct: number;
  crawls_pct: number;
  fixes_pct: number;
  is_over_limit: boolean;
  days_until_renewal?: number;
}

interface PlanPrice {
  monthly_usd: number;
  annual_usd: number;
  label: string;
  features: string[];
}

interface SubscriptionData {
  state: BillingState;
  plan_details?: PlanPrice;
  available_plans: Record<string, PlanPrice>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'active':   return 'bg-green-100 text-green-800';
    case 'past_due': return 'bg-amber-100 text-amber-800';
    case 'canceled': return 'bg-red-100 text-red-800';
    case 'trialing': return 'bg-blue-100 text-blue-800';
    default:         return 'bg-gray-100 text-gray-800';
  }
}

function meterColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-green-500';
}

// ── Components ───────────────────────────────────────────────────────────────

function UsageMeter({ label, used, limit, pct }: {
  label: string; used: number; limit: number; pct: number;
}) {
  const isUnlimited = limit >= 9999;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">
          {isUnlimited ? (
            <>{used} — <span className="text-green-600 font-medium">Unlimited</span></>
          ) : (
            <>{used} / {limit}</>
          )}
        </span>
      </div>
      {!isUnlimited && (
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${meterColor(pct)}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PlanCard({ planKey, plan, isCurrent, onUpgrade, upgrading }: {
  planKey: string;
  plan: PlanPrice;
  isCurrent: boolean;
  onUpgrade: (plan: string) => void;
  upgrading: string | null;
}) {
  const isEnterprise = planKey === 'enterprise';

  return (
    <div className={`bg-white rounded-lg border p-6 flex flex-col ${
      isCurrent ? 'ring-2 ring-blue-600 border-blue-300' : 'border-gray-200'
    }`}>
      <h3 className="text-xl font-bold">{plan.label}</h3>
      {isEnterprise ? (
        <p className="text-2xl font-bold mt-2 text-gray-700">Custom</p>
      ) : (
        <>
          <p className="text-3xl font-bold mt-2">
            ${plan.monthly_usd}
            <span className="text-base font-normal text-gray-500">/mo</span>
          </p>
          <p className="text-sm text-gray-500">
            or ${plan.annual_usd}/mo billed annually
          </p>
        </>
      )}
      <ul className="mt-4 space-y-2 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="text-sm text-gray-600 flex items-start gap-2">
            <span className="text-green-600 mt-0.5">&#10003;</span>
            {f}
          </li>
        ))}
      </ul>
      {isCurrent ? (
        <div className="mt-6 w-full py-2 px-4 rounded font-medium text-center bg-gray-100 text-gray-400">
          Current Plan
        </div>
      ) : isEnterprise ? (
        <a
          href="mailto:sales@velocityaeo.com"
          className="mt-6 w-full py-2 px-4 rounded font-medium text-center bg-gray-900 text-white hover:bg-gray-800 block"
        >
          Contact Sales
        </a>
      ) : (
        <button
          onClick={() => onUpgrade(planKey)}
          disabled={upgrading !== null}
          className="mt-6 w-full py-2 px-4 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {upgrading === planKey ? 'Redirecting...' : 'Upgrade'}
        </button>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  async function handleUpgrade(plan: string) {
    setUpgrading(plan);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billing_period: 'monthly' }),
      });
      const result = await res.json();
      if (result.checkout_url) {
        window.open(result.checkout_url, '_blank');
      } else {
        alert(result.error || 'Failed to create checkout session');
      }
    } catch {
      alert('Network error — please try again');
    }
    setUpgrading(null);
  }

  async function handleManageBilling() {
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (result.portal_url) {
        window.open(result.portal_url, '_blank');
      } else {
        alert(result.error || 'Unable to open billing portal');
      }
    } catch {
      alert('Network error — please try again');
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-40 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error || !data?.state) {
    return <p className="text-red-600">Error loading billing data: {error ?? 'Unknown error'}</p>;
  }

  const { state, available_plans } = data;
  const planKeys = ['pro', 'agency', 'enterprise'];

  return (
    <div className="space-y-8 max-w-5xl">
      <h1 className="text-2xl font-bold">Billing</h1>

      {/* Current Plan */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Current Plan</h2>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold capitalize">{state.plan}</span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor(state.billing_status)}`}>
            {state.billing_status}
          </span>
        </div>
        {state.days_until_renewal !== undefined && state.billing_status === 'active' && (
          <p className="text-sm text-gray-500 mt-2">
            Renews in {state.days_until_renewal} day{state.days_until_renewal !== 1 ? 's' : ''}
            {state.current_period_end && (
              <> ({new Date(state.current_period_end).toLocaleDateString()})</>
            )}
          </p>
        )}
        <button
          onClick={handleManageBilling}
          className="mt-4 px-4 py-2 text-sm font-medium border border-gray-300 rounded hover:bg-gray-50"
        >
          Manage Billing
        </button>
      </section>

      {/* Usage Meters */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Usage</h2>

        {state.is_over_limit && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-amber-800 font-medium">
              You've reached your plan limit. Upgrade to continue using VAEO.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <UsageMeter label="Sites" used={state.sites_used} limit={state.sites_limit} pct={state.sites_pct} />
          <UsageMeter label="Crawls" used={state.crawls_used} limit={state.crawls_limit} pct={state.crawls_pct} />
          <UsageMeter label="Fixes" used={state.fixes_used} limit={state.fixes_limit} pct={state.fixes_pct} />
        </div>
      </section>

      {/* Available Plans */}
      {state.plan !== 'enterprise' && available_plans && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {planKeys.map((key) => {
              const plan = available_plans[key];
              if (!plan) return null;
              return (
                <PlanCard
                  key={key}
                  planKey={key}
                  plan={plan}
                  isCurrent={key === state.plan}
                  onUpgrade={handleUpgrade}
                  upgrading={upgrading}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Billing History */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-2">Billing History</h2>
        <p className="text-sm text-gray-500">
          View your full billing history and download invoices in the{' '}
          <button
            onClick={handleManageBilling}
            className="text-blue-600 hover:underline font-medium"
          >
            Stripe billing portal
          </button>.
        </p>
      </section>
    </div>
  );
}
