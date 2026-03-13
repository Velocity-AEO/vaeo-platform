/**
 * tools/link_graph/admin_graph_rebuild.ts
 *
 * Manual graph rebuild trigger for admins. Queues a rebuild job
 * for a specific site or all stale sites. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type RebuildScope = 'single' | 'stale' | 'all';

export interface RebuildRequest {
  scope:     RebuildScope;
  site_id?:  string;        // required when scope === 'single'
  reason:    string;
  requested_by: string;
}

export interface RebuildResult {
  success:      boolean;
  queued_count: number;
  queued_sites: string[];
  error:        string | null;
  requested_at: string;
}

export interface AdminRebuildDeps {
  getStaleSiteIdsFn?: () => Promise<string[]>;
  getAllSiteIdsFn?:   () => Promise<string[]>;
  queueBuildFn?:     (site_id: string, reason: string) => Promise<boolean>;
}

// ── triggerGraphRebuild ─────────────────────────────────────────────────────

export async function triggerGraphRebuild(
  request: RebuildRequest,
  deps?: AdminRebuildDeps,
): Promise<RebuildResult> {
  const fail = (error: string): RebuildResult => ({
    success: false,
    queued_count: 0,
    queued_sites: [],
    error,
    requested_at: new Date().toISOString(),
  });

  try {
    if (!request?.scope) return fail('missing_scope');
    if (!request.reason) return fail('missing_reason');

    const getStaleSiteIds = deps?.getStaleSiteIdsFn ?? (async () => []);
    const getAllSiteIds   = deps?.getAllSiteIdsFn ?? (async () => []);
    const queueBuild     = deps?.queueBuildFn ?? (async () => true);

    let siteIds: string[];

    switch (request.scope) {
      case 'single': {
        if (!request.site_id) return fail('missing_site_id for single scope');
        siteIds = [request.site_id];
        break;
      }
      case 'stale': {
        siteIds = await getStaleSiteIds();
        break;
      }
      case 'all': {
        siteIds = await getAllSiteIds();
        break;
      }
      default:
        return fail(`unknown scope: ${request.scope}`);
    }

    const safeSiteIds = (Array.isArray(siteIds) ? siteIds : []).filter(Boolean);
    if (safeSiteIds.length === 0) {
      return {
        success: true,
        queued_count: 0,
        queued_sites: [],
        error: null,
        requested_at: new Date().toISOString(),
      };
    }

    const queued: string[] = [];
    for (const sid of safeSiteIds) {
      try {
        const ok = await queueBuild(sid, request.reason);
        if (ok) queued.push(sid);
      } catch {
        // skip failed queues
      }
    }

    return {
      success: true,
      queued_count: queued.length,
      queued_sites: queued,
      error: null,
      requested_at: new Date().toISOString(),
    };
  } catch {
    return fail('internal_error');
  }
}

// ── Validate rebuild request ────────────────────────────────────────────────

export function validateRebuildRequest(body: unknown): { valid: boolean; error: string | null; request: RebuildRequest | null } {
  try {
    if (!body || typeof body !== 'object') return { valid: false, error: 'invalid_body', request: null };
    const b = body as Record<string, unknown>;

    const scope = b.scope as string;
    if (!['single', 'stale', 'all'].includes(scope)) return { valid: false, error: 'invalid_scope', request: null };

    if (scope === 'single' && !b.site_id) return { valid: false, error: 'missing_site_id', request: null };

    const reason = typeof b.reason === 'string' && b.reason.trim() ? b.reason.trim() : 'manual rebuild';
    const requested_by = typeof b.requested_by === 'string' ? b.requested_by : 'admin';

    return {
      valid: true,
      error: null,
      request: {
        scope: scope as RebuildScope,
        site_id: typeof b.site_id === 'string' ? b.site_id : undefined,
        reason,
        requested_by,
      },
    };
  } catch {
    return { valid: false, error: 'parse_error', request: null };
  }
}
