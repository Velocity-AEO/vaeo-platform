'use client';

/**
 * apps/dashboard/app/agency/[agencyId]/page.tsx
 *
 * Agency portal — overview of all client sites.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAgencyPlanBadgeColor,
  getCapacityBarWidth,
  getCapacityBarColor,
  sortRosterByDomain,
  getRosterTableRows,
  type AgencyClientSite,
} from '../../../lib/agency_portal_logic';
import {
  getSuspensionDisplayInfo,
  type SiteSuspensionData,
} from '../../../lib/suspension_display';

interface AgencyData {
  agency_id:           string;
  agency_name:         string;
  plan:                'starter' | 'growth' | 'enterprise';
  max_client_sites:    number;
  active_client_sites: number;
}

export default function AgencyPortalPage() {
  const params = useParams();
  const router = useRouter();
  const agencyId = params?.agencyId as string;

  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [roster, setRoster] = useState<AgencyClientSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [agencyRes, rosterRes] = await Promise.all([
        fetch(`/api/agency/${agencyId}`),
        fetch(`/api/agency/${agencyId}/roster`),
      ]);

      if (agencyRes.status === 403) {
        router.push('/dashboard');
        return;
      }

      if (!agencyRes.ok || !rosterRes.ok) {
        setError('Unable to load agency data');
        setLoading(false);
        return;
      }

      const agencyData = await agencyRes.json();
      const rosterData = await rosterRes.json();

      setAgency(agencyData);
      setRoster(Array.isArray(rosterData) ? rosterData : rosterData.sites ?? []);
      setError(null);
    } catch {
      setError('Unable to load agency data');
    } finally {
      setLoading(false);
    }
  }, [agencyId, router]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return (
      <div className="p-8 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded mb-4" />
        <div className="h-4 w-48 bg-gray-200 rounded mb-8" />
        <div className="h-64 bg-gray-100 rounded" />
      </div>
    );
  }

  if (error || !agency) {
    return (
      <div className="p-8">
        <p className="text-red-600">{error ?? 'Unable to load agency data'}</p>
      </div>
    );
  }

  const pct = getCapacityBarWidth(agency.active_client_sites, agency.max_client_sites);
  const barColor = getCapacityBarColor(pct);
  const badgeColor = getAgencyPlanBadgeColor(agency.plan);
  const sorted = sortRosterByDomain(roster);
  const rows = getRosterTableRows(sorted);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{agency.agency_name}</h1>
          <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded ${badgeColor}`}>
            {agency.plan.charAt(0).toUpperCase() + agency.plan.slice(1)}
          </span>
        </div>
        <button
          onClick={() => {/* open slide-over — wired in Step 2 */}}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
        >
          Add Client Site
        </button>
      </div>

      {/* Capacity bar */}
      <div className="mb-8">
        <p className="text-sm text-gray-600 mb-1">
          {agency.active_client_sites} of {agency.max_client_sites} sites
        </p>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Client site table */}
      {rows.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          No client sites yet. Add your first site.
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="pb-2 font-medium">Domain</th>
              <th className="pb-2 font-medium">Platform</th>
              <th className="pb-2 font-medium">Client</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.site_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 font-medium text-gray-900">{row.domain}</td>
                <td className="py-3 text-gray-600 capitalize">{row.platform}</td>
                <td className="py-3 text-gray-600">{row.client_name || '—'}</td>
                <td className="py-3 flex items-center gap-2">
                  <span className={`text-xs font-medium ${row.active ? 'text-green-600' : 'text-gray-400'}`}>
                    {row.active ? 'Active' : 'Inactive'}
                  </span>
                  {(() => {
                    const suspensionData: SiteSuspensionData = (row as any);
                    const info = getSuspensionDisplayInfo(suspensionData);
                    if (!info.is_suspended) return null;
                    return (
                      <span className="inline-flex items-center gap-1">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${info.badge_color}`} title={info.tooltip}>
                          {info.badge_label}
                        </span>
                        {info.show_resume && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await fetch(`/api/agency/${agencyId}/sites/${row.site_id}/resume`, { method: 'POST' });
                                loadData();
                              } catch { /* silent */ }
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Resume Now
                          </button>
                        )}
                      </span>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
