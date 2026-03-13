/**
 * tools/onboarding/onboarding_progress.ts
 *
 * Client onboarding progress tracker.
 * Shows clients exactly where they are in setup.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type StepStatus = 'complete' | 'in_progress' | 'pending' | 'blocked';

export interface OnboardingStep {
  id:            string;
  label:         string;
  description:   string;
  status:        StepStatus;
  completed_at:  string | null;
  action_url:    string | null;
  action_label:  string | null;
  required:      boolean;
  platform:      'shopify' | 'wordpress' | 'both';
}

export interface OnboardingProgress {
  site_id:                      string;
  platform:                     'shopify' | 'wordpress';
  steps:                        OnboardingStep[];
  total_steps:                  number;
  completed_steps:              number;
  percent_complete:             number;
  current_step:                 OnboardingStep | null;
  is_complete:                  boolean;
  estimated_minutes_remaining:  number;
  started_at:                   string | null;
  completed_at:                 string | null;
}

export interface OnboardingProgressDeps {
  loadSiteFn?:  (site_id: string) => Promise<{ oauth_token?: string; gsc_connected?: boolean } | null>;
  loadCrawlFn?: (site_id: string) => Promise<{ crawl_count: number } | null>;
  loadFixesFn?: (site_id: string) => Promise<{ fix_count: number } | null>;
  loadEventFn?: (site_id: string, event_type: string) => Promise<boolean>;
}

// ── Step templates ───────────────────────────────────────────────────────────

function makeStep(partial: Partial<OnboardingStep> & { id: string; label: string; description: string; platform: OnboardingStep['platform'] }): OnboardingStep {
  return {
    status:       'pending',
    completed_at: null,
    action_url:   null,
    action_label: null,
    required:     true,
    ...partial,
  };
}

export const SHOPIFY_ONBOARDING_STEPS: OnboardingStep[] = [
  makeStep({
    id: 'install_app', label: 'Install VAEO',
    description: 'Install the VAEO app from the Shopify App Store',
    platform: 'shopify',
  }),
  makeStep({
    id: 'oauth_connect', label: 'Connect Your Store',
    description: 'Authorize VAEO to access your store data',
    action_url: '/api/shopify/auth', action_label: 'Connect Store',
    platform: 'shopify',
  }),
  makeStep({
    id: 'first_crawl', label: 'Scan Your Store',
    description: 'VAEO is scanning your store for SEO issues. This takes 2-5 minutes.',
    platform: 'shopify',
  }),
  makeStep({
    id: 'review_issues', label: 'Review Issues Found',
    description: 'See what VAEO found and what it will fix automatically',
    action_label: 'View Issues', required: false,
    platform: 'shopify',
  }),
  makeStep({
    id: 'first_fix_run', label: 'First Fix Run Complete',
    description: 'VAEO has applied your first round of SEO fixes',
    platform: 'shopify',
  }),
  makeStep({
    id: 'gsc_connected', label: 'Connect Google Search Console',
    description: 'See your real keyword rankings alongside your fixes',
    action_url: '/api/gsc/onboard', action_label: 'Connect GSC', required: false,
    platform: 'shopify',
  }),
  makeStep({
    id: 'setup_complete', label: 'Setup Complete',
    description: 'VAEO is running on autopilot. Fixes apply nightly.',
    platform: 'shopify',
  }),
];

export const WORDPRESS_ONBOARDING_STEPS: OnboardingStep[] = [
  makeStep({
    id: 'connect_wordpress', label: 'Connect WordPress',
    description: 'Enter your WordPress site URL and application password',
    action_url: '/onboard/wordpress', action_label: 'Connect Site',
    platform: 'wordpress',
  }),
  makeStep({
    id: 'plugin_conflict_check', label: 'Plugin Conflict Check',
    description: 'VAEO checks for conflicting SEO plugins on your site',
    platform: 'wordpress',
  }),
  makeStep({
    id: 'first_crawl', label: 'Scan Your Site',
    description: 'VAEO is scanning your site for SEO issues. This takes 2-5 minutes.',
    platform: 'wordpress',
  }),
  makeStep({
    id: 'review_issues', label: 'Review Issues Found',
    description: 'See what VAEO found and what it will fix automatically',
    action_label: 'View Issues', required: false,
    platform: 'wordpress',
  }),
  makeStep({
    id: 'first_fix_run', label: 'First Fix Run Complete',
    description: 'VAEO has applied your first round of SEO fixes',
    platform: 'wordpress',
  }),
  makeStep({
    id: 'gsc_connected', label: 'Connect Google Search Console',
    description: 'See your real keyword rankings alongside your fixes',
    action_url: '/api/gsc/onboard', action_label: 'Connect GSC', required: false,
    platform: 'wordpress',
  }),
  makeStep({
    id: 'setup_complete', label: 'Setup Complete',
    description: 'VAEO is running on autopilot. Fixes apply nightly.',
    platform: 'wordpress',
  }),
];

// ── calculateProgress ────────────────────────────────────────────────────────

export function calculateProgress(
  steps: OnboardingStep[],
  site_id: string = '',
  platform: 'shopify' | 'wordpress' = 'shopify',
): OnboardingProgress {
  try {
    const safe = steps ?? [];
    const total = safe.length;
    const completed = safe.filter(s => s.status === 'complete').length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const current = safe.find(s => s.status === 'in_progress')
      ?? safe.find(s => s.status === 'pending')
      ?? null;

    const requiredSteps = safe.filter(s => s.required);
    const allRequiredComplete = requiredSteps.every(s => s.status === 'complete');

    const pendingRequired = requiredSteps.filter(s => s.status !== 'complete').length;
    const estimatedMinutes = pendingRequired * 2;

    const completedTimestamps = safe
      .filter(s => s.completed_at)
      .map(s => s.completed_at!);
    const started = completedTimestamps.length > 0
      ? completedTimestamps.sort()[0]
      : null;

    const lastComplete = safe[safe.length - 1];
    const completedAt = allRequiredComplete && lastComplete?.status === 'complete'
      ? lastComplete.completed_at
      : null;

    return {
      site_id,
      platform,
      steps: safe,
      total_steps: total,
      completed_steps: completed,
      percent_complete: percent,
      current_step: current,
      is_complete: allRequiredComplete,
      estimated_minutes_remaining: estimatedMinutes,
      started_at: started,
      completed_at: completedAt,
    };
  } catch {
    return emptyProgress(site_id, platform);
  }
}

// ── loadOnboardingProgress ───────────────────────────────────────────────────

export async function loadOnboardingProgress(
  site_id: string,
  platform: 'shopify' | 'wordpress',
  deps?: OnboardingProgressDeps,
): Promise<OnboardingProgress> {
  try {
    const loadSite  = deps?.loadSiteFn  ?? defaultLoadSite;
    const loadCrawl = deps?.loadCrawlFn ?? defaultLoadCrawl;
    const loadFixes = deps?.loadFixesFn ?? defaultLoadFixes;
    const loadEvent = deps?.loadEventFn ?? defaultLoadEvent;

    const [site, crawl, fixes] = await Promise.all([
      loadSite(site_id),
      loadCrawl(site_id),
      loadFixes(site_id),
    ]);

    const template = platform === 'wordpress'
      ? WORDPRESS_ONBOARDING_STEPS
      : SHOPIFY_ONBOARDING_STEPS;

    const now = new Date().toISOString();
    const steps = template.map(s => ({ ...s }));

    for (const step of steps) {
      switch (step.id) {
        case 'install_app':
        case 'connect_wordpress':
          if (site) { step.status = 'complete'; step.completed_at = now; }
          break;
        case 'oauth_connect':
          if (site?.oauth_token) { step.status = 'complete'; step.completed_at = now; }
          break;
        case 'plugin_conflict_check':
          if (site) { step.status = 'complete'; step.completed_at = now; }
          break;
        case 'first_crawl':
          if (crawl && crawl.crawl_count > 0) { step.status = 'complete'; step.completed_at = now; }
          break;
        case 'review_issues': {
          const viewed = await loadEvent(site_id, 'issues_viewed');
          if (viewed) { step.status = 'complete'; step.completed_at = now; }
          break;
        }
        case 'first_fix_run':
          if (fixes && fixes.fix_count > 0) { step.status = 'complete'; step.completed_at = now; }
          break;
        case 'gsc_connected':
          if (site?.gsc_connected) { step.status = 'complete'; step.completed_at = now; }
          break;
        case 'setup_complete':
          if (fixes && fixes.fix_count > 0) { step.status = 'complete'; step.completed_at = now; }
          break;
      }
    }

    // Set first non-complete step to in_progress
    for (const step of steps) {
      if (step.status !== 'complete') {
        step.status = 'in_progress';
        break;
      }
    }

    // Set action_url for review_issues dynamically
    for (const step of steps) {
      if (step.id === 'review_issues' && !step.action_url) {
        step.action_url = `/client/${site_id}`;
      }
    }

    return calculateProgress(steps, site_id, platform);
  } catch {
    return emptyProgress(site_id, platform);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyProgress(site_id: string, platform: 'shopify' | 'wordpress'): OnboardingProgress {
  return {
    site_id,
    platform,
    steps: [],
    total_steps: 0,
    completed_steps: 0,
    percent_complete: 0,
    current_step: null,
    is_complete: false,
    estimated_minutes_remaining: 0,
    started_at: null,
    completed_at: null,
  };
}

async function defaultLoadSite(_id: string) { return null; }
async function defaultLoadCrawl(_id: string) { return null; }
async function defaultLoadFixes(_id: string) { return null; }
async function defaultLoadEvent(_id: string, _type: string) { return false; }
