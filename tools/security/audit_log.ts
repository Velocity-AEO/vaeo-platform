/**
 * tools/security/audit_log.ts
 *
 * Immutable audit event log for SOC 2 compliance.
 * Never throws — audit logging must never block the main action.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id:            string;
  tenant_id:     string;
  user_id?:      string;
  actor_type:    'user' | 'system' | 'api';
  action:        string;
  resource_type: string;
  resource_id?:  string;
  outcome:       'success' | 'failure' | 'blocked';
  ip_address?:   string;
  user_agent?:   string;
  metadata?:     Record<string, unknown>;
  created_at:    string;
}

// ── Action constants ──────────────────────────────────────────────────────────

export const AuditAction = {
  SITE_CREATED:       'site.created',
  SITE_DELETED:       'site.deleted',
  FIX_APPROVED:       'fix.approved',
  FIX_APPLIED:        'fix.applied',
  FIX_ROLLED_BACK:    'fix.rolled_back',
  CRAWL_STARTED:      'crawl.started',
  CRAWL_COMPLETED:    'crawl.completed',
  USER_LOGIN:         'user.login',
  USER_LOGOUT:        'user.logout',
  API_KEY_CREATED:    'api_key.created',
  API_KEY_REVOKED:    'api_key.revoked',
  RATE_LIMIT_HIT:     'rate_limit.hit',
  VALIDATION_FAILED:  'validation.failed',
  EXPORT_DOWNLOADED:  'export.downloaded',
  GSC_CONNECTED:      'gsc.connected',
} as const;

// ── DB interface (injectable) ─────────────────────────────────────────────────

interface AuditRow {
  id:            string;
  tenant_id:     string;
  user_id?:      string;
  actor_type:    string;
  action:        string;
  resource_type: string;
  resource_id?:  string;
  outcome:       string;
  ip_address?:   string;
  user_agent?:   string;
  metadata?:     Record<string, unknown>;
  created_at:    string;
}

interface AuditQuery extends PromiseLike<{ data: AuditRow[] | null; error: { message: string } | null }> {
  eq(col: string, val: unknown):  AuditQuery;
  gte(col: string, val: string):  AuditQuery;
  lte(col: string, val: string):  AuditQuery;
  order(col: string, opts: { ascending: boolean }): AuditQuery;
  limit(n: number):               AuditQuery;
}

interface SingleAuditQuery extends PromiseLike<{ data: { id: string } | null; error: { message: string } | null }> {}

interface AuditDb {
  from(table: 'audit_log'): {
    insert(row: Record<string, unknown>): {
      select(col: string): {
        maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
    select(cols: string): AuditQuery;
  };
}

// ── logAuditEvent ─────────────────────────────────────────────────────────────

export async function logAuditEvent(
  event: Omit<AuditEvent, 'id' | 'created_at'>,
  db:    unknown,
): Promise<{ ok: boolean; event_id?: string }> {
  try {
    const adb = db as AuditDb;
    const row: Record<string, unknown> = {
      tenant_id:     event.tenant_id,
      actor_type:    event.actor_type,
      action:        event.action,
      resource_type: event.resource_type,
      outcome:       event.outcome,
    };
    if (event.user_id)    row['user_id']    = event.user_id;
    if (event.resource_id) row['resource_id'] = event.resource_id;
    if (event.ip_address) row['ip_address'] = event.ip_address;
    if (event.user_agent) row['user_agent'] = event.user_agent;
    if (event.metadata)   row['metadata']   = event.metadata;

    const { data, error } = await adb
      .from('audit_log')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (error || !data?.id) return { ok: false };
    return { ok: true, event_id: data.id };
  } catch {
    return { ok: false };
  }
}

// ── getAuditLog ───────────────────────────────────────────────────────────────

export async function getAuditLog(
  filters: {
    tenant_id:      string;
    resource_type?: string;
    action?:        string;
    from_date?:     string;
    to_date?:       string;
    limit?:         number;
  },
  db: unknown,
): Promise<AuditEvent[]> {
  try {
    const adb = db as AuditDb;
    let q = adb
      .from('audit_log')
      .select('*')
      .eq('tenant_id', filters.tenant_id);

    if (filters.resource_type) q = q.eq('resource_type', filters.resource_type);
    if (filters.action)        q = q.eq('action', filters.action);
    if (filters.from_date)     q = q.gte('created_at', filters.from_date);
    if (filters.to_date)       q = q.lte('created_at', filters.to_date);

    q = q.order('created_at', { ascending: false }).limit(filters.limit ?? 100);

    const { data, error } = await q;
    if (error || !data) return [];
    return data as unknown as AuditEvent[];
  } catch {
    return [];
  }
}

// ── getAuditSummary ───────────────────────────────────────────────────────────

export async function getAuditSummary(
  tenant_id: string,
  days:      number,
  db:        unknown,
): Promise<{
  total_events:     number;
  by_action:        Record<string, number>;
  by_outcome:       Record<string, number>;
  recent_failures:  AuditEvent[];
}> {
  const empty = { total_events: 0, by_action: {}, by_outcome: {}, recent_failures: [] };

  try {
    const from_date = new Date(Date.now() - days * 86_400_000).toISOString();
    const events    = await getAuditLog({ tenant_id, from_date, limit: 1000 }, db);

    const by_action:  Record<string, number> = {};
    const by_outcome: Record<string, number> = {};

    for (const ev of events) {
      by_action[ev.action]   = (by_action[ev.action]   ?? 0) + 1;
      by_outcome[ev.outcome] = (by_outcome[ev.outcome] ?? 0) + 1;
    }

    const recent_failures = events.filter((e) => e.outcome === 'failure' || e.outcome === 'blocked').slice(0, 10);

    return { total_events: events.length, by_action, by_outcome, recent_failures };
  } catch {
    return empty;
  }
}
