'use client';

import { useEffect, useState } from 'react';
import { PLANS, type PlanId, type Tenant } from '@/lib/types';
import { supabase } from '@/lib/supabase';

const HARDCODED_TENANT = '00000000-0000-0000-0000-000000000001';

interface BillingState {
  tenant:     Tenant | null;
  site_count: number;
  loading:    boolean;
  error:      string | null;
}

export default function BillingPage() {
  const [state, setState] = useState<BillingState>({ tenant: null, site_count: 0, loading: true, error: null });
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);

  useEffect(() => {
    loadBillingData();
  }, []);

  async function loadBillingData() {
    try {
      const [tenantRes, sitesRes] = await Promise.all([
        supabase.from('tenants').select('*').eq('id', HARDCODED_TENANT).maybeSingle(),
        supabase.from('sites').select('*', { count: 'exact', head: true }).eq('tenant_id', HARDCODED_TENANT),
      ]);

      if (tenantRes.error) throw new Error(tenantRes.error.message);
      setState({ tenant: tenantRes.data, site_count: sitesRes.count ?? 0, loading: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async function handleSelectPlan(plan: PlanId) {
    setCheckoutLoading(plan);
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to create checkout session');
      }
    } catch {
      alert('Network error — please try again');
    } finally {
      setCheckoutLoading(null);
    }
  }

  if (state.loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-64 bg-slate-200 rounded" />
      </div>
    );
  }

  if (state.error) {
    return <p className="text-red-600">Error loading billing data: {state.error}</p>;
  }

  const tenant = state.tenant;
  const currentPlan = tenant?.plan ?? 'starter';
  const isActive = tenant?.billing_status === 'active';

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Billing</h1>

      {/* Current Plan */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Current Plan</h2>
        <div className="flex items-center gap-6">
          <div>
            <p className="text-2xl font-bold">{PLANS[currentPlan].name}</p>
            <p className="text-slate-500">
              ${(PLANS[currentPlan].price / 100).toLocaleString()}/mo
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            isActive ? 'bg-green-100 text-green-800' :
            tenant?.billing_status === 'past_due' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {tenant?.billing_status ?? 'inactive'}
          </div>
        </div>
      </section>

      {/* Usage */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Usage</h2>
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold">{state.site_count}</span>
          <span className="text-slate-500">/ {tenant?.site_limit ?? 1} sites</span>
        </div>
        <div className="mt-2 w-full bg-slate-100 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all"
            style={{ width: `${Math.min(100, (state.site_count / (tenant?.site_limit ?? 1)) * 100)}%` }}
          />
        </div>
      </section>

      {/* Plans */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(Object.keys(PLANS) as PlanId[]).map((planId) => {
            const plan = PLANS[planId];
            const isCurrent = planId === currentPlan && isActive;
            return (
              <div
                key={planId}
                className={`bg-white rounded-lg shadow p-6 flex flex-col ${
                  isCurrent ? 'ring-2 ring-blue-600' : ''
                }`}
              >
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-3xl font-bold mt-2">
                  ${(plan.price / 100).toLocaleString()}
                  <span className="text-base font-normal text-slate-500">/mo</span>
                </p>
                <ul className="mt-4 space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="text-sm text-slate-600 flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan(planId)}
                  disabled={isCurrent || checkoutLoading !== null}
                  className={`mt-6 w-full py-2 px-4 rounded font-medium transition-colors ${
                    isCurrent
                      ? 'bg-slate-100 text-slate-400 cursor-default'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isCurrent
                    ? 'Current Plan'
                    : checkoutLoading === planId
                      ? 'Redirecting...'
                      : planId === 'enterprise'
                        ? 'Contact Sales'
                        : 'Select Plan'}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
