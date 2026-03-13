/**
 * tools/billing/billing_enforcement.ts
 *
 * Billing gate enforcement for the fix pipeline.
 * Fail open — never block on infrastructure error.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BillingEnforcementResult {
  allowed:       boolean;
  reason?:       string;
  current_usage: number;
  plan_limit:    number;
  overage:       number;
}

export interface BillingEnforcementDeps {
  loadUsageFn?: (site_id: string) => Promise<number>;
  loadPlanFn?:  (site_id: string) => Promise<number>;
  failOpenLogFn?: (tenant_id: string, site_id: string, action: string, error: unknown) => Promise<void>;
}

export interface BillingFailOpenEntry {
  tenant_id:     string;
  site_id:       string;
  action:        string;
  error_message: string;
  failed_at:     string;
  reconciled:    boolean;
}

export interface BillingFailOpenLogDeps {
  saveFn?: (entry: BillingFailOpenEntry) => Promise<void>;
}

// ── logBillingFailOpen ───────────────────────────────────────────────────────

export async function logBillingFailOpen(
  tenant_id: string,
  site_id:   string,
  action:    string,
  error:     unknown,
  deps?:     BillingFailOpenLogDeps,
): Promise<void> {
  try {
    const error_message = error instanceof Error ? error.message : String(error ?? 'unknown');
    const entry: BillingFailOpenEntry = {
      tenant_id:     tenant_id ?? '',
      site_id:       site_id ?? '',
      action:        action ?? '',
      error_message,
      failed_at:     new Date().toISOString(),
      reconciled:    false,
    };

    if (deps?.saveFn) {
      try {
        await deps.saveFn(entry);
        return;
      } catch {
        // Supabase unavailable — fall through to console
      }
    }

    // Console fallback
    console.error(
      `[BILLING_FAILOPEN] tenant=${tenant_id} site=${site_id} action=${action} error=${error_message}`,
    );
  } catch {
    // Fail-open logging must never cause additional failures
  }
}

// ── calculateOverage ──────────────────────────────────────────────────────────

export function calculateOverage(
  usage: number,
  limit: number,
  requested: number,
): number {
  try {
    const u = usage ?? 0;
    const l = limit ?? 0;
    const r = requested ?? 0;
    const total = u + r;
    if (total <= l) return 0;
    return total - l;
  } catch {
    return 0;
  }
}

// ── checkBillingGate ──────────────────────────────────────────────────────────

export async function checkBillingGate(
  site_id: string,
  fix_count_requested: number,
  deps?: BillingEnforcementDeps,
): Promise<BillingEnforcementResult> {
  try {
    const loadUsage = deps?.loadUsageFn ?? (async () => 0);
    const loadPlan  = deps?.loadPlanFn  ?? (async () => 100);

    const current_usage = await loadUsage(site_id);
    const plan_limit    = await loadPlan(site_id);
    const overage       = calculateOverage(current_usage, plan_limit, fix_count_requested);

    if (overage > 0) {
      return {
        allowed: false,
        reason: `Fix limit exceeded. ${current_usage} of ${plan_limit} fixes used this month. ${fix_count_requested} requested would exceed by ${overage}.`,
        current_usage,
        plan_limit,
        overage,
      };
    }

    return {
      allowed: true,
      current_usage,
      plan_limit,
      overage: 0,
    };
  } catch (err) {
    // Fail open — never block on infra error
    // Log the fail-open event for reconciliation
    try {
      const logFn = deps?.failOpenLogFn ?? (async (t: string, s: string, a: string, e: unknown) => {
        await logBillingFailOpen(t, s, a, e);
      });
      await logFn('unknown', site_id, 'check_billing_gate', err);
    } catch {
      // Logging must never block
    }

    return {
      allowed: true,
      reason: 'Billing check skipped due to load error',
      current_usage: 0,
      plan_limit: 0,
      overage: 0,
    };
  }
}

// ── getBillingBlockMessage ────────────────────────────────────────────────────

export function getBillingBlockMessage(result: BillingEnforcementResult): string {
  try {
    if (!result || result.allowed) return '';
    return `You have used ${result.current_usage} of ${result.plan_limit} fixes this month. Upgrade your plan to continue.`;
  } catch {
    return 'Billing limit reached. Please upgrade your plan.';
  }
}
