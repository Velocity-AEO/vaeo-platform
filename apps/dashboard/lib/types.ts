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
  site_id:                     string;
  tenant_id:                   string;
  cms_type:                    CmsType;
  site_url:                    string;
  verified_at:                 string | null;
  created_at:                  string;
  pipeline_suspended?:         boolean;
  pipeline_suspended_at?:      string | null;
  pipeline_resume_at?:         string | null;
  pipeline_suspension_reason?: string | null;
  consecutive_failures?:       number;
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

// ── Billing types ──────────────────────────────────────────────────────────────

export type PlanId = 'starter' | 'pro' | 'enterprise';
export type BillingStatus = 'active' | 'inactive' | 'past_due' | 'canceled';

export interface Tenant {
  id:                      string;
  name:                    string;
  email:                   string;
  plan:                    PlanId;
  billing_status:          BillingStatus;
  stripe_customer_id:      string | null;
  stripe_subscription_id:  string | null;
  site_limit:              number;
  created_at:              string;
  updated_at:              string;
}

export interface PlanDefinition {
  id:         PlanId;
  name:       string;
  price:      number;  // monthly cents
  site_limit: number;
  features:   string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 29900,
    site_limit: 1,
    features: ['1 Shopify site', 'SEO audit & fixes', 'Health score tracking', 'Email support'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 79900,
    site_limit: 5,
    features: ['Up to 5 sites', 'Priority fix queue', 'Case study reports', 'Slack notifications', 'Priority support'],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 249900,
    site_limit: 999,
    features: ['Unlimited sites', 'Dedicated account manager', 'Custom integrations', 'SLA guarantee', 'White-label reports'],
  },
};

export interface SiteWithStats extends Site {
  last_run_at:  string | null;
  last_run_id:  string | null;
  total_issues: number;
  health_score: { total: number; technical: number; content: number; schema: number; grade: string };
}
