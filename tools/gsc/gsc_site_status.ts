/**
 * tools/gsc/gsc_site_status.ts
 *
 * GSC site status logic for client dashboard.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GSCSiteStatus {
  site_id:        string;
  domain:         string;
  gsc_onboarded:  boolean;
  verified:       boolean;
  account_id:     string | null;
  last_synced_at: string | null;
  ranking_count:  number;
  data_source:    'gsc_live' | 'simulated';
  status_message: string;
}

export interface GSCProperty {
  verified:    boolean;
  account_id:  string;
  verified_at: string | null;
}

export interface GSCLastSync {
  last_synced_at: string;
  ranking_count:  number;
}

// ── buildGSCSiteStatus ────────────────────────────────────────────────────────

export function buildGSCSiteStatus(
  site_id: string,
  domain: string,
  property: GSCProperty | null,
  last_sync: GSCLastSync | null,
): GSCSiteStatus {
  try {
    // No property → not onboarded
    if (!property) {
      const status: GSCSiteStatus = {
        site_id,
        domain: domain ?? '',
        gsc_onboarded: false,
        verified: false,
        account_id: null,
        last_synced_at: null,
        ranking_count: 0,
        data_source: 'simulated',
        status_message: '',
      };
      status.status_message = getGSCStatusMessage(status);
      return status;
    }

    // Property exists but not verified
    if (!property.verified) {
      const status: GSCSiteStatus = {
        site_id,
        domain: domain ?? '',
        gsc_onboarded: true,
        verified: false,
        account_id: property.account_id ?? null,
        last_synced_at: null,
        ranking_count: 0,
        data_source: 'simulated',
        status_message: '',
      };
      status.status_message = getGSCStatusMessage(status);
      return status;
    }

    // Verified — check sync
    const has_sync = last_sync && last_sync.last_synced_at;
    const status: GSCSiteStatus = {
      site_id,
      domain: domain ?? '',
      gsc_onboarded: true,
      verified: true,
      account_id: property.account_id ?? null,
      last_synced_at: has_sync ? last_sync.last_synced_at : null,
      ranking_count: has_sync ? (last_sync.ranking_count ?? 0) : 0,
      data_source: has_sync ? 'gsc_live' : 'simulated',
      status_message: '',
    };
    status.status_message = getGSCStatusMessage(status);
    return status;
  } catch {
    return {
      site_id: site_id ?? '',
      domain: domain ?? '',
      gsc_onboarded: false,
      verified: false,
      account_id: null,
      last_synced_at: null,
      ranking_count: 0,
      data_source: 'simulated',
      status_message: 'GSC setup in progress',
    };
  }
}

// ── getGSCStatusMessage ───────────────────────────────────────────────────────

export function getGSCStatusMessage(status: GSCSiteStatus): string {
  try {
    if (!status) return 'GSC setup in progress';
    if (!status.gsc_onboarded) return 'GSC setup in progress';
    if (!status.verified) return 'Verifying domain ownership...';
    if (!status.last_synced_at) return 'GSC connected, syncing rankings...';
    return `Live GSC data — ${status.ranking_count} keywords tracked`;
  } catch {
    return 'GSC setup in progress';
  }
}
