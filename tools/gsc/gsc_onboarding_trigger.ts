/**
 * tools/gsc/gsc_onboarding_trigger.ts
 *
 * Fire-and-forget GSC onboarding trigger.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GSCOnboardingResult {
  site_id:  string;
  domain:   string;
  success:  boolean;
  message:  string;
}

export interface GSCOnboardingTriggerDeps {
  onboardFn?: (site_id: string, domain: string, platform: string) => Promise<GSCOnboardingResult>;
  logFn?:     (message: string, data?: unknown) => void;
}

// ── Default stubs ─────────────────────────────────────────────────────────────

function defaultOnboard(site_id: string, domain: string, _platform: string): Promise<GSCOnboardingResult> {
  return Promise.resolve({
    site_id,
    domain,
    success: true,
    message: 'GSC onboarding initiated',
  });
}

function defaultLog(message: string, _data?: unknown): void {
  try {
    process.stderr.write(`[gsc-onboarding] ${message}\n`);
  } catch {
    // silent
  }
}

// ── triggerGSCOnboarding ──────────────────────────────────────────────────────

export async function triggerGSCOnboarding(
  site_id: string,
  domain: string,
  platform: 'shopify' | 'wordpress',
  deps?: GSCOnboardingTriggerDeps,
): Promise<void> {
  try {
    const onboardFn = deps?.onboardFn ?? defaultOnboard;
    const logFn     = deps?.logFn     ?? defaultLog;

    const result = await onboardFn(site_id, domain, platform);

    try {
      logFn(`GSC onboarding ${result.success ? 'succeeded' : 'failed'} for site ${site_id}`, result);
    } catch {
      // never let log failure propagate
    }
  } catch {
    // fully fire-and-forget safe — never throws
  }
}
