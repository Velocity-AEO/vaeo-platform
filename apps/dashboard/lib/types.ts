export type CmsType = 'shopify' | 'wordpress';

export type ExecutionStatus =
  | 'queued'
  | 'deployed'
  | 'pending_approval'
  | 'failed'
  | 'rolled_back'
  | 'regression_detected'
  | 'rollback_failed'
  | 'in_progress';

export interface Site {
  site_id:     string;
  tenant_id:   string;
  cms_type:    CmsType;
  site_url:    string;
  verified_at: string | null;
  created_at:  string;
}

export interface CrawlSnapshot {
  snapshot_id:  string;
  run_id:       string;
  tenant_id:    string;
  site_id:      string;
  cms_type:     CmsType;
  urls_crawled: number;
  urls_failed:  number;
  started_at:   string;
  completed_at: string;
  status:       'completed' | 'failed' | 'partial';
  created_at:   string;
}

export interface ActionQueueRow {
  id:                string;
  run_id:            string;
  tenant_id:         string;
  site_id:           string;
  issue_type:        string;
  url:               string;
  risk_score:        number;
  priority:          number;
  category:          string;
  proposed_fix:      Record<string, unknown>;
  approval_required: boolean;
  auto_deploy:       boolean;
  execution_status:  ExecutionStatus;
  created_at:        string;
  updated_at:        string;
}

export interface RunSummary {
  run_id:         string;
  site_url:       string;
  cms_type:       CmsType;
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
