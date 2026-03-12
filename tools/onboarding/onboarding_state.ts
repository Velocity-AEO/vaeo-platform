/**
 * tools/onboarding/onboarding_state.ts
 *
 * Self-serve onboarding state machine.
 * Tracks merchant progress through install → crawl → review.
 * Pure logic with injectable DB. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type OnboardingStep =
  | 'install'
  | 'connect_shopify'
  | 'connect_gsc'
  | 'first_crawl'
  | 'review_issues'
  | 'complete';

export interface OnboardingStatus {
  site_id:             string;
  current_step:        OnboardingStep;
  completed_steps:     OnboardingStep[];
  shopify_connected:   boolean;
  gsc_connected:       boolean;
  first_crawl_done:    boolean;
  issues_found:        number;
  created_at:          string;
  updated_at:          string;
}

export interface OnboardingDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        single(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    update(data: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{ error: unknown }>;
    };
  };
}

// ── Step order ────────────────────────────────────────────────────────────────

const STEP_ORDER: OnboardingStep[] = [
  'install',
  'connect_shopify',
  'connect_gsc',
  'first_crawl',
  'review_issues',
  'complete',
];

// ── Initial status ────────────────────────────────────────────────────────────

export function createInitialStatus(siteId: string): OnboardingStatus {
  const now = new Date().toISOString();
  return {
    site_id:           siteId,
    current_step:      'install',
    completed_steps:   [],
    shopify_connected: false,
    gsc_connected:     false,
    first_crawl_done:  false,
    issues_found:      0,
    created_at:        now,
    updated_at:        now,
  };
}

// ── getNextStep ───────────────────────────────────────────────────────────────

export function getNextStep(status: OnboardingStatus): OnboardingStep {
  for (const step of STEP_ORDER) {
    if (!status.completed_steps.includes(step)) return step;
  }
  return 'complete';
}

// ── isOnboardingComplete ──────────────────────────────────────────────────────

export function isOnboardingComplete(status: OnboardingStatus): boolean {
  return status.completed_steps.includes('complete')
    || STEP_ORDER.slice(0, -1).every((s) => status.completed_steps.includes(s));
}

// ── getOnboardingStatus ───────────────────────────────────────────────────────

export async function getOnboardingStatus(
  siteId: string,
  db:     OnboardingDb,
): Promise<OnboardingStatus | null> {
  try {
    const { data: site } = await db
      .from('sites')
      .select('extra_data')
      .eq('id', siteId)
      .single();

    if (!site) return null;

    const extraData = site.extra_data as Record<string, unknown> | null;
    if (!extraData?.onboarding) return null;

    return extraData.onboarding as OnboardingStatus;
  } catch {
    return null;
  }
}

// ── updateOnboardingStep ──────────────────────────────────────────────────────

export async function updateOnboardingStep(
  siteId: string,
  step:   OnboardingStep,
  data:   Partial<OnboardingStatus> | undefined,
  db:     OnboardingDb,
): Promise<void> {
  try {
    // Read current state
    const { data: site } = await db
      .from('sites')
      .select('extra_data')
      .eq('id', siteId)
      .single();

    const extraData  = (site?.extra_data as Record<string, unknown>) ?? {};
    const onboarding = (extraData.onboarding as OnboardingStatus) ?? createInitialStatus(siteId);

    // Mark step complete
    if (!onboarding.completed_steps.includes(step)) {
      onboarding.completed_steps.push(step);
    }

    // Apply partial data overrides
    if (data) {
      if (data.shopify_connected !== undefined) onboarding.shopify_connected = data.shopify_connected;
      if (data.gsc_connected     !== undefined) onboarding.gsc_connected     = data.gsc_connected;
      if (data.first_crawl_done  !== undefined) onboarding.first_crawl_done  = data.first_crawl_done;
      if (data.issues_found      !== undefined) onboarding.issues_found      = data.issues_found;
    }

    // Advance current_step
    onboarding.current_step = getNextStep(onboarding);
    onboarding.updated_at   = new Date().toISOString();

    extraData.onboarding = onboarding;
    await db.from('sites').update({ extra_data: extraData }).eq('id', siteId);
  } catch { /* non-fatal */ }
}
