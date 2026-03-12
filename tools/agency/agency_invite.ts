/**
 * tools/agency/agency_invite.ts
 *
 * Agency client invite flow.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgencyInvite {
  invite_id:   string;
  agency_id:   string;
  site_id:     string;
  client_email: string;
  client_name: string | null;
  invited_at:  string;
  expires_at:  string;
  accepted_at: string | null;
  status:      'pending' | 'accepted' | 'expired';
}

// ── buildAgencyInvite ─────────────────────────────────────────────────────────

export function buildAgencyInvite(
  agency_id: string,
  site_id: string,
  client_email: string,
  client_name?: string,
): AgencyInvite {
  try {
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      invite_id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      agency_id: agency_id ?? '',
      site_id: site_id ?? '',
      client_email: client_email ?? '',
      client_name: client_name ?? null,
      invited_at: now.toISOString(),
      expires_at: expires.toISOString(),
      accepted_at: null,
      status: 'pending',
    };
  } catch {
    return {
      invite_id: `inv_${Date.now()}`,
      agency_id: agency_id ?? '',
      site_id: site_id ?? '',
      client_email: client_email ?? '',
      client_name: null,
      invited_at: new Date().toISOString(),
      expires_at: new Date().toISOString(),
      accepted_at: null,
      status: 'pending',
    };
  }
}

// ── isInviteExpired ───────────────────────────────────────────────────────────

export function isInviteExpired(invite: AgencyInvite): boolean {
  try {
    if (!invite) return true;
    if (invite.status === 'expired') return true;
    const expires = new Date(invite.expires_at);
    return expires.getTime() < Date.now();
  } catch {
    return true;
  }
}

// ── isInviteValid ─────────────────────────────────────────────────────────────

export function isInviteValid(invite: AgencyInvite): boolean {
  try {
    if (!invite) return false;
    if (invite.status !== 'pending') return false;
    return !isInviteExpired(invite);
  } catch {
    return false;
  }
}

// ── getInviteStatusLabel ──────────────────────────────────────────────────────

export function getInviteStatusLabel(invite: AgencyInvite): string {
  try {
    if (!invite) return 'Unknown';
    switch (invite.status) {
      case 'pending':  return 'Pending';
      case 'accepted': return 'Accepted';
      case 'expired':  return 'Expired';
      default:         return 'Unknown';
    }
  } catch {
    return 'Unknown';
  }
}
