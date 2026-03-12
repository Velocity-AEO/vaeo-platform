'use client';

import { useState } from 'react';

export interface UpgradePromptProps {
  feature: string;
  current_plan: string;
  required_plan: string;
  onUpgrade?: () => void;
}

export default function UpgradePrompt({
  feature,
  current_plan,
  required_plan,
  onUpgrade,
}: UpgradePromptProps) {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    if (onUpgrade) {
      onUpgrade();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: required_plan.toLowerCase(), billing_period: 'monthly' }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.open(data.checkout_url, '_blank');
      } else {
        alert(data.error || 'Failed to start checkout');
      }
    } catch {
      alert('Network error — please try again');
    }
    setLoading(false);
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
      <div className="flex items-start gap-3">
        <span className="text-2xl" role="img" aria-label="locked">🔒</span>
        <div className="flex-1">
          <p className="font-semibold text-amber-900">
            {feature} requires the {required_plan} plan
          </p>
          <p className="text-sm text-amber-700 mt-1">
            You're on {current_plan}. Upgrade to unlock this.
          </p>
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="mt-3 px-4 py-2 bg-amber-600 text-white rounded text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? 'Redirecting...' : 'Upgrade Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
