'use client';

import { useEffect, useState, useCallback } from 'react';

interface GSCAccount {
  account_id:     string;
  email:          string;
  property_count: number;
  max_properties: number;
}

interface GSCAccountPool {
  accounts:       GSCAccount[];
  total_used:     number;
  total_capacity: number;
}

function statusColor(account: GSCAccount): 'green' | 'yellow' | 'red' {
  if (account.max_properties <= 0) return 'green';
  const pct = (account.property_count / account.max_properties) * 100;
  if (pct >= 90) return 'red';
  if (pct >= 70) return 'yellow';
  return 'green';
}

function statusBg(color: 'green' | 'yellow' | 'red'): string {
  if (color === 'green') return 'bg-green-100 text-green-800';
  if (color === 'yellow') return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

function utilizationPct(used: number, capacity: number): number {
  if (!capacity || capacity <= 0) return 0;
  return Math.round((used / capacity) * 100);
}

export default function AdminGSCPage() {
  const [pool, setPool] = useState<GSCAccountPool | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPool = useCallback(() => {
    fetch('/api/admin/gsc/pool')
      .then((r) => r.json())
      .then((data) => { setPool(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPool();
    const interval = setInterval(loadPool, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadPool]);

  if (loading) {
    return (
      <div className="px-4 py-6 md:px-6 w-full max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">GSC Account Pool</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="px-4 py-6 md:px-6 w-full max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">GSC Account Pool</h1>
        <p className="text-gray-600">Unable to load pool data.</p>
      </div>
    );
  }

  const overallPct = utilizationPct(pool.total_used, pool.total_capacity);
  const hasWarning = pool.accounts.some(
    (a) => (a.property_count / (a.max_properties || 1)) * 100 >= 80,
  );

  return (
    <div className="px-4 py-6 md:px-6 w-full max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">GSC Account Pool</h1>
        <button className="h-11 sm:h-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          Add Account
        </button>
      </div>

      {/* Overall health */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Overall Utilization: {pool.total_used} / {pool.total_capacity} properties
          </span>
          <span className="text-sm text-gray-500">{overallPct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full ${overallPct >= 90 ? 'bg-red-500' : overallPct >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(overallPct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {pool.total_used} of {pool.total_capacity} properties used across {pool.accounts.length} accounts
        </p>
      </div>

      {/* Warning banner */}
      {hasWarning && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          One or more accounts are above 80% capacity. Consider adding a new GSC account.
        </div>
      )}

      {/* Account table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="pb-2 pr-4 font-medium">Email</th>
              <th className="pb-2 pr-4 font-medium">Properties Used</th>
              <th className="pb-2 pr-4 font-medium">Capacity</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pool.accounts.map((acc) => {
              const color = statusColor(acc);
              const pct = utilizationPct(acc.property_count, acc.max_properties);
              return (
                <tr key={acc.account_id} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium">{acc.email}</td>
                  <td className="py-3 pr-4">{acc.property_count}</td>
                  <td className="py-3 pr-4">{acc.max_properties}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBg(color)}`}>
                      {pct}% — {color === 'green' ? 'Healthy' : color === 'yellow' ? 'Filling' : 'Near Full'}
                    </span>
                  </td>
                  <td className="py-3">
                    <button className="text-xs text-blue-600 hover:underline">
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
