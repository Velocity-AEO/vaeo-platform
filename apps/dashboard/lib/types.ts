export type CmsType = 'shopify' | 'wordpress';

export type ExecutionStatus =
  | 'queued'
  | 'deployed'
  | 'failed'
  | 'rolled_back'
  | 'regression_detected'
  | 'rollback_failed'
  | 'in_progress'
  | 'pending_approval';

// ── Live DB types (matches actual Supabase schema) ─────────────────────────────

export interface Site {
  site_id:     string;
  tenant_id:   string;
  cms_type:    CmsType;
  site_url:    string;
  verified_at: string | null;
  created_at:  string;
}

/** Matches action_queue live schema columns */
export interface ActionQueueRow {
  id:                string;
  run_id:            string;
  tenant_id:         string;
  site_id:           string;
  cms_type?:         string;
  issue_type:        string;
  url:               string;
  risk_score:        number;
  priority:          number;
  proposed_fix:      Record<string, unknown>;
  approval_required: boolean;
  rollback_manifest: Record<string, unknown> | null;
  execution_status:  ExecutionStatus;
  created_at:        string;
  updated_at:        string;
}

/** action_queue row enriched with site_url for display */
export interface CommandCenterRow extends ActionQueueRow {
  site_url: string;
}

export interface CommandCenterStats {
  pending_approval: number;
  deployed:         number;
  rolled_back:      number;
  failed:           number;
}

export interface RunSummary {
  run_id:         string;
  site_url:       string;
  cms_type:       string;
  status:         string;
  urls_crawled:   number;
  fixes_deployed: number;
  started_at:     string;
  site_id:        string;
}

export interface DashboardStats {
  total_runs_today:       number;
  fixes_deployed_today:   number;
  fixes_pending_approval: number;
  active_regressions:     number;
}

export interface SiteWithStats extends Site {
  last_run_at:  string | null;
  last_run_id:  string | null;
  total_issues: number;
  health_score: { total: number; technical: number; content: number; schema: number; grade: string };
}
